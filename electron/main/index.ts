import { mkdir } from "node:fs/promises";
import path from "node:path";

import path from "node:path";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  systemPreferences,
  Tray,
} from "electron";
import { logger, type LoggerProps } from "../../src/lib/logger";
import { createSessionLifecycleBackend } from "../../src/backend";
import { createListAiProviderModelsUseCase } from "../../src/backend/application/use-cases/list-ai-provider-models";
import { createSecretStore } from "../../src/backend/infrastructure/config/secretStore";
import { registerSessionLifecycleIpc } from "../../src/backend/infrastructure/ipc/register-session-lifecycle-ipc";
import { registerRecordingIpc } from "../../src/backend/infrastructure/ipc/register-recording-ipc";
import { createRecordingPersistenceService } from "../../src/backend/infrastructure/recording/recording-persistence";
import { createRecordingExportService } from "../../src/backend/infrastructure/recording/recording-export";
import { createRecordingSandboxPersistenceService } from "../../src/backend/infrastructure/recording/recording-sandbox-persistence";
import { createSessionStorageLayoutResolver } from "../../src/backend/infrastructure/storage/session-storage-layout";
import { createAppConfigStore } from "../../src/backend/infrastructure/config/appConfigStore";
import { registerConfiguredGlobalShortcuts } from "../../src/backend/infrastructure/shortcuts/globalShortcuts.shortcuts";
import { APP_CONTROL_CHANNELS } from "../../src/shared/app-controls";
import {
  CAPTURE_OPTIONS_CHANNELS,
  CAPTURE_OPTIONS_EVENT_CHANNELS,
  normalizeCaptureOptionsConfig,
  type CaptureOptionsConfig,
  type CaptureDisplaySnapshot,
  type CapturePermissionSnapshot,
} from "../../src/shared/capture-options";
import { SESSION_LIFECYCLE_EVENT_CHANNELS } from "../../src/backend/infrastructure/ipc/session-lifecycle-channels";
import { RECORDING_CHANNELS, RECORDING_EVENT_CHANNELS } from "../../src/backend/infrastructure/ipc/recording-channels";
import {
  AI_PROVIDER_CHANNELS,
  normalizeAiProvider,
  normalizeAiProviderConfig,
  normalizeSetAiProviderApiKeyRequest,
} from "../../src/shared/ai-provider";
import {
  clampWindowSize,
  parseMoveWindowByRequest,
  parseSetAlwaysOnTopRequest,
  parseSetPinnedRequest,
  parseSetWindowSizePresetRequest,
  parseSetWindowSizeRequest,
  WINDOW_CONTROL_CHANNELS,
  WINDOW_CONTROL_EVENT_CHANNELS,
  parseResizeWindowByRequest,
} from "../../src/shared/window-controls";
import type { MediaChunkSource, SessionSnapshot } from "../../src/shared/session-lifecycle";
import {
  SHORTCUTS_IPC_CHANNELS,
  DEFAULT_RECORDING_CAPTURE_SOURCES,
  normalizeSetShortcutEnabledRequest,
} from "../../src/shared/shortcuts";
import type { SessionLifecycleController } from "../../src/backend/interfaces/controllers/session-lifecycle-controller";
import {
  WINDOW_REGISTRY_CHANNELS,
  WINDOW_REGISTRY_EVENT_CHANNELS,
  WINDOW_ROLES,
  type CardWindowsOpenState,
  type CardWindowRole,
  isCardWindowRole,
} from "../../src/shared/window-registry";
import { createMonitorPickerController } from "./monitor-picker";
import { applyOptionsWindowOpenBounds, createWindowBoundsSnapshot, getClampedWindowPositionForSize, getMinimumWindowSize, getWindowSizeForPreset, publishWindowBounds } from "../electron-utils";

const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5180'; // TODO: fix handling of this env variable

const pipelineOrchestrationMode =
  process.env.PIPELINE_ORCHESTRATOR === "langchain" ? "langchain" : "built-in"; // slop code
export const MAIN_WINDOW_MIN_WIDTH = 600;
export const MAIN_WINDOW_MIN_HEIGHT = 104;
const MAIN_WINDOW_DEFAULT_WIDTH = 700;
const MAIN_WINDOW_DEFAULT_HEIGHT = 112;
const log: Pick<typeof logger, "ger"> = {
  ger(entry: LoggerProps): void {
    logger.ger({
      ...entry,
      source: __filename,
    });
  },
};
const listAiProviderModels = createListAiProviderModelsUseCase({
  fetch: globalThis.fetch,
});

function buildCaptureSourcesFromConfig(
  config: CaptureOptionsConfig,
): readonly MediaChunkSource[] {
  const sources: MediaChunkSource[] = [];
  const hasUnifiedDesktopCapture =
    config.screen.enabled && config.systemAudio.enabled;

  if (config.microphone.enabled) {
    sources.push("microphone");
  }

  if (config.webcam.enabled) {
    sources.push("webcam");
  }

  if (hasUnifiedDesktopCapture) {
    sources.push("desktop-capture");
  } else if (config.systemAudio.enabled) {
    sources.push("system-audio");
  }

  if (config.screen.enabled && !hasUnifiedDesktopCapture) {
    sources.push("screen-video");
  }

  if (config.screenshot.enabled) {
    sources.push("screenshot");
  }

  return sources.length > 0 ? sources : DEFAULT_RECORDING_CAPTURE_SOURCES;
}

function publishToAllWindows(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue;
    }
    const contents = window.webContents;
    if (contents.isDestroyed()) {
      continue;
    }
    try {
      contents.send(channel, payload);
    } catch {
      // Window may be closing; ignore send failures.
    }
  }
}

function createWindowBoundsSnapshot(
  window: BrowserWindow,
): WindowBoundsSnapshot {
  const bounds = window.getBounds();
  const [rawMinWidth, rawMinHeight] = window.getMinimumSize();
  const minWidth = rawMinWidth > 0 ? rawMinWidth : MAIN_WINDOW_MIN_WIDTH;
  const minHeight = rawMinHeight > 0 ? rawMinHeight : MAIN_WINDOW_MIN_HEIGHT;

  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth,
    minHeight,
  };
}

function getMinimumWindowSize(window: BrowserWindow): {
  readonly width: number;
  readonly height: number;
} {
  const [rawMinWidth, rawMinHeight] = window.getMinimumSize();

  return {
    width: rawMinWidth > 0 ? rawMinWidth : MAIN_WINDOW_MIN_WIDTH,
    height: rawMinHeight > 0 ? rawMinHeight : MAIN_WINDOW_MIN_HEIGHT,
  };
}

function getWindowSizeForPreset(
  window: BrowserWindow,
  preset: WindowSizePreset,
): {
  readonly width: number;
  readonly height: number;
} {
  const display = screen.getDisplayMatching(window.getBounds());
  const { width: workAreaWidth, height: workAreaHeight } = display.workAreaSize;
  const minimumSize = getMinimumWindowSize(window);
  const [, currentHeight] = window.getSize();
  const isLauncher = getWindowRole(window) === WINDOW_ROLES.launcher;

  const widthRatio =
    preset === "50%" ? 0.5 : preset === "75%" ? 0.75 : 0.9;

  if (isLauncher) {
    return clampWindowSize(
      {
        width: Math.round(workAreaWidth * widthRatio),
        height: currentHeight,
      },
      minimumSize,
    );
  }

  switch (preset) {
    case "50%":
      return clampWindowSize(
        {
          width: Math.round(workAreaWidth * 0.5),
          height: Math.round(workAreaHeight * 0.5),
        },
        minimumSize,
      );
    case "75%":
      return clampWindowSize(
        {
          width: Math.round(workAreaWidth * 0.75),
          height: Math.round(workAreaHeight * 0.75),
        },
        minimumSize,
      );
    case "90%":
      return clampWindowSize(
        {
          width: Math.round(workAreaWidth * 0.9),
          height: Math.round(workAreaHeight * 0.9),
        },
        minimumSize,
      );
  }
}

function getClampedWindowPositionForSize(
  window: BrowserWindow,
  size: {
    readonly width: number;
    readonly height: number;
  },
): {
  readonly x: number;
  readonly y: number;
} {
  const display = screen.getDisplayMatching(window.getBounds());
  const { x, y, width, height } = display.workArea;
  const [currentX, currentY] = window.getPosition();
  const maxX = Math.max(x, x + width - size.width);
  const maxY = Math.max(y, y + height - size.height);

  return {
    x: Math.min(Math.max(currentX, x), maxX),
    y: Math.min(Math.max(currentY, y), maxY),
  };
}

function getClampedPositionWithinBounds(
  bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
  size: {
    readonly width: number;
    readonly height: number;
  },
  preferredPosition: {
    readonly x: number;
    readonly y: number;
  },
): {
  readonly x: number;
  readonly y: number;
} {
  const maxX = Math.max(bounds.x, bounds.x + bounds.width - size.width);
  const maxY = Math.max(bounds.y, bounds.y + bounds.height - size.height);

  return {
    x: Math.min(Math.max(preferredPosition.x, bounds.x), maxX),
    y: Math.min(Math.max(preferredPosition.y, bounds.y), maxY),
  };
}

function applyOptionsWindowOpenBounds(
  window: BrowserWindow,
  anchorBounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
): void {
  const display = screen.getDisplayMatching(
    anchorBounds ?? window.getBounds(),
  );
  const minimumSize = getMinimumWindowSize(window);
  const targetSize = clampWindowSize(
    {
      width: 560,
      height: 640,
    },
    minimumSize,
  );
  const targetPosition = getClampedPositionWithinBounds(
    display.bounds,
    targetSize,
    anchorBounds
      ? {
        x: anchorBounds.x,
        y: anchorBounds.y + 100,
      }
      : {
        x: display.bounds.x,
        y: display.bounds.y,
      },
  );

  window.setBounds({
    x: targetPosition.x,
    y: targetPosition.y,
    width: targetSize.width,
    height: targetSize.height,
  });
}

function publishWindowBounds(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return;
  }
  const contents = window.webContents;
  if (contents.isDestroyed()) {
    return;
  }
  try {
    contents.send(
      WINDOW_CONTROL_EVENT_CHANNELS.boundsChanged,
      createWindowBoundsSnapshot(window),
    );
  } catch {
    // Ignore if the window is tearing down.
  }
}

function publishAlwaysOnTop(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return;
  }

  const contents = window.webContents;
  if (contents.isDestroyed()) {
    return;
  }

  try {
    contents.send(
      WINDOW_CONTROL_EVENT_CHANNELS.alwaysOnTopChanged,
      window.isAlwaysOnTop(),
    );
  } catch {
    // Ignore if the window is tearing down.
  }
}

function publishPinned(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    log.ger({
      type: "debug",
      message: "[window publishPinned] window is destroyed",
      data: {
        window,
      },
    });
    return;
  }

  const contents = window.webContents;
  if (contents.isDestroyed()) {
    return;
  }

  try {
    contents.send(
      WINDOW_CONTROL_EVENT_CHANNELS.pinnedChanged,
      isWindowPinned(window),
    );
  } catch {
    // Ignore if the window is tearing down.
  }
}

const roleByWebContentsId = new Map<number, string>();
const pinnedByWebContentsId = new Map<number, boolean>();
const cardWindows = new Map<CardWindowRole, BrowserWindow>();
let isQuitting = false;

/** Set after tray sync is defined so every app window can refresh the tray menu on show/hide. */
let syncTrayMenuRef: (() => void) | null = null;

export function getWindowRole(window: BrowserWindow): string | undefined {
  return roleByWebContentsId.get(window.webContents.id);
}

function isWindowPinned(window: BrowserWindow): boolean {
  return pinnedByWebContentsId.get(window.webContents.id) ?? false;
}

function setWindowPinned(window: BrowserWindow, pinned: boolean): boolean {
  const webContentsId = window.webContents.id;
  pinnedByWebContentsId.set(webContentsId, pinned);
  window.setMovable(!pinned);
  publishPinned(window);
  return pinned;
}

function isCardWindowOpen(role: CardWindowRole): boolean {
  const target = cardWindows.get(role);
  return Boolean(target && !target.isDestroyed() && target.isVisible());
}

function getCardOpenState(): CardWindowsOpenState {
  return {
    openIds: {
      controls: isCardWindowOpen("controls"),
      options: isCardWindowOpen("options"),
      sandbox: isCardWindowOpen("sandbox"),
      "question-box": isCardWindowOpen("question-box"),
      "speech-box": isCardWindowOpen("speech-box"),
    },
  };
}

function broadcastCardWindowOpenState(): void {
  publishToAllWindows(
    WINDOW_REGISTRY_EVENT_CHANNELS.openStateChanged,
    getCardOpenState(),
  );
}

function registerWindowBoundsListeners(window: BrowserWindow): void {
  window.on("move", () => {
    publishWindowBounds(window);
  });
  window.on("resize", () => {
    publishWindowBounds(window);
  });
  window.webContents.on("did-finish-load", () => {
    publishWindowBounds(window);
  });
}

function createWindow(
  role: typeof WINDOW_ROLES[keyof typeof WINDOW_ROLES],
  anchorBounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
): BrowserWindow {
  const preloadPath = path.join(__dirname, "../preload/index.js");

  const isLauncher = role === WINDOW_ROLES.launcher;

  const browserWindow = new BrowserWindow({
    width: isLauncher ? MAIN_WINDOW_DEFAULT_WIDTH : 520,
    height: isLauncher ? MAIN_WINDOW_DEFAULT_HEIGHT : 640,
    minWidth: isLauncher ? MAIN_WINDOW_MIN_WIDTH : 320,
    minHeight: isLauncher ? MAIN_WINDOW_MIN_HEIGHT : 240,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: true,
    show: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: true,
    focusable: true,
    movable: true,
    x: isLauncher ? 0 : 40,
    y: isLauncher ? 100 : 140,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: true,
      sandbox: false,
    },
  });

  const webContentsId = browserWindow.webContents.id;
  roleByWebContentsId.set(webContentsId, role);
  pinnedByWebContentsId.set(webContentsId, false);
  log.ger({
    type: "debug",
    message: "[window createWindow] created",
    data: {
      role,
      webContentsId,
    },
  });

  browserWindow.on("close", (event) => {
    log.ger({
      type: "debug",
      message: "[window close] requested",
      data: {
        role,
        webContentsId,
        isLauncher,
        isQuitting,
      },
    });
    if (isLauncher || isQuitting) {
      return;
    }

    event.preventDefault();
    if (!browserWindow.isDestroyed() && browserWindow.isVisible()) {
      browserWindow.hide();
    }
    broadcastCardWindowOpenState();
  });

  browserWindow.on("show", () => {
    log.ger({
      type: "debug",
      message: "[window show]",
      data: {
        role,
        webContentsId,
        bounds: browserWindow.getBounds(),
      },
    });
    if (!isLauncher) {
      broadcastCardWindowOpenState();
    }

    // Keep child windows visually associated with the launcher, but let
    // the options window expand to the active display when it opens.
    if (!isLauncher) {
      const launcher = BrowserWindow.getAllWindows().find(
        (window) => getWindowRole(window) === WINDOW_ROLES.launcher,
      );
      const launcherBounds =
        launcher && !launcher.isDestroyed() ? launcher.getBounds() : undefined;

      if (role === WINDOW_ROLES.options) {
        applyOptionsWindowOpenBounds(
          browserWindow,
          anchorBounds ?? launcherBounds,
        );
      } else if (launcherBounds) {
        browserWindow.setPosition(launcherBounds.x, launcherBounds.y + 100);
      }
    }
    // ensure we open the new window with its own developer tools opened.
    if (!isLauncher && devServerUrl) {
      browserWindow.webContents.openDevTools({ mode: "detach" });
    }

    publishAlwaysOnTop(browserWindow);
    publishPinned(browserWindow);
    syncTrayMenuRef?.();
  });

  browserWindow.on("hide", () => {
    log.ger({
      type: "debug",
      message: "[window hide]",
      data: {
        role,
        webContentsId,
      },
    });
    if (!isLauncher) {
      broadcastCardWindowOpenState();
    }
    publishAlwaysOnTop(browserWindow);
    publishPinned(browserWindow);
    syncTrayMenuRef?.();
  });

  browserWindow.on("closed", () => {
    log.ger({
      type: "debug",
      message: "[window closed]",
      data: {
        role,
        webContentsId,
      },
    });
    roleByWebContentsId.delete(webContentsId);
    pinnedByWebContentsId.delete(webContentsId);
    if (!isLauncher) {
      cardWindows.delete(role as CardWindowRole);
    }
    broadcastCardWindowOpenState();
  });

  registerWindowBoundsListeners(browserWindow);

  if (!isLauncher) {
    cardWindows.set(role as CardWindowRole, browserWindow);
  }

  const hash = role;
  if (devServerUrl) {
    void browserWindow.loadURL(`${devServerUrl}#${hash}`);
    if (isLauncher) {
      browserWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void browserWindow.loadFile(path.join(__dirname, "../../../dist/index.html"), {
      hash,
    });
  }

  browserWindow.once("ready-to-show", () => {
    if (browserWindow.isDestroyed()) {
      return;
    }

    log.ger({
      type: "debug",
      message: "[window ready-to-show]",
      data: {
        role,
        webContentsId,
      },
    });
    browserWindow.show();
    publishAlwaysOnTop(browserWindow);
    publishPinned(browserWindow);
    if (!isLauncher) {
      broadcastCardWindowOpenState();
    }
  });

  return browserWindow;
}

async function listCaptureDisplays(): Promise<readonly CaptureDisplaySnapshot[]> {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 0, height: 0 },
  });

  const sourceByDisplayId = new Map(
    sources
      .filter((source) => source.display_id)
      .map((source) => [source.display_id, source]),
  );
  const primaryDisplayId = String(screen.getPrimaryDisplay().id);

  return screen.getAllDisplays().map((display) => {
    const displayId = String(display.id);
    const source = sourceByDisplayId.get(displayId);

    return {
      displayId,
      label: display.label || source?.name || `Display ${displayId}`,
      isPrimary: displayId === primaryDisplayId,
      bounds: {
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
      },
      sourceId: source?.id,
    };
  });
}

function getPermissionStatus(kind: "microphone" | "camera" | "screen"): string {
  if (process.platform !== "darwin" && process.platform !== "win32") {
    return "unsupported";
  }

  try {
    return systemPreferences.getMediaAccessStatus(kind);
  } catch {
    return "unsupported";
  }
}

function getCapturePermissions(): CapturePermissionSnapshot {
  const microphone = getPermissionStatus("microphone");
  const camera = getPermissionStatus("camera");
  const screenPermission = getPermissionStatus("screen");

  return {
    microphone:
      microphone === "granted" ||
        microphone === "denied" ||
        microphone === "restricted" ||
        microphone === "not-determined"
        ? microphone
        : "unsupported",
    camera:
      camera === "granted" ||
        camera === "denied" ||
        camera === "restricted" ||
        camera === "not-determined"
        ? camera
        : "unsupported",
    screen:
      screenPermission === "granted" ||
        screenPermission === "denied" ||
        screenPermission === "restricted" ||
        screenPermission === "not-determined"
        ? screenPermission
        : "unsupported",
    systemAudio:
      screenPermission === "granted" ||
        screenPermission === "denied" ||
        screenPermission === "restricted" ||
        screenPermission === "not-determined"
        ? screenPermission
        : "unsupported",
  };
}

function createEmptyTrayIcon(): Electron.NativeImage {
  // 16x16 transparent PNG (base64). Tray requires an icon; this satisfies the "empty icon" requirement.
  const transparentPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAI0lEQVR42mNgGAWjYBSMglEwCkbAAQYGAwAAc7oKfJ6o0aQAAAAASUVORK5CYII=";

  return nativeImage.createFromBuffer(Buffer.from(transparentPngBase64, "base64"));
}

function createTrayMenu(args: {
  getWindowVisibilityLabel: () => string;
  onToggleVisibility: () => void;
  onExit: () => void;
}): Menu {
  const { getWindowVisibilityLabel, onToggleVisibility, onExit } = args;

  return Menu.buildFromTemplate([
    {
      label: getWindowVisibilityLabel(),
      click: () => onToggleVisibility(),
    },
    { type: "separator" },
    { label: "Exit", click: () => onExit() },
  ]);
}
async function initializeApp() {
  process.on("warning", (warning) => {
    console.warn("[electron warning]", warning);
    log.ger({
      type: "warn",
      message: `[process warning] ${warning.name}: ${warning.message}`,
      data: warning.stack,
    });
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[electron unhandledRejection]", reason);
    log.ger({
      type: "error",
      message: "[process unhandledRejection]",
      data: reason,
    });
  });

  process.on("uncaughtException", (error) => {
    console.error("[electron uncaughtException]", error);
    log.ger({
      type: "fatal",
      message: `[process uncaughtException] ${error.message}`,
      data: error.stack,
    });
  });

  app.whenReady().then(async () => {
    const mainWindow = createWindow(WINDOW_ROLES.launcher);
    log.ger({ type: "info", message: "[app createWindow]", data: mainWindow })
    mainWindow.focus();

    let currentSession: SessionSnapshot | null = null;
    let sessionLifecycleController: SessionLifecycleController | null = null;
    const appConfigStore = createAppConfigStore(app);
    const secretStore = createSecretStore(app);
    const monitorPicker = createMonitorPickerController({
      onSelectionChanged(displayId) {
        publishToAllWindows(
          CAPTURE_OPTIONS_EVENT_CHANNELS.selectedDisplayChanged,
          { displayId },
        );
      },
    });

    let tray: Tray | null = null;

    /** Which card windows were visible before a bulk hide (restore on bulk show). */
    let cardVisibilityBeforeBulkHide: Partial<
      Record<CardWindowRole, boolean>
    > | null = null;

    const collectAppWindows = (): BrowserWindow[] => {
      const windows: BrowserWindow[] = [];
      if (!mainWindow.isDestroyed()) {
        windows.push(mainWindow);
      }
      for (const w of cardWindows.values()) {
        if (!w.isDestroyed()) {
          windows.push(w);
        }
      }
      return windows;
    };

    const anyAppWindowVisible = (): boolean =>
      collectAppWindows().some((w) => w.isVisible());

    const captureCardVisibilitySnapshot = (): Partial<
      Record<CardWindowRole, boolean>
    > => {
      const cards: Partial<Record<CardWindowRole, boolean>> = {};
      for (const [role, w] of cardWindows) {
        if (!w.isDestroyed()) {
          cards[role] = w.isVisible();
        }
      }
      return cards;
    };

    const toggleVisibility = () => {
      if (anyAppWindowVisible()) {
        log.ger({ type: "info", message: "[app toggleVisibility] hide" });
        cardVisibilityBeforeBulkHide = captureCardVisibilitySnapshot();
        log.ger({ type: 'debug', message: '[app toggleVisibility] cardVisibilityBeforeBulkHide', data: { cardVisibilityBeforeBulkHide } });
        if (monitorPicker.isOpen()) {
          monitorPicker.close();
        }
        for (const w of collectAppWindows()) {
          if (w.isDestroyed()) {
            continue;
          }
          try {
            if (w.isVisible()) {
              w.hide();
            }
          } catch (error) {
            log.ger({
              type: "warn",
              message: "[app toggleVisibility] hide failed for a window",
              data: error,
            });
          }
        }
      } else {
        log.ger({ type: "info", message: "[app toggleVisibility] show" });
        const snapshot = cardVisibilityBeforeBulkHide;
        cardVisibilityBeforeBulkHide = null;
        if (snapshot) {
          for (const [role, w] of cardWindows) {
            if (w.isDestroyed()) {
              continue;
            }
            if (snapshot[role]) {
              try {
                w.show();
              } catch (error) {
                log.ger({
                  type: "warn",
                  message: `[app toggleVisibility] show card ${role} failed`,
                  data: error,
                });
              }
            }
          }
        } else {
          for (const w of collectAppWindows()) {
            if (w.isDestroyed()) {
              continue;
            }
            try {
              w.show();
            } catch (error) {
              log.ger({
                type: "warn",
                message: "[app toggleVisibility] show (fallback) failed",
                data: error,
              });
            }
          }
        }
        if (!mainWindow.isDestroyed()) {
          try {
            mainWindow.show();
            mainWindow.focus();
          } catch (error) {
            log.ger({
              type: "warn",
              message: "[app toggleVisibility] show main failed",
              data: error,
            });
          }
        }
      }
      syncTrayMenu();
    };

    const syncTrayMenu = () => {
      if (!tray) {
        return;
      }

      const label = anyAppWindowVisible()
        ? "Hide overlay"
        : "Show overlay";

      tray.setContextMenu(
        createTrayMenu({
          getWindowVisibilityLabel: () => label,
          onToggleVisibility: toggleVisibility,
          onExit: () => app.quit(),
        }),
      );
    };

    syncTrayMenuRef = syncTrayMenu;

    tray = new Tray(createEmptyTrayIcon());
    syncTrayMenu();
    tray.on("click", toggleVisibility);

    ipcMain.handle(APP_CONTROL_CHANNELS.closeApplication, () => {
      monitorPicker.close();
      app.quit();
    });


    ipcMain.handle(APP_CONTROL_CHANNELS.toggleVisibility, async () => {
      toggleVisibility();
    });

    ipcMain.handle(WINDOW_REGISTRY_CHANNELS.getContext, (event) => {
      const role = roleByWebContentsId.get(event.sender.id);
      if (!role) {
        log.ger({ type: "error", message: "[app WINDOW_REGISTRY_CHANNELS.getContext] Unable to resolve window role." })
        throw new Error("Unable to resolve window role.");
      }
      return { role };
    });

    ipcMain.handle(WINDOW_REGISTRY_CHANNELS.getOpenState, () => {
      return getCardOpenState();
    });

    ipcMain.handle(WINDOW_REGISTRY_CHANNELS.openWindow, (_event, input: unknown) => {
      if (typeof input !== "string" || !isCardWindowRole(input)) {
        throw new Error("Invalid card window role.");
      }
      const webContents = BrowserWindow.fromWebContents(_event.sender);
      const windowBounds = webContents?.getBounds();
      log.ger({
        type: "debug",
        message: "[windowRegistry openWindow] requested",
        data: {
          role: input,
          currentlyOpen: isCardWindowOpen(input),
          event: _event
        },
      });
      // log.ger({ type: 'debug', message: '[windowRegistry openWindow] webContents', data: { webContents } });
      // log.ger({ type: 'debug', message: '[windowRegistry openWindow] cardWindows', data: { cardWindows } });
      // log.ger({ type: 'debug', message: '[windowRegistry openWindow] windowBounds', data: { windowBounds } });
      const existing = cardWindows.get(input);
      if (existing && !existing.isDestroyed()) {
        try {
          if (input === WINDOW_ROLES.options) {
            applyOptionsWindowOpenBounds(existing, windowBounds);
          }
          if (!existing.isVisible()) {
            existing.show();
          }
          existing.focus();
        } catch (error) {
          log.ger({
            type: "warn",
            message: `[windowRegistry openWindow] unable to reuse ${input} window`,
            data: error,
          });
        }
        broadcastCardWindowOpenState();
        return;
      }
      createWindow(input, windowBounds);
    });

    ipcMain.handle(WINDOW_REGISTRY_CHANNELS.closeWindow, (_event, input: unknown) => {
      if (typeof input !== "string" || !isCardWindowRole(input)) {
        throw new Error("Invalid card window role.");
      }
      log.ger({
        type: "debug",
        message: "[windowRegistry closeWindow] requested",
        data: {
          role: input,
          currentlyOpen: isCardWindowOpen(input),
        },
      });
      const target = cardWindows.get(input);
      if (target && !target.isDestroyed()) {
        try {
          if (target.isVisible()) {
            target.hide();
          }
        } catch (error) {
          log.ger({
            type: "warn",
            message: `[windowRegistry closeWindow] unable to hide ${input} window`,
            data: error,
          });
        }
        broadcastCardWindowOpenState();
      }
    });

    ipcMain.handle(WINDOW_REGISTRY_CHANNELS.focusWindow, (_event, input: unknown) => {
      if (typeof input !== "string" || !isCardWindowRole(input)) {
        throw new Error("Invalid card window role.");
      }
      const target = cardWindows.get(input);
      if (target && !target.isDestroyed()) {
        try {
          target.focus();
        } catch (error) {
          log.ger({
            type: "warn",
            message: `[windowRegistry focusWindow] unable to focus ${input} window`,
            data: error,
          });
        }
      }
    });

    ipcMain.handle(SHORTCUTS_IPC_CHANNELS.ensureConfig, async () => {
      await appConfigStore.ensureConfigExists();
    });

    ipcMain.handle(SHORTCUTS_IPC_CHANNELS.getConfig, async () => {
      return appConfigStore.loadShortcutsConfig();
    });

    ipcMain.handle(
      SHORTCUTS_IPC_CHANNELS.setShortcutEnabled,
      async (_event, input: unknown) => {
        const request = normalizeSetShortcutEnabledRequest(input);
        await appConfigStore.updateShortcutEnabled({
          shortcutId: request.shortcutId,
          enabled: request.enabled,
        });

        const updatedConfig = await appConfigStore.loadShortcutsConfig();

        if (sessionLifecycleController) {
          await registerConfiguredGlobalShortcuts({
            config: updatedConfig,
            mainWindow,
            controller: sessionLifecycleController,
            getCurrentSession: () => currentSession,
            getCaptureSources: async () => {
              const captureOptions = await appConfigStore.loadCaptureOptionsConfig();
              return buildCaptureSourcesFromConfig(captureOptions);
            },
          });
        }
      },
    );

    ipcMain.handle(CAPTURE_OPTIONS_CHANNELS.getConfig, async () => {
      return appConfigStore.loadCaptureOptionsConfig();
    });

    ipcMain.handle(AI_PROVIDER_CHANNELS.getConfig, async () => {
      return appConfigStore.loadAiProviderConfig();
    });

    ipcMain.handle(AI_PROVIDER_CHANNELS.setConfig, async (_event, input: unknown) => {
      const config = normalizeAiProviderConfig(input);
      return appConfigStore.saveAiProviderConfig(config);
    });

    ipcMain.handle(AI_PROVIDER_CHANNELS.getApiKey, async (_event, input: unknown) => {
      const provider = normalizeAiProvider(input);
      const apiKey = await secretStore.getApiKey(provider);

      return {
        hasKey: typeof apiKey === "string" && apiKey.trim().length > 0,
      };
    });

    ipcMain.handle(AI_PROVIDER_CHANNELS.setApiKey, async (_event, input: unknown) => {
      const request = normalizeSetAiProviderApiKeyRequest(input);
      const didStoreApiKey = await secretStore.setApiKey(request.provider, request.key);

      if (!didStoreApiKey) {
        throw new Error("Secure storage is unavailable; API key could not be saved.");
      }
    });

    ipcMain.handle(
      AI_PROVIDER_CHANNELS.deleteApiKey,
      async (_event, input: unknown) => {
        const provider = normalizeAiProvider(input);
        await secretStore.deleteApiKey(provider);
      },
    );

    ipcMain.handle(AI_PROVIDER_CHANNELS.listModels, async (_event, input: unknown) => {
      const provider = normalizeAiProvider(input);
      const apiKey = await secretStore.getApiKey(provider);

      if (!apiKey) {
        throw new Error(`No API key is configured for provider '${provider}'.`);
      }

      return listAiProviderModels({
        provider,
        apiKey,
      });
    });

    ipcMain.handle(CAPTURE_OPTIONS_CHANNELS.setConfig, async (_event, input) => {
      const config = normalizeCaptureOptionsConfig(input);
      return appConfigStore.saveCaptureOptionsConfig(config);
    });

    ipcMain.handle(CAPTURE_OPTIONS_CHANNELS.listDisplays, async () => {
      return listCaptureDisplays();
    });

    ipcMain.handle(CAPTURE_OPTIONS_CHANNELS.getPermissions, async () => {
      return getCapturePermissions();
    });

    ipcMain.handle(
      CAPTURE_OPTIONS_CHANNELS.openMonitorPicker,
      async (_event, input) => {
        let selectedDisplayId: string | undefined;
        if (typeof input === "object" && input !== null) {
          const candidate = (input as Record<string, unknown>).selectedDisplayId;
          log.ger({ type: "debug", message: "[app CAPTURE_OPTIONS_CHANNELS.openMonitorPicker] candidate", data: candidate })
          if (typeof candidate === "string" && candidate.trim().length > 0) {
            selectedDisplayId = candidate.trim();
          }
        }

        const resolvedDisplayId = monitorPicker.open({ selectedDisplayId });
        return { displayId: resolvedDisplayId };
      },
    );

    ipcMain.handle(CAPTURE_OPTIONS_CHANNELS.closeMonitorPicker, async () => {
      monitorPicker.close();
    });

    // WASM Threading (threaded mode — disabled by default)
    // ─────────────────────────────────────────────────────
    // Uncomment the block below AND the server.headers block in vite.config.ts
    // to inject COOP/COEP headers required by SharedArrayBuffer / multi-threaded
    // ONNX WASM. Also set numThreads > 1 in src/renderer/workers/transformers-env.ts.
    //
    // mainWindow.webContents.session.webRequest.onHeadersReceived(
    //   (details, callback) => {
    //     callback({
    //       responseHeaders: {
    //         ...details.responseHeaders,
    //         'Cross-Origin-Opener-Policy': ['same-origin'],
    //         'Cross-Origin-Embedder-Policy': ['require-corp'],
    //       },
    //     });
    //   },
    // );

    mainWindow.webContents.session.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        const captureOptions = await appConfigStore.loadCaptureOptionsConfig();
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 0, height: 0 },
        });
        const selectedSource =
          sources.find(
            (source) => source.display_id === captureOptions.display.displayId,
          ) ?? sources[0];

        if (!selectedSource) {
          callback({});
          return;
        }

        callback({
          video: selectedSource,
          audio: captureOptions.systemAudio.enabled ? "loopback" : undefined,
        });
      },
      { useSystemPicker: false },
    );

    app.on("before-quit", () => {
      isQuitting = true;
    });

    app.on("will-quit", () => {
      monitorPicker.close();
      globalShortcut.unregisterAll();
    });

    ipcMain.on(WINDOW_CONTROL_CHANNELS.moveWindowBy, (event, input) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);

      if (!targetWindow) {
        return;
      }

      if (isWindowPinned(targetWindow)) {
        log.ger({
          type: "info",
          message: "[app WINDOW_CONTROL_CHANNELS.moveWindowBy] skipped for pinned window",
          data: {
            role: getWindowRole(targetWindow),
          },
        });
        return;
      }


      const request = parseMoveWindowByRequest(input);
      const [currentX, currentY] = targetWindow.getPosition();
      const nextPosition = {
        x: currentX + request.deltaX,
        y: currentY + request.deltaY,
      };
      log.ger({
        type: "info",
        message: "[app WINDOW_CONTROL_CHANNELS.moveWindowBy] next position",
        data: {
          role: getWindowRole(targetWindow),
          request,
          currentPosition: { x: currentX, y: currentY },
          nextPosition,
        },
      });
      targetWindow.setPosition(nextPosition.x, nextPosition.y);
    });
    ipcMain.on(WINDOW_CONTROL_CHANNELS.resizeWindowBy, (event, input) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);

      if (!targetWindow) {
        return;
      }

      const request = parseResizeWindowByRequest(input);
      const [currentWidth, currentHeight] = targetWindow.getSize();
      const nextSize = clampWindowSize(
        {
          width: currentWidth + request.deltaWidth,
          height: currentHeight + request.deltaHeight,
        },
        getMinimumWindowSize(targetWindow),
      );
      const nextPosition = getClampedWindowPositionForSize(
        targetWindow,
        nextSize,
      );
      log.ger({
        type: "info",
        message: "[app WINDOW_CONTROL_CHANNELS.resizeWindowBy] next bounds",
        data: {
          role: getWindowRole(targetWindow),
          request,
          currentSize: { width: currentWidth, height: currentHeight },
          nextSize,
          nextPosition,
        },
      });
      targetWindow.setBounds({
        x: nextPosition.x,
        y: nextPosition.y,
        width: nextSize.width,
        height: nextSize.height,
      });
    });
    ipcMain.handle(WINDOW_CONTROL_CHANNELS.setWindowSize, (event, input) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);

      if (!targetWindow) {
        throw new Error("Unable to resolve target window");
      }

      const request = parseSetWindowSizeRequest(input);
      const nextSize = clampWindowSize(
        {
          width: request.width,
          height: request.height,
        },
        getMinimumWindowSize(targetWindow),
      );
      const nextPosition = getClampedWindowPositionForSize(
        targetWindow,
        nextSize,
      );
      log.ger({
        type: "info",
        message: "[app WINDOW_CONTROL_CHANNELS.setWindowSize] next bounds",
        data: {
          role: getWindowRole(targetWindow),
          request,
          nextSize,
          nextPosition,
        },
      });

      targetWindow.setBounds({
        x: nextPosition.x,
        y: nextPosition.y,
        width: nextSize.width,
        height: nextSize.height,
      });
      return createWindowBoundsSnapshot(targetWindow);
    });
    ipcMain.handle(WINDOW_CONTROL_CHANNELS.setWindowSizePreset, async (event, input) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);
      if (!targetWindow) {
        throw new Error("Unable to resolve target window");
      }

      const request = parseSetWindowSizePresetRequest(input);
      const nextSize = getWindowSizeForPreset(targetWindow, request.preset);
      const nextPosition = getClampedWindowPositionForSize(
        targetWindow,
        nextSize,
      );
      log.ger({
        type: "info",
        message: "[app WINDOW_CONTROL_CHANNELS.setWindowSizePreset] next bounds",
        data: {
          role: getWindowRole(targetWindow),
          request,
          nextSize,
          nextPosition,
        },
      });

      targetWindow.setBounds({
        x: nextPosition.x,
        y: nextPosition.y,
        width: nextSize.width,
        height: nextSize.height,
      });
      return createWindowBoundsSnapshot(targetWindow);
    });
    ipcMain.handle(WINDOW_CONTROL_CHANNELS.getWindowBounds, (event) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);

      if (!targetWindow) {
        throw new Error("Unable to resolve target window");
      }

      return createWindowBoundsSnapshot(targetWindow);
    });
    ipcMain.handle(WINDOW_CONTROL_CHANNELS.getAlwaysOnTop, (event) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);

      if (!targetWindow) {
        throw new Error("Unable to resolve target window");
      }

      return targetWindow.isAlwaysOnTop();
    });
    ipcMain.handle(WINDOW_CONTROL_CHANNELS.setAlwaysOnTop, (event, input) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);

      if (!targetWindow) {
        throw new Error("Unable to resolve target window");
      }

      const request = parseSetAlwaysOnTopRequest(input);
      targetWindow.setAlwaysOnTop(request.alwaysOnTop);
      publishAlwaysOnTop(targetWindow);
      return targetWindow.isAlwaysOnTop();
    });
    ipcMain.handle(WINDOW_CONTROL_CHANNELS.getPinned, (event) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);

      if (!targetWindow) {
        throw new Error("Unable to resolve target window");
      }

      return isWindowPinned(targetWindow);
    });
    ipcMain.handle(WINDOW_CONTROL_CHANNELS.setPinned, (event, input) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);

      if (!targetWindow) {
        throw new Error("Unable to resolve target window");
      }

      const request = parseSetPinnedRequest(input);
      return setWindowPinned(targetWindow, request.pinned);
    });

    const sessionLifecycleBackend = createSessionLifecycleBackend(
      app,
      {
        onChunkRegistered(chunk) {
          publishToAllWindows(
            SESSION_LIFECYCLE_EVENT_CHANNELS.chunkRegistered,
            chunk,
          );
        },
        onRecoveryIssue(issue) {
          publishToAllWindows(
            SESSION_LIFECYCLE_EVENT_CHANNELS.recoveryIssue,
            issue,
          );
        },
        onSessionChanged(session) {
          currentSession = session;
          publishToAllWindows(
            SESSION_LIFECYCLE_EVENT_CHANNELS.sessionChanged,
            session,
          );
        },
        onSessionFinalized(session) {
          currentSession = session;
          publishToAllWindows(
            SESSION_LIFECYCLE_EVENT_CHANNELS.sessionFinalized,
            session,
          );
        },
      },
      {
        orchestrationMode: pipelineOrchestrationMode,
      },
    );

    registerSessionLifecycleIpc(ipcMain, sessionLifecycleBackend.controller);

    const appDataRoot = path.join(
      app.getPath("appData"),
      "interview-sentiment-analyzer",
    );
    const storageLayoutResolver = createSessionStorageLayoutResolver(appDataRoot);
    const recordingPersistence = createRecordingPersistenceService(storageLayoutResolver);
    const recordingExport = createRecordingExportService(storageLayoutResolver);
    const sandboxRecordingPersistence = createRecordingSandboxPersistenceService(
      path.join(
        app.getPath("videos"),
        "Interview Sentiment Analyzer",
        "sandbox-captures",
      ),
    );

    registerRecordingIpc(
      ipcMain,
      recordingPersistence,
      sandboxRecordingPersistence,
      sessionLifecycleBackend.controller,
    );

    ipcMain.handle(
      RECORDING_CHANNELS.exportRecording,
      async (_event, input: unknown) => {
        if (typeof input !== "object" || input === null) {
          throw new Error("exportRecording request must be an object");
        }
        const sessionId = (input as Record<string, unknown>).sessionId as string;

        publishToAllWindows(RECORDING_EVENT_CHANNELS.exportProgress, {
          sessionId,
          exportStatus: "assembling",
        });

        try {
          const result = await recordingExport.exportSession(sessionId);
          publishToAllWindows(RECORDING_EVENT_CHANNELS.exportProgress, {
            sessionId,
            exportStatus: "completed",
            exportFilePath: result.exportFilePath,
          });
          return { exportStatus: "completed", exportFilePath: result.exportFilePath };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Export failed";
          publishToAllWindows(RECORDING_EVENT_CHANNELS.exportProgress, {
            sessionId,
            exportStatus: "failed",
            errorMessage,
          });
          return { exportStatus: "failed" };
        }
      },
    );

    ipcMain.handle(
      RECORDING_CHANNELS.openRecordingsFolder,
      async (_event, input: unknown) => {
        if (typeof input !== "object" || input === null) {
          throw new Error("openRecordingsFolder request must be an object");
        }

        const sessionId = (input as Record<string, unknown>).sessionId;
        if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
          throw new Error("openRecordingsFolder requires sessionId");
        }

        const recordingsRoot = storageLayoutResolver.resolveSessionLayout(
          sessionId.trim(),
        ).recordingsRoot;
        await mkdir(recordingsRoot, { recursive: true });
        const openResult = await shell.openPath(recordingsRoot);

        if (openResult.length > 0) {
          throw new Error(openResult);
        }
      },
    );

    await sessionLifecycleBackend.recover();

    sessionLifecycleController = sessionLifecycleBackend.controller;

    const shortcutsConfig = await appConfigStore.loadShortcutsConfig();
    await registerConfiguredGlobalShortcuts({
      config: shortcutsConfig,
      mainWindow,
      controller: sessionLifecycleController,
      getCurrentSession: () => currentSession,
      getCaptureSources: async () => {
        const captureOptions = await appConfigStore.loadCaptureOptionsConfig();
        return buildCaptureSourcesFromConfig(captureOptions);
      },
      toggleVisibility,
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const browserWindow = createWindow(WINDOW_ROLES.launcher);
        console.log('[browserWindow show]', browserWindow)
        browserWindow.setMovable(true);
        console.log('[app activate], browserWindow movable set to true')
      }
    });
  });

  app.on("window-all-closed", () => {
    app.removeAllListeners()
    log.ger({ type: "info", message: "[app window-all-closed] removing all listeners" });
    if (process.platform !== "darwin") {
      app.quit();
    }
    app.quit()
  });
}

initializeApp().catch((error) => {
  console.error('[app initializeApp error]', error)
})