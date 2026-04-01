import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SessionStorageLayoutResolver } from "../../application/ports/session-lifecycle";
import { fixWebmDuration } from "./webm-duration-fix";

export type ExportProgress = {
  readonly totalFiles: number;
  readonly completedFiles: number;
  readonly bytesWritten: number;
};

export type RecordingManifest = {
  readonly sessionId: string;
  readonly exportedAt: string;
  readonly sources: readonly RecordingManifestSource[];
  readonly exportFilePath: string;
};

export type RecordingManifestSource = {
  readonly source: string;
  readonly file?: RecordingManifestFile;
  readonly exportFilePath?: string;
};

export type RecordingManifestFile = {
  readonly relativePath: string;
  readonly byteSize: number;
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
};

export type RecordingExportSessionOptions = {
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly onProgress?: (source: string, progress: ExportProgress) => void;
};

export type RecordingExportService = {
  exportSession(
    sessionId: string,
    options?: RecordingExportSessionOptions,
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

const SOURCE_FILE_PREFIXES = [
  "desktop-capture",
  "microphone",
  "webcam",
  "system-audio",
  "screen-video",
  "screenshot",
];

function formatSessionFilename(startedAt: string | undefined, ext: string): string {
  const date = startedAt ? new Date(startedAt) : new Date();
  if (Number.isNaN(date.getTime())) {
    return `interview-recording.${ext}`;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());

  return `interview-${y}-${mo}-${d}_${h}-${mi}-${s}.${ext}`;
}

function computeDurationMs(
  startedAt: string | undefined,
  completedAt: string | undefined,
): number | null {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const ms = end - start;
  return ms > 0 ? ms : null;
}

async function findSourceFile(
  chunksDir: string,
  sourcePrefix: string,
): Promise<{ relativePath: string; byteSize: number } | null> {
  try {
    const entries = await readdir(chunksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name.startsWith(sourcePrefix)) {
        const fullPath = path.join(chunksDir, entry.name);
        const metadata = await stat(fullPath);
        if (metadata.size > 0) {
          return { relativePath: entry.name, byteSize: metadata.size };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Pre-scan sources to determine the primary source and its extension.
 * This allows us to generate the session filename before the copy loop.
 */
async function determinePrimaryExt(chunksRoot: string): Promise<string> {
  for (const sourcePrefix of SOURCE_FILE_PREFIXES) {
    if (!PRIMARY_SOURCES.has(sourcePrefix)) continue;
    const found = await findSourceFile(chunksRoot, sourcePrefix);
    if (found) {
      return path.extname(found.relativePath).replace(".", "") || "webm";
    }
  }
  return "webm";
}

export function createRecordingExportService(
  storageLayoutResolver: SessionStorageLayoutResolver,
): RecordingExportService {
  return {
    async exportSession(sessionId, options) {
      const sessionLayout = storageLayoutResolver.resolveSessionLayout(sessionId);
      const recordingsRoot = sessionLayout.recordingsRoot;
      const chunksRoot = sessionLayout.chunksRoot;
      let primaryExt = "webm";
      if (recordingsRoot) {
        await mkdir(recordingsRoot, { recursive: true });
      }

      if (chunksRoot) {
        primaryExt = await determinePrimaryExt(chunksRoot);
      }
      // we seem to be calling this function before the chunks are created, so we need to handle the case where the chunksRoot is not set
      const sessionFileName = formatSessionFilename(options?.startedAt, primaryExt);
      const durationMs = computeDurationMs(options?.startedAt, options?.completedAt);

      const manifestSources: RecordingManifestSource[] = [];
      const sourceExports: SourceExportResult[] = [];
      let primaryChosen = false;
      const sessionExportFilePath = path.join(sessionLayout.sessionRoot, sessionFileName);

      for (const sourcePrefix of SOURCE_FILE_PREFIXES) {
        const found = await findSourceFile(chunksRoot ?? "", sourcePrefix);
        if (!found) continue;

        const ext = path.extname(found.relativePath).replace(".", "") || "webm";
        let sourceExportFileName: string | undefined;

        if (EXPORTABLE_SOURCES.has(sourcePrefix)) {
          const isPrimary = !primaryChosen && PRIMARY_SOURCES.has(sourcePrefix);
          if (isPrimary) {
            primaryChosen = true;
            sourceExportFileName = sessionFileName;
          } else {
            sourceExportFileName = `${sourcePrefix}.${ext}`;
          }
          // add a skip check for the chunksRoot and recordingsRoot
          if (!chunksRoot || !recordingsRoot) {
            continue;
          }
          const sourcePath = path.join(chunksRoot ?? "", found.relativePath);
          const outputPath = path.join(recordingsRoot ?? "", sourceExportFileName);

          await copyFile(sourcePath, outputPath);

          if (ext === "webm" && durationMs != null && durationMs > 0) {
            try {
              await fixWebmDuration(outputPath, durationMs);
            } catch {
              // Duration patching is best-effort; don't fail the export.
            }
          }
          // this should absolutely be batched and not called for each file, make this a promise pool when we revist this.
          options?.onProgress?.(sourcePrefix, {
            totalFiles: 1,
            completedFiles: 1,
            bytesWritten: found.byteSize,
          });

          sourceExports.push({
            source: sourcePrefix,
            exportFilePath: outputPath,
            totalBytes: found.byteSize,
          });
        }

        manifestSources.push({
          source: sourcePrefix,
          file: {
            relativePath: found.relativePath,
            byteSize: found.byteSize,
          },
          exportFilePath: sourceExportFileName,
        });
      }

      const exportedAt = new Date().toISOString();
      const manifest: RecordingManifest = {
        sessionId,
        exportedAt,
        sources: manifestSources,
        exportFilePath: sessionFileName,
      };

      const manifestPath = path.join(sessionLayout.sessionRoot, "manifest.json");
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

      return {
        exportFilePath: sessionExportFilePath,
        manifestPath,
        sourceExports,
      };
    },
  };
}
