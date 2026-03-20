import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  classifySimpleRecordingError,
  type MediaDevicesPort,
  type MediaStreamLike,
  type MediaTrackLike,
  type RecorderChunkLike,
  type RecorderEventLike,
  type RecorderLike,
  selectSimpleRecordingMimeType,
  SimpleRecordingController,
} from "../../shared/recording-sandbox";
import { createRecordingSandboxPersistenceService } from "../infrastructure/recording/recording-sandbox-persistence";

function toArrayBuffer(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

class FakeTrack implements MediaTrackLike {
  stopped = false;

  stop(): void {
    this.stopped = true;
  }
}

class FakeStream implements MediaStreamLike {
  readonly tracks: readonly FakeTrack[];

  constructor(trackCount = 1) {
    this.tracks = Array.from({ length: trackCount }, () => new FakeTrack());
  }

  getTracks(): readonly FakeTrack[] {
    return this.tracks;
  }
}

class FakeChunk implements RecorderChunkLike {
  readonly size: number;
  private readonly payload: string;

  constructor(payload: string) {
    this.payload = payload;
    this.size = Buffer.byteLength(payload);
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return toArrayBuffer(this.payload);
  }
}

class FakeRecorder implements RecorderLike {
  state: "inactive" | "recording" | "paused" = "inactive";
  readonly mimeType?: string;
  ondataavailable: ((event: RecorderEventLike) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  private readonly payloads: readonly string[];

  constructor(payloads: readonly string[], mimeType?: string) {
    this.payloads = payloads;
    this.mimeType = mimeType;
  }

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    for (const payload of this.payloads) {
      this.ondataavailable?.({
        data: new FakeChunk(payload),
      });
    }
    this.onstop?.();
  }
}

test("selectSimpleRecordingMimeType prefers the first supported candidate", () => {
  const supportedTypes = new Set([
    "video/webm",
    "audio/webm",
  ]);

  assert.equal(
    selectSimpleRecordingMimeType("desktop", (mimeType) =>
      supportedTypes.has(mimeType),
    ),
    "video/webm",
  );
  assert.equal(
    selectSimpleRecordingMimeType("microphone", (mimeType) =>
      supportedTypes.has(mimeType),
    ),
    "audio/webm",
  );
});

test("SimpleRecordingController starts desktop capture through getDisplayMedia", async () => {
  const desktopStream = new FakeStream(2);
  let displayRequest: { readonly video: boolean; readonly audio: boolean } | null =
    null;
  const mediaDevices: MediaDevicesPort<FakeStream> = {
    async getDisplayMedia(constraints) {
      displayRequest = constraints;
      return desktopStream;
    },
    async getUserMedia() {
      throw new Error("getUserMedia should not be called for desktop capture");
    },
  };

  const controller = new SimpleRecordingController<FakeStream, FakeRecorder, Buffer>({
    mediaDevices,
    createRecorder: (_stream, mimeType) =>
      new FakeRecorder(["desktop-video"], mimeType),
    isMimeTypeSupported: (mimeType) => mimeType === "video/webm",
    createBlob: (parts) =>
      Buffer.concat(parts.map((part) => Buffer.from(part))),
    now: () => "2026-03-19T16:00:00.000Z",
  });

  const snapshot = await controller.start("desktop");

  assert.deepEqual(displayRequest, { video: true, audio: true });
  assert.equal(snapshot.status, "recording");
  assert.equal(snapshot.kind, "desktop");
  assert.equal(snapshot.mimeType, "video/webm");
});

test("SimpleRecordingController stop assembles the raw recording and stops tracks", async () => {
  const microphoneStream = new FakeStream();
  const recorder = new FakeRecorder(["hello ", "world"]);
  const mediaDevices: MediaDevicesPort<FakeStream> = {
    async getDisplayMedia() {
      throw new Error("desktop capture should not be called");
    },
    async getUserMedia(constraints) {
      assert.deepEqual(constraints, { audio: true, video: false });
      return microphoneStream;
    },
  };

  const controller = new SimpleRecordingController<FakeStream, FakeRecorder, Buffer>({
    mediaDevices,
    createRecorder: () => recorder,
    isMimeTypeSupported: (mimeType) => mimeType === "audio/webm",
    createBlob: (parts) =>
      Buffer.concat(parts.map((part) => Buffer.from(part))),
    now: (() => {
      const values = [
        "2026-03-19T16:00:00.000Z",
        "2026-03-19T16:00:05.000Z",
      ];
      let index = 0;
      return () => values[index++] ?? values.at(-1)!;
    })(),
  });

  await controller.start("microphone");
  const result = await controller.stop();

  assert.ok(result);
  assert.equal(result.kind, "microphone");
  assert.equal(result.mimeType, "audio/webm");
  assert.equal(result.chunkCount, 2);
  assert.equal(result.byteLength, Buffer.byteLength("hello world"));
  assert.equal(result.blob.toString("utf8"), "hello world");
  assert.ok(microphoneStream.tracks.every((track) => track.stopped));
  assert.equal(controller.getSnapshot().status, "stopped");
});

test("SimpleRecordingController surfaces unsupported and permission errors", async () => {
  const unsupported = new SimpleRecordingController<FakeStream, FakeRecorder, Buffer>({
    mediaDevices: {
      async getDisplayMedia() {
        return new FakeStream();
      },
      async getUserMedia() {
        return new FakeStream();
      },
    },
    createRecorder: () => new FakeRecorder([]),
    isMimeTypeSupported: () => false,
    createBlob: () => Buffer.alloc(0),
  });

  await assert.rejects(() => unsupported.start("desktop"));
  assert.equal(unsupported.getSnapshot().errorCode, "not-supported");

  const classified = classifySimpleRecordingError(
    new Error("Permission denied by user"),
  );
  assert.deepEqual(classified, {
    errorCode: "permission-denied",
    errorMessage: "Permission denied by user",
  });
});

test("SimpleRecordingController falls back when a supported desktop mime type still throws", async () => {
  const desktopStream = new FakeStream(2);
  const attempts: Array<string | undefined> = [];

  const controller = new SimpleRecordingController<FakeStream, FakeRecorder, Buffer>({
    mediaDevices: {
      async getDisplayMedia() {
        return desktopStream;
      },
      async getUserMedia() {
        throw new Error("microphone capture should not be used");
      },
    },
    createRecorder: (_stream, mimeType) => {
      attempts.push(mimeType);
      if (mimeType) {
        const error = new Error("Not supported");
        error.name = "NotSupportedError";
        throw error;
      }
      return new FakeRecorder(["desktop-video"], "video/webm");
    },
    isMimeTypeSupported: (mimeType) => mimeType === "video/webm",
    createBlob: (parts) =>
      Buffer.concat(parts.map((part) => Buffer.from(part))),
  });

  const snapshot = await controller.start("desktop");

  assert.deepEqual(attempts, ["video/webm", undefined]);
  assert.equal(snapshot.status, "recording");
  assert.equal(snapshot.mimeType, "video/webm");
});

test("recording sandbox persistence writes the final desktop capture file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "recording-sandbox-test-"));
  const outputDirectory = path.join(root, "sandbox");
  const service = createRecordingSandboxPersistenceService(outputDirectory);

  try {
    const begin = await service.beginRecording({
      kind: "desktop",
    });
    assert.equal(begin.outputDirectory, outputDirectory);

    const result = await service.saveRecording({
      kind: "desktop",
      mimeType: "video/webm",
      startedAt: "2026-03-19T16:00:00.000Z",
      stoppedAt: "2026-03-19T16:00:05.000Z",
      buffer: Buffer.from("sandbox-video"),
    });

    assert.ok(result.filePath.endsWith(".webm"));
    assert.equal(result.byteSize, Buffer.byteLength("sandbox-video"));
    assert.equal(
      await readFile(result.filePath, "utf8"),
      "sandbox-video",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
