import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  BeginSandboxRecordingResponse,
  SandboxRecordingKind,
  SaveSandboxRecordingResponse,
} from "../../../shared/recording";
import { extensionForMime } from "../../../shared/recording-constants";

function sanitizeTimestamp(value: string): string {
  return value.replace(/[:.]/g, "-");
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
