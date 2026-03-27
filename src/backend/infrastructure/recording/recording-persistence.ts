import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SessionStorageLayoutResolver } from "../../application/ports/session-lifecycle";
import type { MediaChunkSource } from "../../../shared/session-lifecycle";
import type {
  PersistChunkResponse,
  PersistScreenshotResponse,
} from "../../../shared/recording";

/**
 * Default set of sources whose chunks are actually written to disk. All other
 * sources get a synthetic response so callers stay happy, but no file I/O
 * occurs. Override via the `persistedSources` option on the factory.
 *
 * TODO: promote to a runtime config flag (CAPTURE_PERSISTENCE_MODE) so the
 *       set of persisted sources can be changed without a code change.
 */
const DEFAULT_PERSISTED_CHUNK_SOURCES: ReadonlySet<MediaChunkSource> = new Set([
  "desktop-capture",
]);

export type RecordingPersistenceOptions = {
  readonly persistedSources?: ReadonlySet<MediaChunkSource>;
  readonly persistScreenshots?: boolean;
};

const MIME_TO_EXTENSION: Record<string, string> = {
  "audio/webm;codecs=opus": "webm",
  "audio/webm": "webm",
  "audio/ogg;codecs=opus": "ogg",
  "video/webm;codecs=vp9,opus": "webm",
  "video/webm;codecs=vp8,opus": "webm",
  "video/webm;codecs=av01,opus": "webm",
  "video/webm": "webm",
  "image/png": "png",
  "image/jpeg": "jpg",
};

function extensionForMime(mimeType: string): string {
  return MIME_TO_EXTENSION[mimeType] ?? "bin";
}

const SOURCE_DIRECTORY: Record<MediaChunkSource, string> = {
  microphone: "chunks/audio",
  webcam: "chunks/webcam",
  "desktop-capture": "chunks/desktop-capture",
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
  options?: RecordingPersistenceOptions,
): RecordingPersistenceService {
  const persistedSources = options?.persistedSources ?? DEFAULT_PERSISTED_CHUNK_SOURCES;
  const persistScreenshots = options?.persistScreenshots ?? false;

  return {
    async persistChunk(input) {
      if (!persistedSources.has(input.source)) {
        return {
          chunkId: randomUUID(),
          relativePath: `${SOURCE_DIRECTORY[input.source]}/skipped`,
          byteSize: 0,
        };
      }

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
      if (!persistScreenshots) {
        return {
          chunkId: randomUUID(),
          relativePath: "chunks/screenshots/skipped",
          byteSize: 0,
        };
      }

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
