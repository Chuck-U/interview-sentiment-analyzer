import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { logger } from "../../../lib/logger";
import type { SessionTranscriptArtifactV1, TranscriptionResult } from "../../../shared/transcription";
import { isAudioMediaChunkSource, type AudioMediaSource } from "../../../shared/session-lifecycle";
import type { SessionStorageLayoutResolver } from "../../application/ports/session-lifecycle";
import { parseTranscribeAudioRequest } from "../../guards/transcribe-audio-request";
import { createTranscribeAudioUseCase } from "../../application/use-cases/transcribe-audio";

export type TranscribeAudioIpcHandlerDependencies = {
  readonly getPipeline: (modelId: string) => Promise<unknown>;
  readonly storageLayoutResolver: SessionStorageLayoutResolver;
};

const Log = logger.forSource("TranscriptionController");
export function createTranscribeAudioIpcHandler(
  dependencies: TranscribeAudioIpcHandlerDependencies,
) {
  async function persistTranscriptToDisk(
    absolutePath: string,
    artifact: SessionTranscriptArtifactV1,
  ): Promise<void> {
    // Keep the serialization format identical to the original inline handler.
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(
      absolutePath,
      JSON.stringify(artifact, null, 2),
      "utf8",
    );
  }

  const transcribeAudioUseCase = createTranscribeAudioUseCase({
    getPipeline: dependencies.getPipeline,
    storageLayoutResolver: dependencies.storageLayoutResolver,
    persistTranscriptToDisk,
  });

  return async (_event: unknown, input: unknown): Promise<TranscriptionResult> => {
    Log.ger({
      type: "info",
      message: "[transcription] transcribeAudio IPC invoked",
      data: {
        hasPayload: typeof input === "object" && input !== null,
      },
    });

    try {
      const parsedRequest = parseTranscribeAudioRequest(input);
      const { sessionId, chunkId, pcmSamples } = parsedRequest;

      // parseTranscribeAudioRequest validates the source as audio-compatible,
      // but the shared `TranscriptionRequest` type is broader (`MediaChunkSource`).
      if (!isAudioMediaChunkSource(parsedRequest.source)) {
        // Should be unreachable if guard logic stays aligned.
        throw new Error("transcribeAudio requires a supported audio source");
      }
      const source: AudioMediaSource = parsedRequest.source;

      Log.ger({
        type: "info",
        message: "[transcription] request accepted; running ASR",
        data: {
          sessionId: sessionId.slice(0, 8),
          chunkId,
          source,
          pcmSamples: pcmSamples.length,
        },
      });

      const pcm = new Float32Array(pcmSamples.length);
      for (let i = 0; i < pcmSamples.length; i += 1) {
        const n = pcmSamples[i];
        pcm[i] = typeof n === "number" && Number.isFinite(n) ? n : 0;
      }

      return await transcribeAudioUseCase({
        pcm,
        sessionId,
        chunkId,
        source,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      const body =
        typeof input === "object" && input !== null
          ? (input as Record<string, unknown>)
          : undefined;

      if (
        err instanceof Error &&
        err.message === "transcribeAudio requires a supported audio source"
      ) {
        Log.ger({
          type: "error",
          message: "[transcription] rejected: unsupported audio source",
          data: { source: body?.source },
        });
      }

      Log.ger({
        type: "error",
        message: "[transcription] transcribeAudio failed",
        data: {
          error: message,
          stack,
          sessionId:
            typeof body?.sessionId === "string"
              ? body.sessionId.slice(0, 8)
              : undefined,
          chunkId:
            typeof body?.chunkId === "string" ? body.chunkId : undefined,
          source: body?.source,
        },
      });
      throw err;
    }
  };
}

