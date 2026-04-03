import type { IpcMain } from "electron";

import type { SessionLifecycleController } from "../../interfaces/controllers/session-lifecycle-controller";
import type { RecordingPersistenceService } from "../recording/recording-persistence";
import type { MediaChunkSource } from "../../../shared/session-lifecycle";
import { RECORDING_CHANNELS } from "./recording-channels";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error("Expected an array of numbers");
  }
  return value.map((v) => {
    if (typeof v !== "number") {
      throw new Error("Expected number in buffer array");
    }
    return v;
  });
}

export function registerRecordingIpc(
  ipcMain: IpcMain,
  persistence: RecordingPersistenceService,
  controller: SessionLifecycleController,
): void {
  ipcMain.handle(
    RECORDING_CHANNELS.persistChunk,
    async (_event, input: unknown) => {
      if (!isRecord(input)) {
        throw new Error("persistChunk request must be an object");
      }

      const sessionId = input.sessionId as string;
      const source = input.source as MediaChunkSource;
      const sequenceNumber = input.sequenceNumber as number;
      const mimeType = input.mimeType as string;
      const recordedAt = input.recordedAt as string;
      const bufferArray = parseNumberArray(input.buffer);
      const buffer = Buffer.from(bufferArray);

      const result = await persistence.persistChunk({
        sessionId,
        source,
        sequenceNumber,
        mimeType,
        recordedAt,
        buffer,
      });

      // Only register chunks that were actually written to disk.
      // Skipped sources return byteSize: 0 from the persistence service.
      if (result.byteSize > 0) {
        await controller.registerMediaChunk({
          sessionId,
          chunkId: result.chunkId,
          source,
          relativePath: result.relativePath,
          recordedAt,
          byteSize: result.byteSize,
        });
      }

      return result;
    },
  );

  ipcMain.handle(
    RECORDING_CHANNELS.persistScreenshot,
    async (_event, input: unknown) => {
      if (!isRecord(input)) {
        throw new Error("persistScreenshot request must be an object");
      }

      const sessionId = input.sessionId as string;
      const sequenceNumber = input.sequenceNumber as number;
      const mimeType = input.mimeType as string;
      const capturedAt = input.capturedAt as string;
      const bufferArray = parseNumberArray(input.buffer);
      const buffer = Buffer.from(bufferArray);

      const result = await persistence.persistScreenshot({
        sessionId,
        sequenceNumber,
        mimeType,
        capturedAt,
        buffer,
      });

      if (result.byteSize > 0) {
        await controller.registerMediaChunk({
          sessionId,
          chunkId: result.chunkId,
          source: "screenshot",
          relativePath: result.relativePath,
          recordedAt: capturedAt,
          byteSize: result.byteSize,
        });
      }

      return result;
    },
  );
}
