import path from "node:path";

import { app, BrowserWindow, ipcMain } from "electron";

import { createSessionLifecycleBackend } from "../../src/backend";
import { registerSessionLifecycleIpc } from "../../src/backend/infrastructure/ipc/register-session-lifecycle-ipc";
import { APP_CONTROL_CHANNELS } from "../../src/shared/app-controls";
import { SESSION_LIFECYCLE_EVENT_CHANNELS } from "../../src/backend/infrastructure/ipc/session-lifecycle-channels";

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const pipelineOrchestrationMode =
  process.env.PIPELINE_ORCHESTRATOR === "langchain" ? "langchain" : "built-in";

function publishToAllWindows(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#09090b",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return mainWindow;
  }

  void mainWindow.loadFile(path.join(__dirname, "../../../dist/index.html"));
  return mainWindow;
}

app.whenReady().then(async () => {
  ipcMain.handle(APP_CONTROL_CHANNELS.closeApplication, () => {
    app.quit();
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
  createMainWindow();
  await sessionLifecycleBackend.recover();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
