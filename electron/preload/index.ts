import type { IpcRendererEvent } from "electron";
import { contextBridge, ipcRenderer } from "electron";
import {
  type SessionLifecycleBridge,
  type SessionLifecycleEventsBridge,
} from "../../src/shared/session-lifecycle";
import type { RecordingBridge, RecordingEventsBridge } from "../../src/shared/recording";
import type { AppControlsBridge } from "../../src/shared/app-controls";
import { APP_CONTROL_CHANNELS } from "../../src/shared/app-controls";
import type { AiProviderBridge } from "../../src/shared/ai-provider";
import {
  AI_PROVIDER_CHANNELS,
  normalizeAiProviderConfig,
  normalizeAiProviderModels,
} from "../../src/shared/ai-provider";
import type { ElectronAppBridge } from "../../src/shared/electron-app";
import type {
  TranscriptionBridge,
  TranscriptionEventsBridge,
  TranscriptionResult,
} from "../../src/shared/transcription";
import {
  TRANSCRIPTION_CHANNELS,
  TRANSCRIPTION_EVENT_CHANNELS,
} from "../../src/shared/transcription";
import type { CaptureOptionsBridge } from "../../src/shared/capture-options";
import type { ModelInitBridge } from "../../src/shared/model-init";
import {
  MODEL_INIT_CHANNELS,
  MODEL_INIT_EVENT_CHANNELS,
} from "../../src/shared/model-init";
import type { ShortcutsBridge } from "../../src/shared/shortcuts";
import { SHORTCUTS_IPC_CHANNELS } from "../../src/shared/shortcuts";
import { normalizeSetShortcutEnabledRequest } from "../../src/shared/shortcuts";
import {
  CAPTURE_OPTIONS_CHANNELS,
  CAPTURE_OPTIONS_EVENT_CHANNELS,
  normalizeCaptureOptionsConfig,
} from "../../src/shared/capture-options";
import type {
  SetAlwaysOnTopRequest,
  SetPinnedRequest,
  SetWindowSizePresetRequest,
  SetWindowSizeRequest,
  WindowBoundsSnapshot,
  WindowControlsBridge,
} from "../../src/shared/window-controls";
import {
  WINDOW_CONTROL_CHANNELS,
  WINDOW_CONTROL_EVENT_CHANNELS,
} from "../../src/shared/window-controls";
import type {
  CardWindowsOpenState,
  WindowRegistryBridge,
  WindowRegistryContext,
} from "../../src/shared/window-registry";
import {
  WINDOW_REGISTRY_CHANNELS,
  WINDOW_REGISTRY_EVENT_CHANNELS,
} from "../../src/shared/window-registry";
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
  toggleVisibility() {
    return ipcRenderer.invoke(APP_CONTROL_CHANNELS.toggleVisibility);
  },
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
  setWindowSize(request: SetWindowSizeRequest) {
    return ipcRenderer.invoke(
      WINDOW_CONTROL_CHANNELS.setWindowSize,
      request,
    ) as Promise<WindowBoundsSnapshot>;
  },
  setWindowSizePreset(request: SetWindowSizePresetRequest) {
    return ipcRenderer.invoke(
      WINDOW_CONTROL_CHANNELS.setWindowSizePreset,
      request,
    ) as Promise<WindowBoundsSnapshot>;
  },
  getWindowBounds() {
    return ipcRenderer.invoke(
      WINDOW_CONTROL_CHANNELS.getWindowBounds,
    ) as Promise<WindowBoundsSnapshot>;
  },
  getAlwaysOnTop() {
    return ipcRenderer.invoke(
      WINDOW_CONTROL_CHANNELS.getAlwaysOnTop,
    ) as Promise<boolean>;
  },
  setAlwaysOnTop(request: SetAlwaysOnTopRequest) {
    return ipcRenderer.invoke(
      WINDOW_CONTROL_CHANNELS.setAlwaysOnTop,
      request,
    ) as Promise<boolean>;
  },
  getPinned() {
    return ipcRenderer.invoke(
      WINDOW_CONTROL_CHANNELS.getPinned,
    ) as Promise<boolean>;
  },
  setPinned(request: SetPinnedRequest) {
    return ipcRenderer.invoke(
      WINDOW_CONTROL_CHANNELS.setPinned,
      request,
    ) as Promise<boolean>;
  },
  onWindowBoundsChanged(listener) {
    return subscribeToChannel(
      WINDOW_CONTROL_EVENT_CHANNELS.boundsChanged,
      listener,
    );
  },
  onAlwaysOnTopChanged(listener: (alwaysOnTop: boolean) => void) {
    return subscribeToChannel(
      WINDOW_CONTROL_EVENT_CHANNELS.alwaysOnTopChanged,
      listener,
    );
  },
  onPinnedChanged(listener: (pinned: boolean) => void) {
    return subscribeToChannel(
      WINDOW_CONTROL_EVENT_CHANNELS.pinnedChanged,
      listener,
    );
  },

};

const shortcutsBridge: ShortcutsBridge = {
  ensureConfig() {
    return ipcRenderer.invoke(SHORTCUTS_IPC_CHANNELS.ensureConfig);
  },
  getConfig() {
    return ipcRenderer.invoke(SHORTCUTS_IPC_CHANNELS.getConfig);
  },
  setShortcutEnabled(request) {
    return ipcRenderer.invoke(
      SHORTCUTS_IPC_CHANNELS.setShortcutEnabled,
      normalizeSetShortcutEnabledRequest(request),
    ) as Promise<void>;
  },
};

const aiProviderBridge: AiProviderBridge = {
  async getConfig() {
    return await ipcRenderer
      .invoke(AI_PROVIDER_CHANNELS.getConfig)
      .then(normalizeAiProviderConfig);
  },
  async setConfig(config) {
    const providerConfig = await ipcRenderer
      .invoke(
        AI_PROVIDER_CHANNELS.setConfig,
        normalizeAiProviderConfig(config),
      )
    return normalizeAiProviderConfig(providerConfig);
  },
  async getApiKeyStatus(provider) {
    return await ipcRenderer.invoke(AI_PROVIDER_CHANNELS.getApiKey, provider);
  },
  async setApiKey(provider, key) {
    return await ipcRenderer.invoke(AI_PROVIDER_CHANNELS.setApiKey, {
      provider,
      key,
    }) as Promise<void>;
  },
  deleteApiKey(provider) {
    return ipcRenderer.invoke(
      AI_PROVIDER_CHANNELS.deleteApiKey,
      provider,
    ) as Promise<void>;
  },
  async listModels(provider) {
    return ipcRenderer
      .invoke(AI_PROVIDER_CHANNELS.listModels, provider)
      .then(normalizeAiProviderModels);
  },
};

const captureOptionsBridge: CaptureOptionsBridge = {
  getConfig() {
    return ipcRenderer.invoke(
      CAPTURE_OPTIONS_CHANNELS.getConfig,
    ) as Promise<ReturnType<typeof normalizeCaptureOptionsConfig>>;
  },
  setConfig(config) {
    return ipcRenderer.invoke(
      CAPTURE_OPTIONS_CHANNELS.setConfig,
      normalizeCaptureOptionsConfig(config),
    ) as Promise<ReturnType<typeof normalizeCaptureOptionsConfig>>;
  },
  listDisplays() {
    return ipcRenderer.invoke(CAPTURE_OPTIONS_CHANNELS.listDisplays);
  },
  getPermissions() {
    return ipcRenderer.invoke(CAPTURE_OPTIONS_CHANNELS.getPermissions);
  },
  openMonitorPicker(request) {
    return ipcRenderer.invoke(CAPTURE_OPTIONS_CHANNELS.openMonitorPicker, request);
  },
  closeMonitorPicker() {
    return ipcRenderer.invoke(CAPTURE_OPTIONS_CHANNELS.closeMonitorPicker);
  },
  onSelectedDisplayChanged(listener) {
    return subscribeToChannel(
      CAPTURE_OPTIONS_EVENT_CHANNELS.selectedDisplayChanged,
      listener,
    );
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
  beginSandboxRecording(request) {
    return ipcRenderer.invoke(RECORDING_CHANNELS.beginSandboxRecording, request);
  },
  saveSandboxRecording(request) {
    return ipcRenderer.invoke(RECORDING_CHANNELS.saveSandboxRecording, {
      ...request,
      buffer: Array.from(new Uint8Array(request.buffer)),
    });
  },
  exportRecording(request) {
    return ipcRenderer.invoke(RECORDING_CHANNELS.exportRecording, request);
  },
  openRecordingsFolder(request) {
    return ipcRenderer.invoke(RECORDING_CHANNELS.openRecordingsFolder, request);
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

const transcriptionBridge: TranscriptionBridge = {
  transcribeAudio(request) {
    return ipcRenderer.invoke(
      TRANSCRIPTION_CHANNELS.transcribeAudio,
      request,
    ) as Promise<TranscriptionResult>;
  },
};

const transcriptionEventsBridge: TranscriptionEventsBridge = {
  onTranscriptSegment(listener) {
    return subscribeToChannel(
      TRANSCRIPTION_EVENT_CHANNELS.transcriptSegment,
      listener,
    );
  },
};

const modelInitBridge: ModelInitBridge = {
  startInit() {
    return ipcRenderer.invoke(MODEL_INIT_CHANNELS.startInit) as Promise<void>;
  },
  getStatus() {
    return ipcRenderer.invoke(MODEL_INIT_CHANNELS.getStatus);
  },
  onProgress(listener) {
    return subscribeToChannel(MODEL_INIT_EVENT_CHANNELS.progress, listener);
  },
  onReady(listener) {
    return subscribeToChannel(MODEL_INIT_EVENT_CHANNELS.ready, listener);
  },
  onError(listener) {
    return subscribeToChannel(MODEL_INIT_EVENT_CHANNELS.error, listener);
  },
};

const windowRegistryBridge: WindowRegistryBridge = {
  getContext() {
    return ipcRenderer.invoke(
      WINDOW_REGISTRY_CHANNELS.getContext,
    ) as Promise<WindowRegistryContext>;
  },
  getOpenState() {
    return ipcRenderer.invoke(
      WINDOW_REGISTRY_CHANNELS.getOpenState,
    ) as Promise<CardWindowsOpenState>;
  },
  openWindow(role) {
    return ipcRenderer.invoke(WINDOW_REGISTRY_CHANNELS.openWindow, role);
  },
  closeWindow(role) {
    return ipcRenderer.invoke(WINDOW_REGISTRY_CHANNELS.closeWindow, role);
  },
  focusWindow(role) {
    return ipcRenderer.invoke(WINDOW_REGISTRY_CHANNELS.focusWindow, role);
  },
  onOpenStateChanged(listener) {
    return subscribeToChannel(
      WINDOW_REGISTRY_EVENT_CHANNELS.openStateChanged,
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
  aiProvider: aiProviderBridge,
  captureOptions: captureOptionsBridge,
  appControls: appControlsBridge,
  windowControls: windowControlsBridge,
  shortcuts: shortcutsBridge,
  windowRegistry: windowRegistryBridge,
  modelInit: modelInitBridge,
  transcription: transcriptionBridge,
  transcriptionEvents: transcriptionEventsBridge,
};

contextBridge.exposeInMainWorld("electronApp", electronAppBridge);

// Ensure the shortcut config file exists before renderer reads it.
void ipcRenderer.invoke(SHORTCUTS_IPC_CHANNELS.ensureConfig).catch(() => {
  // If config creation fails, renderer will still show defaults/error state
  // based on subsequent getConfig() calls.
});
