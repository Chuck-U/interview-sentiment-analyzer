import type { IpcRendererEvent } from "electron";
import { contextBridge, ipcRenderer } from "electron";

import {
  type SessionLifecycleBridge,
  type SessionLifecycleEventsBridge,
} from "../../src/shared/session-lifecycle";
import type { AppControlsBridge } from "../../src/shared/app-controls";
import { APP_CONTROL_CHANNELS } from "../../src/shared/app-controls";
import type { ElectronAppBridge } from "../../src/shared/electron-app";
import type {
  WindowBoundsSnapshot,
  WindowControlsBridge,
} from "../../src/shared/window-controls";
import {
  WINDOW_CONTROL_CHANNELS,
  WINDOW_CONTROL_EVENT_CHANNELS,
} from "../../src/shared/window-controls";
import {
  SESSION_LIFECYCLE_CHANNELS,
  SESSION_LIFECYCLE_EVENT_CHANNELS,
} from "../../src/backend/infrastructure/ipc/session-lifecycle-channels";

const sessionLifecycleBridge: SessionLifecycleBridge = {
  startSession(request) {
    return ipcRenderer.invoke(SESSION_LIFECYCLE_CHANNELS.startSession, request);
  },
  registerMediaChunk(request) {
    return ipcRenderer.invoke(
      SESSION_LIFECYCLE_CHANNELS.registerMediaChunk,
      request,
    );
  },
  finalizeSession(request) {
    return ipcRenderer.invoke(
      SESSION_LIFECYCLE_CHANNELS.finalizeSession,
      request,
    );
  },
};

function subscribeToChannel<T>(
  channel: string,
  listener: (payload: T) => void,
): () => void {
  const wrappedListener = (_event: IpcRendererEvent, payload: T) => {
    listener(payload);
  };

  ipcRenderer.on(channel, wrappedListener);

  return () => {
    ipcRenderer.off(channel, wrappedListener);
  };
}

const sessionLifecycleEventsBridge: SessionLifecycleEventsBridge = {
  onSessionChanged(listener) {
    return subscribeToChannel(
      SESSION_LIFECYCLE_EVENT_CHANNELS.sessionChanged,
      listener,
    );
  },
  onChunkRegistered(listener) {
    return subscribeToChannel(
      SESSION_LIFECYCLE_EVENT_CHANNELS.chunkRegistered,
      listener,
    );
  },
  onSessionFinalized(listener) {
    return subscribeToChannel(
      SESSION_LIFECYCLE_EVENT_CHANNELS.sessionFinalized,
      listener,
    );
  },
  onRecoveryIssue(listener) {
    return subscribeToChannel(
      SESSION_LIFECYCLE_EVENT_CHANNELS.recoveryIssue,
      listener,
    );
  },
};

const appControlsBridge: AppControlsBridge = {
  closeApplication() {
    return ipcRenderer.invoke(APP_CONTROL_CHANNELS.closeApplication);
  },
};

const windowControlsBridge: WindowControlsBridge = {
  moveWindowBy(request) {
    ipcRenderer.send(WINDOW_CONTROL_CHANNELS.moveWindowBy, request);
  },
  resizeWindowBy(request) {
    ipcRenderer.send(WINDOW_CONTROL_CHANNELS.resizeWindowBy, request);
  },
  getWindowBounds() {
    return ipcRenderer.invoke(
      WINDOW_CONTROL_CHANNELS.getWindowBounds,
    ) as Promise<WindowBoundsSnapshot>;
  },
  onWindowBoundsChanged(listener) {
    return subscribeToChannel(
      WINDOW_CONTROL_EVENT_CHANNELS.boundsChanged,
      listener,
    );
  },
};

const electronAppBridge: ElectronAppBridge = {
  platform: process.platform,
  sessionLifecycle: sessionLifecycleBridge,
  sessionLifecycleEvents: sessionLifecycleEventsBridge,
  appControls: appControlsBridge,
  windowControls: windowControlsBridge,
};

contextBridge.exposeInMainWorld("electronApp", electronAppBridge);
