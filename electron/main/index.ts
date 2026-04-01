import { mkdir } from "node:fs/promises";
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
  session,
  shell,
  systemPreferences,
  Tray,
} from "electron";
import type { DesktopCapturerSource } from "electron";
import { log } from "../../src/lib/logger";
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
import { type MediaChunkSource, type SessionSnapshot } from "../../src/shared/session-lifecycle";
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
  CARD_WINDOW_ROLES,
  type CardWindowsOpenState,
  type CardWindowRole,
  isCardWindowRole,
} from "../../src/shared/window-registry";
import { createMonitorPickerController } from "./monitor-picker";
import { applyOptionsWindowOpenBounds, getClampedWindowPositionForSize, getMinimumWindowSize, getWindowSizeForPreset, publishWindowBounds, createWindowBoundsSnapshot } from "../electron-utils";
import {
  MODEL_INIT_CHANNELS,
  MODEL_INIT_EVENT_CHANNELS,
} from "../../src/shared/model-init";
import {
  TRANSCRIPTION_CHANNELS,
  TRANSCRIPTION_EVENT_CHANNELS,
} from "../../src/shared/transcription";
import { QUESTION_DETECTION_EVENT_CHANNELS } from "../../src/shared/question-detection";
import * as modelLifecycle from "../../src/backend/infrastructure/ml/model-lifecycle-service";
import { createTranscribeAudioIpcHandler } from "../../src/backend/interfaces/controllers/transcription-controller";
import { cleanupStaleArtifacts } from "./cleanup-stale-artifacts";
import { isNonEmptyObject, isNonEmptyString } from "@/backend/guards/checks";

const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5180'; // TODO: fix handling of this env variable

// const pipelineOrchestrationMode =
//   process.env.PIPELINE_ORCHESTRATOR === "langchain" ? "langchain" : "built-in"; // slop code
export const MAIN_WINDOW_MIN_WIDTH = 600;
export const MAIN_WINDOW_MIN_HEIGHT = 104;
const MAIN_WINDOW_DEFAULT_WIDTH = 700;
const MAIN_WINDOW_DEFAULT_HEIGHT = 112;
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

/**
 * Set once the appConfigStore is available so that per-card-window preference
 * writes (bounds, pinned) can happen from module-level helpers.
 */
let saveCardWindowPrefsRef:
  | ((role: CardWindowRole, prefs: { bounds?: { x: number; y: number; width: number; height: number }; pinned?: boolean }) => void)
  | null = null;

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

  const role = roleByWebContentsId.get(webContentsId);
  if (role && isCardWindowRole(role)) {
    saveCardWindowPrefsRef?.(role, { pinned });
  }

  return pinned;
}

function isCardWindowOpen(role: CardWindowRole): boolean {
  const target = cardWindows.get(role);
  return Boolean(target && !target.isDestroyed() && target.isVisible());
}
function getCardOpenState(): CardWindowsOpenState {
  const openIds = {} as Record<CardWindowRole, boolean>;
  for (const role of CARD_WINDOW_ROLES) {
    openIds[role] = isCardWindowOpen(role);
  }
  return { openIds };
}

function broadcastCardWindowOpenState(): void {
  publishToAllWindows(
    WINDOW_REGISTRY_EVENT_CHANNELS.openStateChanged,
    getCardOpenState(),
  );
}

function registerWindowBoundsListeners(window: BrowserWindow): void {
  let boundsDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleBoundsSave(): void {
    if (boundsDebounceTimer !== null) {
      clearTimeout(boundsDebounceTimer);
    }
    boundsDebounceTimer = setTimeout(() => {
      boundsDebounceTimer = null;
      if (window.isDestroyed()) {
        return;
      }
      const role = roleByWebContentsId.get(window.webContents.id);
      if (role && isCardWindowRole(role)) {
        const { x, y, width, height } = window.getBounds();
        saveCardWindowPrefsRef?.(role, { bounds: { x, y, width, height } });
      }
    }, 500);
  }

  window.on("move", () => {
    publishWindowBounds(window);
    scheduleBoundsSave();
  });
  window.on("resize", () => {
    publishWindowBounds(window);
    scheduleBoundsSave();
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
  savedPrefs?: {
    readonly bounds?: { x: number; y: number; width: number; height: number };
    readonly pinned?: boolean;
  },
): BrowserWindow {
  const preloadPath = path.join(__dirname, "../preload/index.js");

  const isLauncher = role === WINDOW_ROLES.launcher;
  const savedBounds = !isLauncher ? savedPrefs?.bounds : undefined;
  const defaultCardWidth =
    role === WINDOW_ROLES.questionBox ? 480 : 520;
  const defaultCardHeight =
    role === WINDOW_ROLES.questionBox ? 320 : 640;
  log.ger({ type: 'info', message: 'attempting creating window', data: { role } })
  const browserWindow = new BrowserWindow({
    width:
      savedBounds?.width ??
      (isLauncher ? MAIN_WINDOW_DEFAULT_WIDTH : defaultCardWidth),
    height:
      savedBounds?.height ??
      (isLauncher ? MAIN_WINDOW_DEFAULT_HEIGHT : defaultCardHeight),
    minWidth: isLauncher ? MAIN_WINDOW_MIN_WIDTH : 320,
    minHeight: isLauncher ? MAIN_WINDOW_MIN_HEIGHT : 240,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: true,
    show: isLauncher ? false : true,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: true,
    focusable: true,
    movable: true,
    x: savedBounds?.x ?? (isLauncher ? 0 : 40),
    y: savedBounds?.y ?? (isLauncher ? 100 : 140),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: true,
      sandbox: false,
    },
  });

  const webContentsId = browserWindow.webContents.id;
  roleByWebContentsId.set(webContentsId, role);
  const initialPinned = !isLauncher && (savedPrefs?.pinned ?? false);
  pinnedByWebContentsId.set(webContentsId, initialPinned);
  if (initialPinned) {
    browserWindow.setMovable(false);
  }
  browserWindow.on("close", (event) => {
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
    if (!isLauncher) {
      broadcastCardWindowOpenState();
      browserWindow.focus();
      browserWindow.setAlwaysOnTop(true);
    }


    if (!isLauncher && !savedBounds) {
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
      } else if (role === WINDOW_ROLES.questionBox && launcherBounds) {
        browserWindow.setPosition(
          launcherBounds.x + Math.max(launcherBounds.width + 24, 320),
          launcherBounds.y + 56,
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
    if (!isLauncher) {
      broadcastCardWindowOpenState();
    }
    publishAlwaysOnTop(browserWindow);
    publishPinned(browserWindow);
    syncTrayMenuRef?.();
  });

  browserWindow.on("closed", () => {
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

    browserWindow.show();
    publishAlwaysOnTop(browserWindow);
    publishPinned(browserWindow);
    if (!isLauncher) {
      broadcastCardWindowOpenState();
    }
  });

  return browserWindow;
}

/** Pick the desktopCapturer source for the OS primary display (`screen.getPrimaryDisplay()`). */
function resolvePrimaryDesktopCapturerSource(
  sources: readonly DesktopCapturerSource[],

): DesktopCapturerSource | undefined {
  if (sources.length === 0) {
    return undefined;
  }
  const primaryDisplay: Electron.Display = screen.getPrimaryDisplay()

  const combinedSources = [...sources, primaryDisplay]


  // this is wrong. 

  const withoutId = sources.filter((source) => !source.display_id);
  if (withoutId.length === 1) {
    return withoutId[0];
  }
  return sources[0];
}

function resolveCapturerSourceForDisplay(
  sources: readonly DesktopCapturerSource[],
  displayId: string,
): DesktopCapturerSource | undefined {
  log.ger({ type: "trace", message: "resolveCapturerSourceForDisplay", data: { sources: sources.map(source => ({ display_id: source.display_id, id: source.id, name: source.name })) } });
  const exact = sources.find((source) => source.display_id === displayId || source.id === displayId);
  if (exact) {
    return exact;
  }
  log.ger({ type: "trace", message: "monitor not found", source: 'resolveCapturerSourceForDisplay', data: { sources, displayId } });
  return undefined;
}

async function listCaptureDisplays(): Promise<readonly CaptureDisplaySnapshot[]> {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 0, height: 0 },
  });

  const primaryDisplay: Electron.Display = screen.getPrimaryDisplay();
  const allDisplays = screen.getAllDisplays();
  const captureDisplays = allDisplays.map((display) => {
    const displayId = String(display.id);
    const source = resolveCapturerSourceForDisplay(
      sources,
      displayId,
    );

    return {
      displayId,
      label: display.label || source?.name || `Display ${displayId}`,
      isPrimary: displayId === String(primaryDisplay.id),
      bounds: {
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
      },
      sourceId: source?.id,
    };
  });

  return captureDisplays;
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
    log.ger({
      type: "warn",
      message: `[process warning] ${warning.name}: ${warning.message}`,
      data: warning.stack,
    });
  });

  process.on("unhandledRejection", (reason) => {
    log.ger({
      type: "error",
      message: "[process unhandledRejection]",
      data: reason,
    });
  });

  process.on("uncaughtException", (error) => {
    log.ger({
      type: "fatal",
      message: `[process uncaughtException] ${error.message}`,
      data: error.stack,
    });
  });

  app.whenReady().then(async () => {
    // try {
    //   initializeAutoUpdates();
    // } catch (error) {
    //   log.ger({
    //     type: "error",
    //     message: "[app initializeAutoUpdates] failed",
    //     data: error,
    //   });
    // }


    const mainWindow = createWindow(WINDOW_ROLES.launcher);
    mainWindow.focus();

    let currentSession: SessionSnapshot | null = null;
    let sessionLifecycleController: SessionLifecycleController | null = null;
    const appConfigStore = createAppConfigStore(app);

    saveCardWindowPrefsRef = (role, prefs) => {
      appConfigStore.updateCardWindowPreferences(role, prefs).catch((err) => {
        log.ger({
          type: "warn",
          message: "[app saveCardWindowPrefs] failed to persist window preferences",
          data: err,
        });
      });
    };
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

    ipcMain.handle(WINDOW_REGISTRY_CHANNELS.openWindow, async (_event, input: unknown) => {
      if (typeof input !== "string" || !isCardWindowRole(input)) {
        throw new Error("Invalid card window role.");
      }
      const webContents = BrowserWindow.fromWebContents(_event.sender);
      const windowBounds = webContents?.getBounds();

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
      const savedPrefs = await appConfigStore
        .loadWindowPreferences()
        .then((prefs) => prefs[input])
        .catch(() => undefined);
      createWindow(input, windowBounds, savedPrefs);
    });

    ipcMain.handle(WINDOW_REGISTRY_CHANNELS.closeWindow, (_event, input: unknown) => {
      if (typeof input !== "string" || !isCardWindowRole(input)) {
        throw new Error("Invalid card window role.");
      }
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
          const request = input as Record<string, unknown>;
          const candidate = request.selectedDisplayId;
          if (typeof candidate === "string" && candidate.trim().length > 0) {
            selectedDisplayId = candidate.trim();
          }
        }

        const resolvedDisplayId = await monitorPicker.open({
          selectedDisplayId,
        });
        return { displayId: resolvedDisplayId };
      },
    );

    ipcMain.handle(CAPTURE_OPTIONS_CHANNELS.closeMonitorPicker, async () => {
      monitorPicker.close();
    });

    ipcMain.handle(MODEL_INIT_CHANNELS.startInit, async () => {
      await modelLifecycle.initAll((payload) => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(MODEL_INIT_EVENT_CHANNELS.progress, payload);
        }
      });
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(MODEL_INIT_EVENT_CHANNELS.ready);
      }
    });

    ipcMain.handle(MODEL_INIT_CHANNELS.getStatus, () => {
      return modelLifecycle.getStatus();
    });

    const appDataRoot = path.join(
      app.getPath("appData"),
      "interview-sentiment-analyzer",
    );
    const storageLayoutResolver = createSessionStorageLayoutResolver(appDataRoot);

    await cleanupStaleArtifacts(appDataRoot).catch((err) =>
      log.ger({ type: "warn", message: "[cleanup] startup cleanup failed", data: err }),
    );

    const transcribeAudioHandler = createTranscribeAudioIpcHandler({
      getPipeline: modelLifecycle.getPipeline,
      publishQuestionDetected(payload) {
        publishToAllWindows(
          QUESTION_DETECTION_EVENT_CHANNELS.questionDetected,
          payload,
        );
      },
    });
    // write transcript to markdown file
    // const appendToLogFile = (result: TranscriptionResult) => {
    //   const logFile = path.join(app.getPath("appData"), "interview-sentiment-analyzer.log");
    //   const logEntry = {
    //     timestamp: new Date().toISOString(),
    //     result,
    //   };
    //   fs.appendFileSync(logFile, JSON.stringify(logEntry) + "\n");
    // };


    ipcMain.handle(
      TRANSCRIPTION_CHANNELS.transcribeAudio,
      async (event, input) => {
        const result = await transcribeAudioHandler(event, input);
        publishToAllWindows(
          TRANSCRIPTION_EVENT_CHANNELS.transcriptSegment,
          result,
        );
        return result;
      },
    );

    session.defaultSession.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        try {
          const primaryDisplay: Electron.Display = screen.getPrimaryDisplay();
          const captureOptions = await appConfigStore.loadCaptureOptionsConfig();
          const sources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 300, height: 200 },
          });
          const selectedSource = resolvePrimaryDesktopCapturerSource([...sources, {
            ...primaryDisplay,
            display_id: String(primaryDisplay.id),
            id: String(primaryDisplay.id),
            name: primaryDisplay.label,
            appIcon: nativeImage.createEmpty(),
            thumbnail: nativeImage.createEmpty(),
          }]);

          callback({
            video: selectedSource,
            audio: captureOptions.systemAudio.enabled ? "loopback" : undefined,
          });
        } catch (error) {
          log.ger({ type: "error", message: "Error getting sources", data: { error, _request } });
          callback({});
          return;
        }

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
    ipcMain.handle('get-sources', async (_event, options) => {
      const sources = await desktopCapturer.getSources(options);
      return sources.map(source => {
        return {
          ...source,
          id: source.id,
          name: source.name,
          displayId: source.display_id,
          thumbnail: source.thumbnail,
        }
      })
    })


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
      // {
      //   orchestrationMode: pipelineOrchestrationMode,
      // },
    );

    registerSessionLifecycleIpc(ipcMain, sessionLifecycleBackend.controller);

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
        const req = input as Record<string, unknown>;
        const sessionId = req.sessionId as string;
        const startedAt = typeof req.startedAt === "string" ? req.startedAt : undefined;
        const completedAt = typeof req.completedAt === "string" ? req.completedAt : undefined;

        publishToAllWindows(RECORDING_EVENT_CHANNELS.exportProgress, {
          sessionId,
          exportStatus: "assembling",
        });

        try {
          const result = await recordingExport.exportSession(sessionId, {
            startedAt,
            completedAt,
          });
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
        log.ger({ type: "trace", message: "openRecordingsFolder", data: { input } })
        if (!isNonEmptyObject(input)) {
          throw new Error("openRecordingsFolder request must be an object");
        }
        const sessionId = input.sessionId;
        if (!isNonEmptyString(sessionId)) {
          const recordingRoot = storageLayoutResolver.resolveSessionLayout().recordingsRoot

          const openResult = await shell.openPath(recordingRoot);
          if (openResult.length > 0) {
            throw new Error(openResult);
          }
          return;
        }
        const recordingsRoot = storageLayoutResolver.resolveSessionLayout(
          sessionId?.trim(),
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