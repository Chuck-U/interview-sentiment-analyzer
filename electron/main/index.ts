import path from "node:path";

import { app, BrowserWindow, ipcMain, } from "electron";

import { createSessionLifecycleBackend } from "../../src/backend";
import { registerSessionLifecycleIpc } from "../../src/backend/infrastructure/ipc/register-session-lifecycle-ipc";
import { APP_CONTROL_CHANNELS } from "../../src/shared/app-controls";
import { SESSION_LIFECYCLE_EVENT_CHANNELS } from "../../src/backend/infrastructure/ipc/session-lifecycle-channels";
import {
  parseMoveWindowByRequest,
  parseResizeWindowByRequest,
  WINDOW_CONTROL_CHANNELS,
  WINDOW_CONTROL_EVENT_CHANNELS,
  type WindowBoundsSnapshot,
} from "../../src/shared/window-controls";

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
    width: MAIN_WINDOW_DEFAULT_WIDTH,
    height: MAIN_WINDOW_DEFAULT_HEIGHT,
    minWidth: MAIN_WINDOW_MIN_WIDTH ?? 800,
    minHeight: MAIN_WINDOW_MIN_HEIGHT ?? 300,
    alwaysOnTop: true,
    frame: false,
    transparent: false,
    backgroundColor: "#00000080",
    resizable: true,
    show: false, // Start hidden, then show after setup
    fullscreenable: false,
    hasShadow: false,
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
async function initializeApp() {
  console.error('[initializeApp]')
  app.whenReady().then(async () => {
    createMainWindow();
    console.log('[app createWindow]')

    ipcMain.handle(APP_CONTROL_CHANNELS.closeApplication, () => {
      app.quit();
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
          publishToAllWindows(
            SESSION_LIFECYCLE_EVENT_CHANNELS.sessionChanged,
            session,
          );
        },
        onSessionFinalized(session) {
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

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const browserWindow = createMainWindow();
        console.log('[browserWindow show]', browserWindow)
        browserWindow.show();
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