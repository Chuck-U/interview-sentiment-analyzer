import path from "node:path";

import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
} from "electron";

import { createSessionLifecycleBackend } from "../../src/backend";
import { registerSessionLifecycleIpc } from "../../src/backend/infrastructure/ipc/register-session-lifecycle-ipc";
import { createShortcutsConfigStore } from "../../src/backend/infrastructure/shortcuts/shortcutsConfigStore";
import { registerConfiguredGlobalShortcuts } from "../../src/backend/infrastructure/shortcuts/globalShortcuts.shortcuts";
import { APP_CONTROL_CHANNELS } from "../../src/shared/app-controls";
import { SESSION_LIFECYCLE_EVENT_CHANNELS } from "../../src/backend/infrastructure/ipc/session-lifecycle-channels";
import {
  parseMoveWindowByRequest,
  parseResizeWindowByRequest,
  WINDOW_CONTROL_CHANNELS,
  WINDOW_CONTROL_EVENT_CHANNELS,
  type WindowBoundsSnapshot,
} from "../../src/shared/window-controls";
import type { SessionSnapshot } from "../../src/shared/session-lifecycle";
import {
  SHORTCUTS_IPC_CHANNELS,
  normalizeSetShortcutEnabledRequest,
} from "../../src/shared/shortcuts";
import type { SessionLifecycleController } from "../../src/backend/interfaces/controllers/session-lifecycle-controller";

const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5180';

const pipelineOrchestrationMode =
  process.env.PIPELINE_ORCHESTRATOR === "langchain" ? "langchain" : "built-in";
const MAIN_WINDOW_MIN_WIDTH = 460;
const MAIN_WINDOW_MIN_HEIGHT = 320;
const MAIN_WINDOW_DEFAULT_WIDTH = 560;
const MAIN_WINDOW_DEFAULT_HEIGHT = 360;

function publishToAllWindows(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}

function createWindowBoundsSnapshot(
  window: BrowserWindow,
): WindowBoundsSnapshot {
  const [minWidth, minHeight] = window.getMinimumSize();
  const bounds = window.getBounds();

  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth,
    minHeight,
  };
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
        mainWindow.hide();
      } else {
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
        ? "Hide agent controls"
        : "Show agent controls";

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

    const shortcutsConfigStore = createShortcutsConfigStore(app);

    ipcMain.handle(APP_CONTROL_CHANNELS.closeApplication, () => {
      app.quit();
    });

    ipcMain.handle(SHORTCUTS_IPC_CHANNELS.ensureConfig, async () => {
      await shortcutsConfigStore.ensureConfigExists();
    });

    ipcMain.handle(SHORTCUTS_IPC_CHANNELS.getConfig, async () => {
      return shortcutsConfigStore.loadConfig();
    });

    ipcMain.handle(
      SHORTCUTS_IPC_CHANNELS.setShortcutEnabled,
      async (_event, input: unknown) => {
        const request = normalizeSetShortcutEnabledRequest(input);
        await shortcutsConfigStore.updateShortcutEnabled({
          shortcutId: request.shortcutId,
          enabled: request.enabled,
        });

        const updatedConfig = await shortcutsConfigStore.loadConfig();

        if (sessionLifecycleController) {
          await registerConfiguredGlobalShortcuts({
            config: updatedConfig,
            mainWindow,
            controller: sessionLifecycleController,
            getCurrentSession: () => currentSession,
          });
        }
      },
    );

    app.on("will-quit", () => {
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
      targetWindow.setSize(
        currentWidth + request.deltaWidth,
        currentHeight + request.deltaHeight,
      );
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
    await sessionLifecycleBackend.recover();

    sessionLifecycleController = sessionLifecycleBackend.controller;

    const shortcutsConfig = await shortcutsConfigStore.loadConfig();
    await registerConfiguredGlobalShortcuts({
      config: shortcutsConfig,
      mainWindow,
      controller: sessionLifecycleController,
      getCurrentSession: () => currentSession,
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