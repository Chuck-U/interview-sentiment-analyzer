import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SessionStorageLayoutResolver } from "../../application/ports/session-lifecycle";
import type { MediaChunkSource } from "../../../shared/session-lifecycle";
import type {
  PersistChunkResponse,
  PersistScreenshotResponse,
} from "../../../shared/recording";

const MIME_TO_EXTENSION: Record<string, string> = {
  "audio/webm;codecs=opus": "webm",
  "audio/webm": "webm",
  "audio/ogg;codecs=opus": "ogg",
  "video/webm;codecs=vp9,opus": "webm",
  "video/webm;codecs=vp8,opus": "webm",
  "video/webm": "webm",
  "image/png": "png",
  "image/jpeg": "jpg",
};

function extensionForMime(mimeType: string): string {
  return MIME_TO_EXTENSION[mimeType] ?? "bin";
}

const SOURCE_DIRECTORY: Record<MediaChunkSource, string> = {
  microphone: "chunks/audio",
  "system-audio": "chunks/system-audio",
  "screen-video": "chunks/screen-video",
  screenshot: "chunks/screenshots",
};

export type RecordingPersistenceService = {
  persistChunk(input: {
    readonly sessionId: string;
    readonly source: MediaChunkSource;
    readonly sequenceNumber: number;
    readonly mimeType: string;
    readonly recordedAt: string;
    readonly buffer: Buffer;
  }): Promise<PersistChunkResponse>;

  persistScreenshot(input: {
    readonly sessionId: string;
    readonly sequenceNumber: number;
    readonly mimeType: string;
    readonly capturedAt: string;
    readonly buffer: Buffer;
  }): Promise<PersistScreenshotResponse>;
};

export function createRecordingPersistenceService(
  storageLayoutResolver: SessionStorageLayoutResolver,
): RecordingPersistenceService {
  return {
    async persistChunk(input) {
      const ext = extensionForMime(input.mimeType);
      const filename = `${input.source}-${String(input.sequenceNumber).padStart(5, "0")}-${Date.now()}.${ext}`;
      const sourceDir = SOURCE_DIRECTORY[input.source];
      const relativePath = `${sourceDir}/${filename}`;
      const absolutePath = storageLayoutResolver.resolveAbsoluteArtifactPath(
        input.sessionId,
        relativePath,
      );

      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, input.buffer);

      return {
        chunkId: randomUUID(),
        relativePath,
        byteSize: input.buffer.length,
      };
    },

    async persistScreenshot(input) {
      const ext = extensionForMime(input.mimeType);
      const filename = `screenshot-${String(input.sequenceNumber).padStart(5, "0")}-${Date.now()}.${ext}`;
      const relativePath = `chunks/screenshots/${filename}`;
      const absolutePath = storageLayoutResolver.resolveAbsoluteArtifactPath(
        input.sessionId,
        relativePath,
      );

      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, input.buffer);

      return {
        chunkId: randomUUID(),
        relativePath,
        byteSize: input.buffer.length,
      };
    },
  };
}
