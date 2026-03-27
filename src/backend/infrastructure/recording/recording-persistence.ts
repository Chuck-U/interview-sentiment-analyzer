import { randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SessionStorageLayoutResolver } from "../../application/ports/session-lifecycle";
import type { MediaChunkSource } from "../../../shared/session-lifecycle";
import type {
  PersistChunkResponse,
  PersistScreenshotResponse,
} from "../../../shared/recording";
import { extensionForMime } from "../../../shared/recording-constants";

/**
 * Default set of sources whose chunks are actually written to disk. All other
 * sources get a synthetic response so callers stay happy, but no file I/O
 * occurs. Override via the `persistedSources` option on the factory.
 */
const DEFAULT_PERSISTED_CHUNK_SOURCES: ReadonlySet<MediaChunkSource> = new Set([
  "desktop-capture",
]);

export type RecordingPersistenceOptions = {
  readonly persistedSources?: ReadonlySet<MediaChunkSource>;
  readonly persistScreenshots?: boolean;
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

  /**
   * Tracks whether the first chunk for a session+source has been written.
   * First chunk uses writeFile (create); subsequent chunks use appendFile.
   */
  const initializedFiles = new Set<string>();

  return {
    async persistChunk(input) {
      if (!persistedSources.has(input.source)) {
        return {
          chunkId: randomUUID(),
          relativePath: `chunks/skipped`,
          byteSize: 0,
        };
      }

      const ext = extensionForMime(input.mimeType);
      const filename = `${input.source}.${ext}`;
      const relativePath = `chunks/${filename}`;
      const absolutePath = storageLayoutResolver.resolveAbsoluteArtifactPath(
        input.sessionId,
        relativePath,
      );

      await mkdir(path.dirname(absolutePath), { recursive: true });

      const fileKey = `${input.sessionId}:${input.source}`;
      if (initializedFiles.has(fileKey)) {
        await appendFile(absolutePath, input.buffer);
      } else {
        await writeFile(absolutePath, input.buffer);
        initializedFiles.add(fileKey);
      }

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
          relativePath: "chunks/skipped",
          byteSize: 0,
        };
      }

      const ext = extensionForMime(input.mimeType);
      const filename = `screenshot-${String(input.sequenceNumber).padStart(5, "0")}-${Date.now()}.${ext}`;
      const relativePath = `chunks/${filename}`;
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
