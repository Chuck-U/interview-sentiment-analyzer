import type {
  CaptureErrorCode,
  CaptureSourceSnapshot,
  CaptureSourceState,
  RecordingStateSnapshot,
  RecordingExportStatus,
} from "@/shared/recording";
import type { CaptureOptionsConfig } from "@/shared/capture-options";
import type { MediaChunkSource } from "@/shared/session-lifecycle";
import { AUDIO_MIME_CANDIDATES, VIDEO_MIME_CANDIDATES, DEFAULT_CHUNK_INTERVAL_MS, DEFAULT_SCREENSHOT_INTERVAL_MS } from "./constants";


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
  activeDeviceId?: string;
  activeDisplayId?: string;
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
  activeDisplayId?: string;
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
  private displayStream: MediaStream | null = null;
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
    captureOptions: CaptureOptionsConfig,
  ): Promise<void> {
    this.sessionId = sessionId;
    this.exportStatus = "idle";
    this.exportFilePath = undefined;
    this.exportErrorMessage = undefined;

    const startPromises: Promise<void>[] = [];

    if (sources.some((source) => this.isDisplaySource(source))) {
      startPromises.push(
        this.startDisplayCapture(sessionId, sources, captureOptions),
      );
    }

    if (sources.includes("microphone")) {
      startPromises.push(
        this.startMicrophoneRecorder(sessionId, captureOptions),
      );
    }

    if (sources.includes("webcam")) {
      startPromises.push(this.startWebcamRecorder(sessionId, captureOptions));
    }

    await Promise.allSettled(startPromises);
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

    if (this.displayStream) {
      for (const track of this.displayStream.getTracks()) {
        track.stop();
      }
      this.displayStream = null;
    }

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
        activeDeviceId: recorder.activeDeviceId,
        activeDisplayId: recorder.activeDisplayId,
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
        activeDisplayId: this.screenshotCapture.activeDisplayId,
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

    if (this.displayStream) {
      for (const track of this.displayStream.getTracks()) {
        track.stop();
      }
      this.displayStream = null;
    }
  }

  private isDisplaySource(source: MediaChunkSource): boolean {
    return (
      source === "screen-video" ||
      source === "system-audio" ||
      source === "screenshot"
    );
  }

  private async startMicrophoneRecorder(
    sessionId: string,
    captureOptions: CaptureOptionsConfig,
  ): Promise<void> {
    await this.startUserMediaRecorder(sessionId, "microphone", {
      audio: captureOptions.microphone.deviceId
        ? {
          deviceId: { exact: captureOptions.microphone.deviceId },
        }
        : true,
      video: false,
    });
  }

  private async startWebcamRecorder(
    sessionId: string,
    captureOptions: CaptureOptionsConfig,
  ): Promise<void> {
    await this.startUserMediaRecorder(sessionId, "webcam", {
      audio: false,
      video: captureOptions.webcam.deviceId
        ? {
          deviceId: { exact: captureOptions.webcam.deviceId },
        }
        : true,
    });
  }

  private async startUserMediaRecorder(
    sessionId: string,
    source: "microphone" | "webcam",
    constraints: MediaStreamConstraints,
  ): Promise<void> {
    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const code: CaptureErrorCode = errorMessage.includes("Permission")
        ? "permission-denied"
        : "device-unavailable";
      this.handleSourceError(sessionId, source, code, errorMessage);
      return;
    }

    const activeDeviceId =
      source === "microphone"
        ? stream.getAudioTracks()[0]?.getSettings().deviceId
        : stream.getVideoTracks()[0]?.getSettings().deviceId;

    await this.startRecorderForStream(
      sessionId,
      source,
      stream,
      source === "microphone" ? AUDIO_MIME_CANDIDATES : VIDEO_MIME_CANDIDATES,
      {
        activeDeviceId,
      },
    );
  }

  private async startDisplayCapture(
    sessionId: string,
    sources: readonly MediaChunkSource[],
    captureOptions: CaptureOptionsConfig,
  ): Promise<void> {
    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: sources.includes("system-audio"),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const code: CaptureErrorCode = errorMessage.includes("Permission")
        ? "permission-denied"
        : "device-unavailable";

      if (sources.includes("screen-video")) {
        this.handleSourceError(sessionId, "screen-video", code, errorMessage);
      }
      if (sources.includes("system-audio")) {
        this.handleSourceError(sessionId, "system-audio", code, errorMessage);
      }
      if (sources.includes("screenshot")) {
        this.handleSourceError(sessionId, "screenshot", code, errorMessage);
      }
      return;
    }

    this.displayStream = stream;

    const activeDisplayId = captureOptions.display.displayId;
    const videoTrack = stream.getVideoTracks()[0];
    const audioTracks = stream.getAudioTracks();

    if (sources.includes("screen-video")) {
      if (!videoTrack) {
        this.handleSourceError(
          sessionId,
          "screen-video",
          "device-unavailable",
          "No display video track is available",
        );
      } else {
        await this.startRecorderForStream(
          sessionId,
          "screen-video",
          new MediaStream([videoTrack.clone()]),
          VIDEO_MIME_CANDIDATES,
          {
            activeDisplayId,
          },
        );
      }
    }

    if (sources.includes("system-audio")) {
      if (audioTracks.length === 0) {
        this.handleSourceError(
          sessionId,
          "system-audio",
          "device-unavailable",
          "System audio is unavailable for the selected display",
        );
      } else {
        await this.startRecorderForStream(
          sessionId,
          "system-audio",
          new MediaStream(audioTracks.map((track) => track.clone())),
          AUDIO_MIME_CANDIDATES,
          {
            activeDisplayId,
          },
        );
      }
    }

    if ((sources.includes("screenshot") || sources.includes("screen-video")) && videoTrack) {
      this.startScreenshotCapture(
        sessionId,
        new MediaStream([videoTrack.clone()]),
        activeDisplayId,
      );
    }
  }

  private async startRecorderForStream(
    sessionId: string,
    source: MediaChunkSource,
    stream: MediaStream,
    mimeCandidates: readonly string[],
    activeSelection: {
      readonly activeDeviceId?: string;
      readonly activeDisplayId?: string;
    },
  ): Promise<void> {
    const supported = pickSupportedMimeType([...mimeCandidates]);
    if (!supported) {
      this.handleSourceError(
        sessionId,
        source,
        "not-supported",
        `No supported MIME type is available for ${source}`,
      );
      for (const track of stream.getTracks()) {
        track.stop();
      }
      return;
    }

    const recorder: SourceRecorder = {
      source,
      mediaRecorder: new MediaRecorder(stream, { mimeType: supported }),
      stream,
      activeDeviceId: activeSelection.activeDeviceId,
      activeDisplayId: activeSelection.activeDisplayId,
      sequenceNumber: 0,
      chunkCount: 0,
      state: "capturing",
    };

    this.recorders.set(source, recorder);

    recorder.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        void this.handleChunkData(sessionId, recorder, supported, event.data);
      }
    };

    recorder.mediaRecorder.onerror = () => {
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

    recorder.mediaRecorder.start();

    recorder.chunkIntervalId = setInterval(() => {
      if (recorder.mediaRecorder.state === "recording") {
        recorder.mediaRecorder.requestData();
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
    activeDisplayId?: string,
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
      activeDisplayId,
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
