import type { IpcMain } from "electron";

import type { SessionLifecycleController } from "../../interfaces/controllers/session-lifecycle-controller";
import { SESSION_LIFECYCLE_CHANNELS } from "./session-lifecycle-channels";

export function registerSessionLifecycleIpc(
  ipcMain: IpcMain,
  controller: SessionLifecycleController,
): void {
  ipcMain.handle(SESSION_LIFECYCLE_CHANNELS.startSession, (_event, input) =>
    controller.startSession(input),
  );
  ipcMain.handle(
    SESSION_LIFECYCLE_CHANNELS.registerMediaChunk,
    (_event, input) => controller.registerMediaChunk(input),
  );
  ipcMain.handle(SESSION_LIFECYCLE_CHANNELS.finalizeSession, (_event, input) =>
    controller.finalizeSession(input),
  );
}
