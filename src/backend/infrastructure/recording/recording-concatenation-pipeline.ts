import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, stat } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";

export type ConcatenationProgress = {
  readonly totalChunks: number;
  readonly completedChunks: number;
  readonly bytesWritten: number;
};

export type ConcatenationResult = {
  readonly outputPath: string;
  readonly totalBytes: number;
  readonly chunksProcessed: number;
  readonly skippedChunks: readonly string[];
};

export type ConcatenationPipelineOptions = {
  readonly onProgress?: (progress: ConcatenationProgress) => void;
};

/**
 * Concatenates an ordered list of chunk files into a single output file using
 * streaming I/O. For WebM files produced by the same MediaRecorder session,
 * binary concatenation is valid because `requestData()` flushes internal
 * buffers as sequential Matroska Cluster elements.
 *
 * Handles edge cases: zero chunks (no-op), single chunk (file copy), and
 * missing/unreadable chunks (skipped with warning in the result).
 */
export async function concatenateChunkFiles(
  chunkPaths: readonly string[],
  outputPath: string,
  options?: ConcatenationPipelineOptions,
): Promise<ConcatenationResult> {
  if (chunkPaths.length === 0) {
    return {
      outputPath,
      totalBytes: 0,
      chunksProcessed: 0,
      skippedChunks: [],
    };
  }

  if (chunkPaths.length === 1) {
    try {
      const metadata = await stat(chunkPaths[0]);
      await copyFile(chunkPaths[0], outputPath);
      options?.onProgress?.({
        totalChunks: 1,
        completedChunks: 1,
        bytesWritten: metadata.size,
      });
      return {
        outputPath,
        totalBytes: metadata.size,
        chunksProcessed: 1,
        skippedChunks: [],
      };
    } catch {
      return {
        outputPath,
        totalBytes: 0,
        chunksProcessed: 0,
        skippedChunks: [chunkPaths[0]],
      };
    }
  }

  const output = createWriteStream(outputPath);
  const passThrough = new PassThrough();
  const pipelinePromise = pipeline(passThrough, output);

  let bytesWritten = 0;
  let chunksProcessed = 0;
  const skippedChunks: string[] = [];

  for (const chunkPath of chunkPaths) {
    try {
      const metadata = await stat(chunkPath);
      const readable = createReadStream(chunkPath);

      await new Promise<void>((resolve, reject) => {
        readable.on("error", reject);
        readable.on("end", resolve);
        readable.pipe(passThrough, { end: false });
      });

      bytesWritten += metadata.size;
      chunksProcessed += 1;

      options?.onProgress?.({
        totalChunks: chunkPaths.length,
        completedChunks: chunksProcessed,
        bytesWritten,
      });
    } catch {
      skippedChunks.push(chunkPath);
    }
  }

  passThrough.end();
  await pipelinePromise;

  return {
    outputPath,
    totalBytes: bytesWritten,
    chunksProcessed,
    skippedChunks,
  };
}
