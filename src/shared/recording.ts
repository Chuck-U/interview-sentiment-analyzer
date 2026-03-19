import type { MediaChunkSource, Unsubscribe } from "./session-lifecycle";

export const CAPTURE_SOURCE_STATES = [
  "idle",
  "requesting-permission",
  "capturing",
  "stopping",
  "error",
  "stopped",
] as const;

export const CAPTURE_ERROR_CODES = [
  "permission-denied",
  "device-unavailable",
  "stream-ended",
  "recorder-failed",
  "disk-write-failed",
  "not-supported",
] as const;

export const RECORDING_EXPORT_STATUSES = [
  "idle",
  "queued",
  "assembling",
  "completed",
  "failed",
] as const;

export const SANDBOX_RECORDING_KINDS = [
  "desktop",
  "microphone",
] as const;

export type CaptureSourceState = (typeof CAPTURE_SOURCE_STATES)[number];
export type CaptureErrorCode = (typeof CAPTURE_ERROR_CODES)[number];
export type RecordingExportStatus = (typeof RECORDING_EXPORT_STATUSES)[number];
export type SandboxRecordingKind = (typeof SANDBOX_RECORDING_KINDS)[number];

export type CaptureSourceSnapshot = {
  readonly source: MediaChunkSource;
  readonly state: CaptureSourceState;
  readonly chunkCount: number;
  readonly latestChunkPath?: string;
  readonly activeDeviceId?: string;
  readonly activeDisplayId?: string;
  readonly errorCode?: CaptureErrorCode;
  readonly errorMessage?: string;
};

export type RecordingStateSnapshot = {
  readonly sessionId: string;
  readonly sources: readonly CaptureSourceSnapshot[];
  readonly totalChunkCount: number;
  readonly exportStatus: RecordingExportStatus;
  readonly exportFilePath?: string;
  readonly exportErrorMessage?: string;
};

export type PersistChunkRequest = {
  readonly sessionId: string;
  readonly source: MediaChunkSource;
  readonly sequenceNumber: number;
  readonly mimeType: string;
  readonly recordedAt: string;
  readonly buffer: ArrayBuffer;
};

export type PersistChunkResponse = {
  readonly chunkId: string;
  readonly relativePath: string;
  readonly byteSize: number;
};

export type PersistScreenshotRequest = {
  readonly sessionId: string;
  readonly sequenceNumber: number;
  readonly mimeType: string;
  readonly capturedAt: string;
  readonly buffer: ArrayBuffer;
};

export type PersistScreenshotResponse = {
  readonly chunkId: string;
  readonly relativePath: string;
  readonly byteSize: number;
};

export type ExportRecordingRequest = {
  readonly sessionId: string;
};

export type ExportRecordingResponse = {
  readonly exportStatus: RecordingExportStatus;
  readonly exportFilePath?: string;
};

export type BeginSandboxRecordingRequest = {
  readonly kind: SandboxRecordingKind;
};

export type BeginSandboxRecordingResponse = {
  readonly outputDirectory: string;
};

export type SaveSandboxRecordingRequest = {
  readonly kind: SandboxRecordingKind;
  readonly mimeType: string;
  readonly startedAt: string;
  readonly stoppedAt: string;
  readonly buffer: ArrayBuffer;
};

export type SaveSandboxRecordingResponse = {
  readonly filePath: string;
  readonly byteSize: number;
};

export type RecordingBridge = {
  persistChunk(request: PersistChunkRequest): Promise<PersistChunkResponse>;
  persistScreenshot(
    request: PersistScreenshotRequest,
  ): Promise<PersistScreenshotResponse>;
  beginSandboxRecording(
    request: BeginSandboxRecordingRequest,
  ): Promise<BeginSandboxRecordingResponse>;
  saveSandboxRecording(
    request: SaveSandboxRecordingRequest,
  ): Promise<SaveSandboxRecordingResponse>;
  exportRecording(
    request: ExportRecordingRequest,
  ): Promise<ExportRecordingResponse>;
};

export type RecordingEventsBridge = {
  onRecordingStateChanged(
    listener: (state: RecordingStateSnapshot) => void,
  ): Unsubscribe;
  onChunkPersisted(
    listener: (result: PersistChunkResponse & { readonly sessionId: string; readonly source: MediaChunkSource }) => void,
  ): Unsubscribe;
  onCaptureError(
    listener: (error: {
      readonly sessionId: string;
      readonly source: MediaChunkSource;
      readonly errorCode: CaptureErrorCode;
      readonly errorMessage: string;
    }) => void,
  ): Unsubscribe;
  onExportProgress(
    listener: (progress: {
      readonly sessionId: string;
      readonly exportStatus: RecordingExportStatus;
      readonly exportFilePath?: string;
      readonly errorMessage?: string;
    }) => void,
  ): Unsubscribe;
};
