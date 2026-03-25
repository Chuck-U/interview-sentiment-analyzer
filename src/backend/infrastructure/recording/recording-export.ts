import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { SessionStorageLayoutResolver } from "../../application/ports/session-lifecycle";

export type RecordingManifest = {
  readonly sessionId: string;
  readonly exportedAt: string;
  readonly sources: readonly RecordingManifestSource[];
  readonly exportFilePath: string;
};

export type RecordingManifestSource = {
  readonly source: string;
  readonly chunks: readonly RecordingManifestChunk[];
};

export type RecordingManifestChunk = {
  readonly relativePath: string;
  readonly byteSize: number;
  readonly sequenceNumber: number;
};

export type RecordingExportResult = {
  readonly exportFilePath: string;
  readonly manifestPath: string;
};

export type RecordingExportService = {
  exportSession(sessionId: string): Promise<RecordingExportResult>;
};

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
    async exportSession(sessionId) {
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
      let primaryExportSourceDir = "";
      let primaryExportExt = "webm";

      for (const { source, dir } of sourceDirectories) {
        const chunks = await listChunksInDirectory(dir);
        if (chunks.length === 0) {
          continue;
        }

        manifestSources.push({
          source,
          chunks: chunks.map((c) => ({
            relativePath: c.relativePath,
            byteSize: c.byteSize,
            sequenceNumber: c.sequenceNumber,
          })),
        });

        if (
          !primaryExportSourceDir &&
          (
            source === "desktop-capture" ||
            source === "screen-video" ||
            source === "webcam" ||
            source === "microphone"
          )
        ) {
          primaryExportSourceDir = dir;
          const firstFile = chunks[0]?.relativePath ?? "";
          primaryExportExt = path.extname(firstFile).replace(".", "") || "webm";
        }
      }

      const exportFileName = `session.${primaryExportExt}`;
      const exportFilePath = path.join(recordingsRoot, exportFileName);

      if (primaryExportSourceDir) {
        const chunks = await listChunksInDirectory(primaryExportSourceDir);

        if (chunks.length === 1) {
          await copyFile(
            path.join(primaryExportSourceDir, chunks[0].relativePath),
            exportFilePath,
          );
        } else if (chunks.length > 1) {
          const output = createWriteStream(exportFilePath);
          const passThrough = new PassThrough();

          const pipelinePromise = pipeline(passThrough, output);

          for (const chunk of chunks) {
            const chunkPath = path.join(primaryExportSourceDir, chunk.relativePath);
            const readable = createReadStream(chunkPath);
            await new Promise<void>((resolve, reject) => {
              readable.on("error", reject);
              readable.on("end", resolve);
              readable.pipe(passThrough, { end: false });
            });
          }

          passThrough.end();
          await pipelinePromise;
        }
      }

      const exportedAt = new Date().toISOString();
      const manifest: RecordingManifest = {
        sessionId,
        exportedAt,
        sources: manifestSources,
        exportFilePath: exportFileName,
      };

      const manifestPath = path.join(recordingsRoot, "manifest.json");
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

      return {
        exportFilePath,
        manifestPath,
      };
    },
  };
}
