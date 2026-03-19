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
  systemPreferences,
  Tray,
} from "electron";

import { createSessionLifecycleBackend } from "../../src/backend";
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
  applyResizeWindowByRequest,
  clampWindowSize,
  parseMoveWindowByRequest,
  parseResizeWindowByRequest,
  parseSetWindowSizePresetRequest,
  parseSetWindowSizeRequest,
  WINDOW_CONTROL_CHANNELS,
  WINDOW_CONTROL_EVENT_CHANNELS,
  type WindowSizePreset,
  type WindowBoundsSnapshot,
} from "../../src/shared/window-controls";
import type { MediaChunkSource, SessionSnapshot } from "../../src/shared/session-lifecycle";
import {
  SHORTCUTS_IPC_CHANNELS,
  DEFAULT_RECORDING_CAPTURE_SOURCES,
  normalizeSetShortcutEnabledRequest,
} from "../../src/shared/shortcuts";
import type { SessionLifecycleController } from "../../src/backend/interfaces/controllers/session-lifecycle-controller";
import { createMonitorPickerController } from "./monitor-picker";

const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5180';

const pipelineOrchestrationMode =
  process.env.PIPELINE_ORCHESTRATOR === "langchain" ? "langchain" : "built-in";
const MAIN_WINDOW_MIN_WIDTH = 460;
const MAIN_WINDOW_MIN_HEIGHT = 320;
const MAIN_WINDOW_DEFAULT_WIDTH = 560;
const MAIN_WINDOW_DEFAULT_HEIGHT = 360;

function buildCaptureSourcesFromConfig(
  config: CaptureOptionsConfig,
): readonly MediaChunkSource[] {
  const sources: MediaChunkSource[] = [];

  if (config.microphone.enabled) {
    sources.push("microphone");
  }

  if (config.webcam.enabled) {
    sources.push("webcam");
  }

  if (config.systemAudio.enabled) {
    sources.push("system-audio");
  }

  if (config.screen.enabled) {
    sources.push("screen-video");
  }

  if (config.screenshot.enabled) {
    sources.push("screenshot");
  }

  return sources.length > 0 ? sources : DEFAULT_RECORDING_CAPTURE_SOURCES;
}

function publishToAllWindows(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
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

  switch (preset) {
    case "half":
      return clampWindowSize(
        {
          width: 900,
          height: 700,
        },
        getMinimumWindowSize(window),
      );
    case "three-quarters":
      return clampWindowSize(
        {
          width: Math.round(workAreaWidth * 0.75),
          height: Math.round(workAreaHeight * 0.75),
        },
        getMinimumWindowSize(window),
      );
    case "full":
      return clampWindowSize(
        {
          width: Math.max(workAreaWidth - 100, 0),
          height: Math.max(workAreaHeight - 100, 0),
        },
        getMinimumWindowSize(window),
      );
  }
}

function publishWindowBounds(window: BrowserWindow): void {
  window.webContents.send(
    WINDOW_CONTROL_EVENT_CHANNELS.boundsChanged,
    createWindowBoundsSnapshot(window),
  );
}

function createMainWindow() {
  const preloadPath = path.join(__dirname, "../preload/index.js");

  const mainWindow = new BrowserWindow({
    width: MAIN_WINDOW_DEFAULT_WIDTH ?? 1800,
    height: MAIN_WINDOW_DEFAULT_HEIGHT ?? 900,
    minWidth: MAIN_WINDOW_MIN_WIDTH ?? 1600,
    minHeight: MAIN_WINDOW_MIN_HEIGHT ?? 900,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: true,
    show: false, // Start hidden, then show after setup
    fullscreenable: false,
    hasShadow: true,
    focusable: true,
    movable: true,
    x: 0, // Start at a visible position
    y: 100,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: true,
      sandbox: false,
    },
  });

  mainWindow.on("move", () => {
    publishWindowBounds(mainWindow);
  });
  mainWindow.on("resize", () => {
    publishWindowBounds(mainWindow);
  });
  mainWindow.webContents.on("did-finish-load", () => {
    publishWindowBounds(mainWindow);
  });

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return mainWindow;
  }

  void mainWindow.loadFile(path.join(__dirname, "../../../dist/index.html"));
  return mainWindow;
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
  app.whenReady().then(async () => {
    const mainWindow = createMainWindow();
    console.log('[app createWindow]')
    console.log('[mainWindow]', mainWindow)
    console.log('[app createWindow]')
    console.log('[mainWindow]', mainWindow)
    mainWindow.show();
    mainWindow.focus();

    let tray: Tray | null = null;

    const toggleVisibility = () => {
      if (mainWindow.isVisible()) {
        console.log('[app toggleVisibility] hide')
        mainWindow.hide();
      } else {
        console.log('[app toggleVisibility] show')
        mainWindow.show();
        mainWindow.focus();
      }
      syncTrayMenu();
    };

    const syncTrayMenu = () => {
      if (!tray) {
        return;
      }

      const label = mainWindow.isVisible()
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

    tray = new Tray(createEmptyTrayIcon());
    syncTrayMenu();
    tray.on("click", toggleVisibility);

    mainWindow.on("show", () => {
      syncTrayMenu();
    });
    mainWindow.on("hide", () => {
      syncTrayMenu();
    });

    let currentSession: SessionSnapshot | null = null;
    let sessionLifecycleController: SessionLifecycleController | null = null;
    const appConfigStore = createAppConfigStore(app);
    const monitorPicker = createMonitorPickerController({
      onSelectionChanged(displayId) {
        publishToAllWindows(
          CAPTURE_OPTIONS_EVENT_CHANNELS.selectedDisplayChanged,
          { displayId },
        );
      },
    });

    ipcMain.handle(APP_CONTROL_CHANNELS.closeApplication, () => {
      monitorPicker.close();
      app.quit();
    });


    ipcMain.handle(APP_CONTROL_CHANNELS.toggleVisibility, async () => {
      toggleVisibility();
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

    app.on("will-quit", () => {
      monitorPicker.close();
      globalShortcut.unregisterAll();
    });

    ipcMain.on(WINDOW_CONTROL_CHANNELS.moveWindowBy, (event, input) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);

      if (!targetWindow) {
        return;
      }


      const request = parseMoveWindowByRequest(input);
      const [currentX, currentY] = targetWindow.getPosition();
      targetWindow.setPosition(
        currentX + request.deltaX,
        currentY + request.deltaY,
      );
    });
    ipcMain.on(WINDOW_CONTROL_CHANNELS.resizeWindowBy, (event, input) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);

      if (!targetWindow) {
        return;
      }

      const request = parseResizeWindowByRequest(input);
      const [currentWidth, currentHeight] = targetWindow.getSize();
      const nextSize = applyResizeWindowByRequest(
        {
          width: currentWidth,
          height: currentHeight,
        },
        getMinimumWindowSize(targetWindow),
        request,
      );

      targetWindow.setSize(nextSize.width, nextSize.height);
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

      targetWindow.setSize(nextSize.width, nextSize.height);
      return createWindowBoundsSnapshot(targetWindow);
    });
    ipcMain.handle(WINDOW_CONTROL_CHANNELS.setWindowSizePreset, (event, input) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);

      if (!targetWindow) {
        throw new Error("Unable to resolve target window");
      }

      const request = parseSetWindowSizePresetRequest(input);
      const nextSize = getWindowSizeForPreset(targetWindow, request.preset);

      targetWindow.setSize(nextSize.width, nextSize.height);
      return createWindowBoundsSnapshot(targetWindow);
    });
    ipcMain.handle(WINDOW_CONTROL_CHANNELS.getWindowBounds, (event) => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);

      if (!targetWindow) {
        throw new Error("Unable to resolve target window");
      }

      return createWindowBoundsSnapshot(targetWindow);
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
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const browserWindow = createMainWindow();
        console.log('[browserWindow show]', browserWindow)
        browserWindow.show();
        browserWindow.setMovable(true);
        console.log('[app activate], browserWindow movable set to true')
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

initializeApp().catch((error) => {
  console.error('[app initializeApp error]', error)
})