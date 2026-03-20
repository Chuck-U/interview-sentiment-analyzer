import type { CaptureErrorCode, SandboxRecordingKind } from "./recording";

export const SIMPLE_RECORDING_STATUSES = [
  "idle",
  "requesting-permission",
  "recording",
  "stopping",
  "stopped",
  "error",
] as const;

const DESKTOP_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

const MICROPHONE_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const;

export type SimpleRecordingStatus = (typeof SIMPLE_RECORDING_STATUSES)[number];
export type SimpleRecordingKind = SandboxRecordingKind;

export type RecorderChunkLike = {
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type RecorderEventLike = {
  readonly data: RecorderChunkLike;
};

export type RecorderStateLike = "inactive" | "recording" | "paused";

export type RecorderLike = {
  readonly state: RecorderStateLike;
  readonly mimeType?: string;
  ondataavailable: ((event: RecorderEventLike) => void) | null;
  onerror: (() => void) | null;
  onstop: (() => void) | null;
  start(): void;
  stop(): void;
};

export type MediaTrackLike = {
  stop(): void;
};

export type MediaStreamLike = {
  getTracks(): readonly MediaTrackLike[];
};

export type MediaDevicesPort<TStream extends MediaStreamLike = MediaStreamLike> = {
  getDisplayMedia(constraints: {
    readonly video: boolean;
    readonly audio: boolean;
  }): Promise<TStream>;
  getUserMedia(constraints: {
    readonly audio: boolean;
    readonly video: boolean;
  }): Promise<TStream>;
};

export type SimpleRecordingSnapshot = {
  readonly status: SimpleRecordingStatus;
  readonly kind: SimpleRecordingKind | null;
  readonly mimeType?: string;
  readonly targetDirectory?: string;
  readonly savedFilePath?: string;
  readonly errorCode?: CaptureErrorCode;
  readonly errorMessage?: string;
  readonly startedAt?: string;
  readonly chunkCount: number;
};

export type SimpleRecordingResult<TBlob> = {
  readonly kind: SimpleRecordingKind;
  readonly mimeType: string;
  readonly startedAt: string;
  readonly stoppedAt: string;
  readonly chunkCount: number;
  readonly byteLength: number;
  readonly blob: TBlob;
};

export type SimpleRecordingDependencies<
  TStream extends MediaStreamLike,
  TRecorder extends RecorderLike,
  TBlob,
> = {
  readonly mediaDevices: MediaDevicesPort<TStream>;
  readonly createRecorder: (stream: TStream, mimeType?: string) => TRecorder;
  readonly isMimeTypeSupported: (mimeType: string) => boolean;
  readonly createBlob: (
    parts: readonly ArrayBuffer[],
    options: { readonly type: string },
  ) => TBlob;
  readonly now?: () => string;
  readonly onStateChanged?: (snapshot: SimpleRecordingSnapshot) => void;
};

type ActiveRecording<
  TStream extends MediaStreamLike,
  TRecorder extends RecorderLike,
> = {
  readonly kind: SimpleRecordingKind;
  readonly stream: TStream;
  readonly recorder: TRecorder;
  readonly mimeType: string;
  readonly startedAt: string;
};

function getMimeTypeCandidates(
  kind: SimpleRecordingKind,
): readonly string[] {
  switch (kind) {
    case "desktop":
      return DESKTOP_MIME_CANDIDATES;
    case "microphone":
      return MICROPHONE_MIME_CANDIDATES;
    default: {
      const exhaustiveCheck: never = kind;
      return exhaustiveCheck;
    }
  }
}

function canRetryWithoutMimeType(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "NotSupportedError" ||
    error.message.toLowerCase().includes("not supported")
  );
}

export function selectSimpleRecordingMimeType(
  kind: SimpleRecordingKind,
  isMimeTypeSupported: (mimeType: string) => boolean,
): string | undefined {
  return getMimeTypeCandidates(kind).find((mimeType) =>
    isMimeTypeSupported(mimeType),
  );
}

export function classifySimpleRecordingError(error: unknown): {
  readonly errorCode: CaptureErrorCode;
  readonly errorMessage: string;
} {
  const errorMessage =
    error instanceof Error ? error.message : String(error);
  const normalized = errorMessage.toLowerCase();

  if (
    normalized.includes("permission") ||
    normalized.includes("denied") ||
    normalized.includes("notallowed")
  ) {
    return {
      errorCode: "permission-denied",
      errorMessage,
    };
  }

  if (normalized.includes("not supported")) {
    return {
      errorCode: "not-supported",
      errorMessage,
    };
  }

  return {
    errorCode: "device-unavailable",
    errorMessage,
  };
}

export class SimpleRecordingController<
  TStream extends MediaStreamLike,
  TRecorder extends RecorderLike,
  TBlob,
> {
  private readonly dependencies: SimpleRecordingDependencies<
    TStream,
    TRecorder,
    TBlob
  >;

  private activeRecording: ActiveRecording<TStream, TRecorder> | null = null;
  private chunkPromises: Promise<ArrayBuffer>[] = [];
  private snapshot: SimpleRecordingSnapshot = {
    status: "idle",
    kind: null,
    chunkCount: 0,
  };

  constructor(
    dependencies: SimpleRecordingDependencies<TStream, TRecorder, TBlob>,
  ) {
    this.dependencies = dependencies;
  }

  getSnapshot(): SimpleRecordingSnapshot {
    return this.snapshot;
  }

  async start(
    kind: SimpleRecordingKind,
    targetDirectory?: string,
  ): Promise<SimpleRecordingSnapshot> {
    if (this.activeRecording) {
      throw new Error("A sandbox recording is already in progress.");
    }

    const mimeType = selectSimpleRecordingMimeType(
      kind,
      this.dependencies.isMimeTypeSupported,
    );

    if (!mimeType) {
      this.updateSnapshot({
        status: "error",
        kind,
        mimeType: undefined,
        targetDirectory,
        savedFilePath: undefined,
        errorCode: "not-supported",
        errorMessage: `No supported MIME type available for ${kind}.`,
        startedAt: undefined,
        chunkCount: 0,
      });
      throw new Error(`No supported MIME type available for ${kind}.`);
    }

    this.chunkPromises = [];
    this.updateSnapshot({
      status: "requesting-permission",
      kind,
      mimeType,
      targetDirectory,
      savedFilePath: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      startedAt: undefined,
      chunkCount: 0,
    });

    try {
      const stream =
        kind === "desktop"
          ? await this.dependencies.mediaDevices.getDisplayMedia({
              video: true,
              audio: true,
            })
          : await this.dependencies.mediaDevices.getUserMedia({
              audio: true,
              video: false,
            });
      const { recorder, mimeType: resolvedMimeType } =
        this.createRecorderWithFallback(stream, kind);
      const startedAt = this.getNow();

      recorder.ondataavailable = (event) => {
        if (event.data.size <= 0) {
          return;
        }

        const chunkPromise = event.data.arrayBuffer();
        this.chunkPromises.push(chunkPromise);
      };

      recorder.onerror = () => {
        this.updateSnapshot({
          ...this.snapshot,
          status: "error",
          errorCode: "recorder-failed",
          errorMessage: "Sandbox MediaRecorder encountered an error.",
        });
      };

      recorder.start();

      this.activeRecording = {
        kind,
        stream,
        recorder,
        mimeType: resolvedMimeType,
        startedAt,
      };

      this.updateSnapshot({
        status: "recording",
        kind,
        mimeType: resolvedMimeType,
        targetDirectory,
        savedFilePath: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        startedAt,
        chunkCount: 0,
      });

      return this.snapshot;
    } catch (error) {
      const classified = classifySimpleRecordingError(error);
      this.updateSnapshot({
        status: "error",
        kind,
        mimeType,
        targetDirectory,
        savedFilePath: undefined,
        errorCode: classified.errorCode,
        errorMessage: classified.errorMessage,
        startedAt: undefined,
        chunkCount: 0,
      });
      throw error;
    }
  }

  async stop(): Promise<SimpleRecordingResult<TBlob> | null> {
    const activeRecording = this.activeRecording;
    if (!activeRecording) {
      return null;
    }

    this.updateSnapshot({
      ...this.snapshot,
      status: "stopping",
    });

    const stopPromise = new Promise<void>((resolve) => {
      const originalOnStop = activeRecording.recorder.onstop;
      activeRecording.recorder.onstop = () => {
        if (originalOnStop) {
          originalOnStop();
        }
        resolve();
      };
    });

    if (activeRecording.recorder.state !== "inactive") {
      activeRecording.recorder.stop();
    }

    await stopPromise;

    const parts = await Promise.all(this.chunkPromises);
    const byteLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const blob = this.dependencies.createBlob(parts, {
      type: activeRecording.mimeType,
    });
    const stoppedAt = this.getNow();

    for (const track of activeRecording.stream.getTracks()) {
      track.stop();
    }

    const result: SimpleRecordingResult<TBlob> = {
      kind: activeRecording.kind,
      mimeType: activeRecording.mimeType,
      startedAt: activeRecording.startedAt,
      stoppedAt,
      chunkCount: parts.length,
      byteLength,
      blob,
    };

    this.activeRecording = null;
    this.chunkPromises = [];
    this.updateSnapshot({
      status: "stopped",
      kind: result.kind,
      mimeType: result.mimeType,
      targetDirectory: this.snapshot.targetDirectory,
      savedFilePath: this.snapshot.savedFilePath,
      errorCode: undefined,
      errorMessage: undefined,
      startedAt: result.startedAt,
      chunkCount: result.chunkCount,
    });

    return result;
  }

  dispose(): void {
    if (!this.activeRecording) {
      return;
    }

    for (const track of this.activeRecording.stream.getTracks()) {
      track.stop();
    }

    this.activeRecording = null;
    this.chunkPromises = [];
    this.updateSnapshot({
      status: "idle",
      kind: null,
      mimeType: undefined,
      targetDirectory: undefined,
      savedFilePath: undefined,
      errorCode: undefined,
      errorMessage: undefined,
      startedAt: undefined,
      chunkCount: 0,
    });
  }

  setSavedFilePath(filePath: string): void {
    this.updateSnapshot({
      ...this.snapshot,
      savedFilePath: filePath,
    });
  }

  private getNow(): string {
    return this.dependencies.now?.() ?? new Date().toISOString();
  }

  private updateSnapshot(snapshot: SimpleRecordingSnapshot): void {
    this.snapshot = snapshot;
    this.dependencies.onStateChanged?.(snapshot);
  }

  private createRecorderWithFallback(
    stream: TStream,
    kind: SimpleRecordingKind,
  ): { readonly recorder: TRecorder; readonly mimeType: string } {
    const supportedCandidates = getMimeTypeCandidates(kind).filter((mimeType) =>
      this.dependencies.isMimeTypeSupported(mimeType),
    );

    for (const mimeType of supportedCandidates) {
      try {
        const recorder = this.dependencies.createRecorder(stream, mimeType);
        return {
          recorder,
          mimeType: recorder.mimeType || mimeType,
        };
      } catch (error) {
        if (!canRetryWithoutMimeType(error)) {
          throw error;
        }
      }
    }

    const recorder = this.dependencies.createRecorder(stream);
    return {
      recorder,
      mimeType: recorder.mimeType || supportedCandidates[0] || "video/webm",
    };
  }
}
