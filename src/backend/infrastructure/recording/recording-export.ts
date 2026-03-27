import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SessionStorageLayoutResolver } from "../../application/ports/session-lifecycle";
import {
  concatenateChunkFiles,
  type ConcatenationProgress,
} from "./recording-concatenation-pipeline";

export type RecordingManifest = {
  readonly sessionId: string;
  readonly exportedAt: string;
  readonly sources: readonly RecordingManifestSource[];
  readonly exportFilePath: string;
};

export type RecordingManifestSource = {
  readonly source: string;
  readonly chunks: readonly RecordingManifestChunk[];
  readonly exportFilePath?: string;
};

export type RecordingManifestChunk = {
  readonly relativePath: string;
  readonly byteSize: number;
  readonly sequenceNumber: number;
};

export type RecordingExportResult = {
  readonly exportFilePath: string;
  readonly manifestPath: string;
  readonly sourceExports: readonly SourceExportResult[];
};

export type SourceExportResult = {
  readonly source: string;
  readonly exportFilePath: string;
  readonly totalBytes: number;
  readonly chunksProcessed: number;
  readonly skippedChunks: readonly string[];
};

export type RecordingExportOptions = {
  readonly onProgress?: (
    source: string,
    progress: ConcatenationProgress,
  ) => void;
};

export type RecordingExportService = {
  exportSession(
    sessionId: string,
    options?: RecordingExportOptions,
  ): Promise<RecordingExportResult>;
};

const PRIMARY_SOURCES = new Set([
  "desktop-capture",
  "screen-video",
  "webcam",
  "microphone",
]);

const EXPORTABLE_SOURCES = new Set([
  "desktop-capture",
  "screen-video",
  "webcam",
  "microphone",
  "system-audio",
]);

function extractSequenceNumber(filename: string): number {
  const match = /-(\d+)-\d+\./.exec(filename);
  return match ? parseInt(match[1], 10) : 0;
}

async function listChunksInDirectory(
  directoryPath: string,
): Promise<{ relativePath: string; byteSize: number; sequenceNumber: number }[]> {
  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const chunks: { relativePath: string; byteSize: number; sequenceNumber: number }[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const fullPath = path.join(directoryPath, entry.name);
      const metadata = await stat(fullPath);
      chunks.push({
        relativePath: entry.name,
        byteSize: metadata.size,
        sequenceNumber: extractSequenceNumber(entry.name),
      });
    }

    chunks.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    return chunks;
  } catch {
    return [];
  }
}

export function createRecordingExportService(
  storageLayoutResolver: SessionStorageLayoutResolver,
): RecordingExportService {
  return {
    async exportSession(sessionId, options) {
      const sessionLayout = storageLayoutResolver.resolveSessionLayout(sessionId);
      const recordingsRoot = sessionLayout.recordingsRoot;
      await mkdir(recordingsRoot, { recursive: true });

      const sourceDirectories: { source: string; dir: string }[] = [
        {
          source: "desktop-capture",
          dir: path.join(sessionLayout.chunksRoot, "desktop-capture"),
        },
        { source: "microphone", dir: path.join(sessionLayout.chunksRoot, "audio") },
        { source: "webcam", dir: path.join(sessionLayout.chunksRoot, "webcam") },
        { source: "system-audio", dir: path.join(sessionLayout.chunksRoot, "system-audio") },
        { source: "screen-video", dir: path.join(sessionLayout.chunksRoot, "screen-video") },
        { source: "screenshot", dir: path.join(sessionLayout.chunksRoot, "screenshots") },
      ];

      const manifestSources: RecordingManifestSource[] = [];
      const sourceExports: SourceExportResult[] = [];
      let primaryChosen = false;
      let sessionExportExt = "webm";

      for (const { source, dir } of sourceDirectories) {
        const chunks = await listChunksInDirectory(dir);
        if (chunks.length === 0) {
          continue;
        }

        const firstFile = chunks[0]?.relativePath ?? "";
        const ext = path.extname(firstFile).replace(".", "") || "webm";

        let sourceExportFileName: string | undefined;

        if (EXPORTABLE_SOURCES.has(source)) {
          const isPrimary = !primaryChosen && PRIMARY_SOURCES.has(source);
          if (isPrimary) {
            primaryChosen = true;
            sessionExportExt = ext;
          }

          sourceExportFileName = isPrimary
            ? `session.${ext}`
            : `${source}.${ext}`;

          const outputPath = path.join(recordingsRoot, sourceExportFileName);
          const chunkPaths = chunks.map((c) => path.join(dir, c.relativePath));

          const result = await concatenateChunkFiles(chunkPaths, outputPath, {
            onProgress: options?.onProgress
              ? (progress) => options.onProgress!(source, progress)
              : undefined,
          });

          sourceExports.push({
            source,
            exportFilePath: outputPath,
            totalBytes: result.totalBytes,
            chunksProcessed: result.chunksProcessed,
            skippedChunks: result.skippedChunks,
          });
        }

        manifestSources.push({
          source,
          chunks: chunks.map((c) => ({
            relativePath: c.relativePath,
            byteSize: c.byteSize,
            sequenceNumber: c.sequenceNumber,
          })),
          exportFilePath: sourceExportFileName,
        });
      }

      const sessionExportFileName = `session.${sessionExportExt}`;
      const sessionExportFilePath = path.join(recordingsRoot, sessionExportFileName);

      const exportedAt = new Date().toISOString();
      const manifest: RecordingManifest = {
        sessionId,
        exportedAt,
        sources: manifestSources,
        exportFilePath: sessionExportFileName,
      };

      const manifestPath = path.join(recordingsRoot, "manifest.json");
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

      return {
        exportFilePath: sessionExportFilePath,
        manifestPath,
        sourceExports,
      };
    },
  };
}
