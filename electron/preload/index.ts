import type { IpcRendererEvent } from "electron";
import { contextBridge, ipcRenderer } from "electron";
import { z } from "zod/v4";
import {
  type SessionLifecycleBridge,
  type SessionLifecycleEventsBridge,
} from "../../src/shared/session-lifecycle";
import type { RecordingBridge, RecordingEventsBridge } from "../../src/shared/recording";
import type { AppControlsBridge } from "../../src/shared/app-controls";
import { APP_CONTROL_CHANNELS } from "../../src/shared/app-controls";
import type { ElectronAppBridge } from "../../src/shared/electron-app";
import type { ShortcutsBridge } from "../../src/shared/shortcuts";
import { SHORTCUTS_IPC_CHANNELS } from "../../src/shared/shortcuts";
import { normalizeSetShortcutEnabledRequest } from "../../src/shared/shortcuts";
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
import {
  RECORDING_CHANNELS,
  RECORDING_EVENT_CHANNELS,
} from "../../src/backend/infrastructure/ipc/recording-channels";

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
  bringToFront() {
    ipcRenderer.send(WINDOW_CONTROL_CHANNELS.bringToFront);
  },
  sendToBack() {
    ipcRenderer.send(WINDOW_CONTROL_CHANNELS.sendToBack);
  },
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

const shortcutsBridge: ShortcutsBridge = {
  ensureConfig() {
    return ipcRenderer.invoke(SHORTCUTS_IPC_CHANNELS.ensureConfig);
  },
  getConfig() {
    console.log('[shortcutsBridge getConfig]')
    return ipcRenderer.invoke(SHORTCUTS_IPC_CHANNELS.getConfig);
  },
  setShortcutEnabled(request) {
    console.log('[shortcutsBridge setShortcutEnabled]', request)
    return ipcRenderer.invoke(
      SHORTCUTS_IPC_CHANNELS.setShortcutEnabled,
      normalizeSetShortcutEnabledRequest(request),
    ) as Promise<void>;
  },
};

const recordingBridge: RecordingBridge = {
  persistChunk(request) {
    return ipcRenderer.invoke(RECORDING_CHANNELS.persistChunk, {
      ...request,
      buffer: Array.from(new Uint8Array(request.buffer)),
    });
  },
  persistScreenshot(request) {
    return ipcRenderer.invoke(RECORDING_CHANNELS.persistScreenshot, {
      ...request,
      buffer: Array.from(new Uint8Array(request.buffer)),
    });
  },
  exportRecording(request) {
    return ipcRenderer.invoke(RECORDING_CHANNELS.exportRecording, request);
  },
};

const recordingEventsBridge: RecordingEventsBridge = {
  onRecordingStateChanged(listener) {
    return subscribeToChannel(
      RECORDING_EVENT_CHANNELS.recordingStateChanged,
      listener,
    );
  },
  onChunkPersisted(listener) {
    return subscribeToChannel(
      RECORDING_EVENT_CHANNELS.chunkPersisted,
      listener,
    );
  },
  onCaptureError(listener) {
    return subscribeToChannel(
      RECORDING_EVENT_CHANNELS.captureError,
      listener,
    );
  },
  onExportProgress(listener) {
    return subscribeToChannel(
      RECORDING_EVENT_CHANNELS.exportProgress,
      listener,
    );
  },
};

const electronAppBridge: ElectronAppBridge = {
  platform: process.platform,
  sessionLifecycle: sessionLifecycleBridge,
  sessionLifecycleEvents: sessionLifecycleEventsBridge,
  recording: recordingBridge,
  recordingEvents: recordingEventsBridge,
  appControls: appControlsBridge,
  windowControls: windowControlsBridge,
  shortcuts: shortcutsBridge,
};

contextBridge.exposeInMainWorld("electronApp", electronAppBridge);

// Ensure the shortcut config file exists before renderer reads it.
void ipcRenderer.invoke(SHORTCUTS_IPC_CHANNELS.ensureConfig).catch(() => {
  // If config creation fails, renderer will still show defaults/error state
  // based on subsequent getConfig() calls.
});
