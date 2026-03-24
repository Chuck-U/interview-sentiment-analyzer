import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  BeginSandboxRecordingResponse,
  SandboxRecordingKind,
  SaveSandboxRecordingResponse,
} from "../../../shared/recording";

const MIME_TO_EXTENSION: Record<string, string> = {
  "audio/webm;codecs=opus": "webm",
  "audio/webm": "webm",
  "audio/ogg;codecs=opus": "ogg",
  "video/webm;codecs=vp9,opus": "webm",
  "video/webm;codecs=vp8,opus": "webm",
  "video/webm;codecs=av01,opus": "webm",
  "video/webm": "webm",
};

function sanitizeTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
}

function extensionForMime(mimeType: string): string {
  return MIME_TO_EXTENSION[mimeType] ?? "webm";
}

export type RecordingSandboxPersistenceService = {
  beginRecording(input: {
    readonly kind: SandboxRecordingKind;
  }): Promise<BeginSandboxRecordingResponse>;
  saveRecording(input: {
    readonly kind: SandboxRecordingKind;
    readonly mimeType: string;
    readonly startedAt: string;
    readonly stoppedAt: string;
    readonly buffer: Buffer;
  }): Promise<SaveSandboxRecordingResponse>;
};

export function createRecordingSandboxPersistenceService(
  outputDirectory: string,
): RecordingSandboxPersistenceService {
  return {
    async beginRecording() {
      await mkdir(outputDirectory, { recursive: true });
      return {
        outputDirectory,
      };
    },
    async saveRecording(input) {
      await mkdir(outputDirectory, { recursive: true });

      const extension = extensionForMime(input.mimeType);
      const startedAt = sanitizeTimestamp(input.startedAt);
      const stoppedAt = sanitizeTimestamp(input.stoppedAt);
      const filename =
        `${input.kind}-capture-${startedAt}-to-${stoppedAt}.${extension}`;
      const filePath = path.join(outputDirectory, filename);

      await writeFile(filePath, input.buffer);

      return {
        filePath,
        byteSize: input.buffer.length,
      };
    },
  };
}
