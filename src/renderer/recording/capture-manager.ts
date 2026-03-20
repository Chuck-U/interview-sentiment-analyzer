import type {
  CaptureErrorCode,
  CaptureSourceSnapshot,
  CaptureSourceState,
  RecordingStateSnapshot,
  RecordingExportStatus,
} from "@/shared/recording";
import type { MediaChunkSource } from "@/shared/session-lifecycle";

const DEFAULT_CHUNK_INTERVAL_MS = 15_000;
const DEFAULT_SCREENSHOT_INTERVAL_MS = 10_000;

const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

const VIDEO_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function pickSupportedMimeType(candidates: string[]): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

type SourceRecorder = {
  readonly source: MediaChunkSource;
  readonly mediaRecorder: MediaRecorder;
  readonly stream: MediaStream;
  sequenceNumber: number;
  chunkCount: number;
  latestChunkPath?: string;
  state: CaptureSourceState;
  errorCode?: CaptureErrorCode;
  errorMessage?: string;
  chunkIntervalId?: ReturnType<typeof setInterval>;
};

type ScreenshotCapture = {
  readonly videoElement: HTMLVideoElement;
  readonly canvas: OffscreenCanvas;
  readonly stream: MediaStream;
  sequenceNumber: number;
  chunkCount: number;
  latestChunkPath?: string;
  state: CaptureSourceState;
  errorCode?: CaptureErrorCode;
  errorMessage?: string;
  intervalId?: ReturnType<typeof setInterval>;
};

export type CaptureManagerCallbacks = {
  onChunkAvailable(
    sessionId: string,
    source: MediaChunkSource,
    sequenceNumber: number,
    mimeType: string,
    recordedAt: string,
    buffer: ArrayBuffer,
  ): Promise<{ chunkId: string; relativePath: string; byteSize: number }>;
  onScreenshotAvailable(
    sessionId: string,
    sequenceNumber: number,
    mimeType: string,
    capturedAt: string,
    buffer: ArrayBuffer,
  ): Promise<{ chunkId: string; relativePath: string; byteSize: number }>;
  onStateChanged(state: RecordingStateSnapshot): void;
  onCaptureError(
    sessionId: string,
    source: MediaChunkSource,
    errorCode: CaptureErrorCode,
    errorMessage: string,
  ): void;
};

export class CaptureManager {
  private sessionId: string | null = null;
  private recorders = new Map<MediaChunkSource, SourceRecorder>();
  private screenshotCapture: ScreenshotCapture | null = null;
  private exportStatus: RecordingExportStatus = "idle";
  private exportFilePath?: string;
  private exportErrorMessage?: string;
  private callbacks: CaptureManagerCallbacks;

  constructor(callbacks: CaptureManagerCallbacks) {
    this.callbacks = callbacks;
  }

  async startCapture(
    sessionId: string,
    sources: readonly MediaChunkSource[],
  ): Promise<void> {
    this.sessionId = sessionId;
    this.exportStatus = "idle";
    this.exportFilePath = undefined;
    this.exportErrorMessage = undefined;

    const startPromises: Promise<void>[] = [];

    for (const source of sources) {
      if (source === "screenshot") {
        continue;
      }
      startPromises.push(this.startSourceRecorder(sessionId, source));
    }

    await Promise.allSettled(startPromises);

    if (sources.includes("screenshot") || sources.includes("screen-video")) {
      const screenRecorder = this.recorders.get("screen-video");
      if (screenRecorder) {
        this.startScreenshotCapture(sessionId, screenRecorder.stream);
      }
    }

    this.publishState();
  }

  async stopCapture(): Promise<void> {
    const flushPromises: Promise<void>[] = [];

    for (const [, recorder] of this.recorders) {
      flushPromises.push(this.stopSourceRecorder(recorder));
    }

    if (this.screenshotCapture) {
      this.stopScreenshotCapture();
    }

    await Promise.allSettled(flushPromises);
    this.publishState();
  }

  getState(): RecordingStateSnapshot {
    const sources: CaptureSourceSnapshot[] = [];

    for (const [, recorder] of this.recorders) {
      sources.push({
        source: recorder.source,
        state: recorder.state,
        chunkCount: recorder.chunkCount,
        latestChunkPath: recorder.latestChunkPath,
        errorCode: recorder.errorCode,
        errorMessage: recorder.errorMessage,
      });
    }

    if (this.screenshotCapture) {
      sources.push({
        source: "screenshot",
        state: this.screenshotCapture.state,
        chunkCount: this.screenshotCapture.chunkCount,
        latestChunkPath: this.screenshotCapture.latestChunkPath,
        errorCode: this.screenshotCapture.errorCode,
        errorMessage: this.screenshotCapture.errorMessage,
      });
    }

    return {
      sessionId: this.sessionId ?? "",
      sources,
      totalChunkCount: sources.reduce((sum, s) => sum + s.chunkCount, 0),
      exportStatus: this.exportStatus,
      exportFilePath: this.exportFilePath,
      exportErrorMessage: this.exportErrorMessage,
    };
  }

  setExportStatus(
    status: RecordingExportStatus,
    filePath?: string,
    errorMessage?: string,
  ): void {
    this.exportStatus = status;
    this.exportFilePath = filePath;
    this.exportErrorMessage = errorMessage;
    this.publishState();
  }

  destroy(): void {
    for (const [, recorder] of this.recorders) {
      if (recorder.chunkIntervalId) {
        clearInterval(recorder.chunkIntervalId);
      }
      if (recorder.mediaRecorder.state !== "inactive") {
        try {
          recorder.mediaRecorder.stop();
        } catch {
          // already stopped
        }
      }
      for (const track of recorder.stream.getTracks()) {
        track.stop();
      }
    }
    this.recorders.clear();

    if (this.screenshotCapture) {
      if (this.screenshotCapture.intervalId) {
        clearInterval(this.screenshotCapture.intervalId);
      }
      for (const track of this.screenshotCapture.stream.getTracks()) {
        track.stop();
      }
      this.screenshotCapture = null;
    }
  }

  private async startSourceRecorder(
    sessionId: string,
    source: MediaChunkSource,
  ): Promise<void> {
    const initial: Omit<SourceRecorder, "mediaRecorder" | "stream"> = {
      source,
      sequenceNumber: 0,
      chunkCount: 0,
      state: "requesting-permission",
    };

    let stream: MediaStream;
    let mimeType: string;

    try {
      if (source === "microphone") {
        const supported = pickSupportedMimeType(AUDIO_MIME_CANDIDATES);
        if (!supported) {
          this.handleSourceError(sessionId, source, "not-supported", "No supported audio MIME type");
          return;
        }
        mimeType = supported;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
      } else if (source === "screen-video") {
        const supported = pickSupportedMimeType(VIDEO_MIME_CANDIDATES);
        if (!supported) {
          this.handleSourceError(sessionId, source, "not-supported", "No supported video MIME type");
          return;
        }
        mimeType = supported;
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
      } else if (source === "system-audio") {
        const supported = pickSupportedMimeType(AUDIO_MIME_CANDIDATES);
        if (!supported) {
          this.handleSourceError(sessionId, source, "not-supported", "No supported audio MIME type");
          return;
        }
        mimeType = supported;
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: false,
          audio: true,
        });
      } else {
        return;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const code: CaptureErrorCode = errorMessage.includes("Permission")
        ? "permission-denied"
        : "device-unavailable";
      this.handleSourceError(sessionId, source, code, errorMessage);
      return;
    }

    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    const recorder: SourceRecorder = {
      ...initial,
      mediaRecorder,
      stream,
      state: "capturing",
    };

    this.recorders.set(source, recorder);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        void this.handleChunkData(sessionId, recorder, mimeType, event.data);
      }
    };

    mediaRecorder.onerror = () => {
      recorder.state = "error";
      recorder.errorCode = "recorder-failed";
      recorder.errorMessage = "MediaRecorder encountered an error";
      this.callbacks.onCaptureError(
        sessionId,
        source,
        "recorder-failed",
        "MediaRecorder encountered an error",
      );
      this.publishState();
    };

    stream.getTracks().forEach((track) => {
      track.onended = () => {
        if (recorder.state === "capturing") {
          recorder.state = "stopped";
          recorder.errorCode = "stream-ended";
          recorder.errorMessage = "Media stream ended unexpectedly";
          if (recorder.chunkIntervalId) {
            clearInterval(recorder.chunkIntervalId);
          }
          this.callbacks.onCaptureError(
            sessionId,
            source,
            "stream-ended",
            "Media stream ended unexpectedly",
          );
          this.publishState();
        }
      };
    });

    mediaRecorder.start();

    recorder.chunkIntervalId = setInterval(() => {
      if (mediaRecorder.state === "recording") {
        mediaRecorder.requestData();
      }
    }, DEFAULT_CHUNK_INTERVAL_MS);

    this.publishState();
  }

  private async handleChunkData(
    sessionId: string,
    recorder: SourceRecorder,
    mimeType: string,
    data: Blob,
  ): Promise<void> {
    const sequenceNumber = recorder.sequenceNumber;
    recorder.sequenceNumber += 1;

    try {
      const buffer = await data.arrayBuffer();
      const result = await this.callbacks.onChunkAvailable(
        sessionId,
        recorder.source,
        sequenceNumber,
        mimeType,
        new Date().toISOString(),
        buffer,
      );
      recorder.chunkCount += 1;
      recorder.latestChunkPath = result.relativePath;
      this.publishState();
    } catch (error) {
      recorder.errorCode = "disk-write-failed";
      recorder.errorMessage = error instanceof Error ? error.message : "Chunk persistence failed";
      this.callbacks.onCaptureError(
        sessionId,
        recorder.source,
        "disk-write-failed",
        recorder.errorMessage,
      );
      this.publishState();
    }
  }

  private startScreenshotCapture(
    sessionId: string,
    screenStream: MediaStream,
  ): void {
    const videoTrack = screenStream.getVideoTracks()[0];
    if (!videoTrack) {
      return;
    }

    const settings = videoTrack.getSettings();
    const width = settings.width ?? 1920;
    const height = settings.height ?? 1080;

    const videoElement = document.createElement("video");
    videoElement.srcObject = new MediaStream([videoTrack]);
    videoElement.muted = true;
    void videoElement.play();

    const canvas = new OffscreenCanvas(width, height);

    this.screenshotCapture = {
      videoElement,
      canvas,
      stream: screenStream,
      sequenceNumber: 0,
      chunkCount: 0,
      state: "capturing",
    };

    this.screenshotCapture.intervalId = setInterval(() => {
      void this.captureScreenshot(sessionId);
    }, DEFAULT_SCREENSHOT_INTERVAL_MS);
  }

  private async captureScreenshot(sessionId: string): Promise<void> {
    if (!this.screenshotCapture || this.screenshotCapture.state !== "capturing") {
      return;
    }

    const { videoElement, canvas } = this.screenshotCapture;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    try {
      const blob = await canvas.convertToBlob({ type: "image/png" });
      const buffer = await blob.arrayBuffer();
      const sequenceNumber = this.screenshotCapture.sequenceNumber;
      this.screenshotCapture.sequenceNumber += 1;

      const result = await this.callbacks.onScreenshotAvailable(
        sessionId,
        sequenceNumber,
        "image/png",
        new Date().toISOString(),
        buffer,
      );
      this.screenshotCapture.chunkCount += 1;
      this.screenshotCapture.latestChunkPath = result.relativePath;
      this.publishState();
    } catch (error) {
      this.screenshotCapture.errorCode = "disk-write-failed";
      this.screenshotCapture.errorMessage =
        error instanceof Error ? error.message : "Screenshot persistence failed";
      this.callbacks.onCaptureError(
        sessionId,
        "screenshot",
        "disk-write-failed",
        this.screenshotCapture.errorMessage,
      );
      this.publishState();
    }
  }

  private async stopSourceRecorder(recorder: SourceRecorder): Promise<void> {
    recorder.state = "stopping";

    if (recorder.chunkIntervalId) {
      clearInterval(recorder.chunkIntervalId);
      recorder.chunkIntervalId = undefined;
    }

    if (recorder.mediaRecorder.state === "recording") {
      await new Promise<void>((resolve) => {
        const originalHandler = recorder.mediaRecorder.ondataavailable;

        recorder.mediaRecorder.ondataavailable = (event) => {
          if (originalHandler) {
            originalHandler.call(recorder.mediaRecorder, event);
          }
          resolve();
        };

        recorder.mediaRecorder.stop();
      });
    }

    for (const track of recorder.stream.getTracks()) {
      track.stop();
    }

    recorder.state = "stopped";
  }

  private stopScreenshotCapture(): void {
    if (!this.screenshotCapture) {
      return;
    }

    if (this.screenshotCapture.intervalId) {
      clearInterval(this.screenshotCapture.intervalId);
      this.screenshotCapture.intervalId = undefined;
    }

    this.screenshotCapture.state = "stopped";
  }

  private handleSourceError(
    sessionId: string,
    source: MediaChunkSource,
    errorCode: CaptureErrorCode,
    errorMessage: string,
  ): void {
    this.callbacks.onCaptureError(sessionId, source, errorCode, errorMessage);
  }

  private publishState(): void {
    this.callbacks.onStateChanged(this.getState());
  }
}
