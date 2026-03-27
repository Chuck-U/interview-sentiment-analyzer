// TODO: restore when per-chunk transcript persistence is re-enabled
// import path from "node:path";

import { logger } from "../../../lib/logger";
import {
  // buildSessionTranscriptArtifact,
  // getSessionTranscriptRelativePath,
  type SessionTranscriptArtifactV1,
  type TranscriptionResult,
} from "../../../shared/transcription";
import type { AudioMediaSource } from "../../../shared/session-lifecycle";
import type { SessionStorageLayoutResolver } from "../ports/session-lifecycle";
import { normalizeAsrOutput } from "../../guards/normalize-asr-output";

export type TranscribeAudioInput = {
  readonly pcm: Float32Array;
  readonly sessionId: string;
  readonly chunkId: string;
  readonly source: AudioMediaSource;
};

type AsrPipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<unknown>;

export type TranscribeAudioDependencies = {
  readonly getPipeline: (modelId: string) => Promise<unknown>;
  readonly storageLayoutResolver: SessionStorageLayoutResolver;
  /**
   * Disk writer abstraction to keep this use-case unit-testable.
   * Provide a mock in unit tests.
   */
  readonly persistTranscriptToDisk: (
    absolutePath: string,
    artifact: SessionTranscriptArtifactV1,
  ) => Promise<void>;
};

const WHISPER_TINY_EN_ID = "onnx-community/whisper-tiny.en"; // make a better constant for this.
const Log = logger.forSource("TranscribeAudioUseCase");
export function createTranscribeAudioUseCase(
  dependencies: TranscribeAudioDependencies,
) {
  return async function transcribeAudio(
    input: TranscribeAudioInput,
  ): Promise<TranscriptionResult> {
    const pipelineUnknown: unknown = await dependencies.getPipeline(
      WHISPER_TINY_EN_ID,
    );
    const asrPipeline = pipelineUnknown as AsrPipeline;

    // whisper-tiny.en is English-only: do not pass `language` or `task`
    // (transformers.js throws).
    const raw: unknown = await asrPipeline(input.pcm, {
      return_timestamps: true,
    });

    const { text, chunks } = normalizeAsrOutput(raw);

    Log.ger?.({
      type: "debug",
      message: "[transcription] ASR raw output",
      data: { textLength: text.length, hasChunks: Boolean(chunks?.length) },
    });

    const result: TranscriptionResult = {
      source: input.source,
      text,
      sessionId: input.sessionId,
      chunkId: input.chunkId,
      ...(chunks && chunks.length > 0 ? { chunks } : {}),
    };

    // Per-chunk transcript JSON writes are gated off. Only the video file
    // and a single consolidated transcript are captured for now.
    // TODO: re-enable per-chunk transcript persistence behind a config flag.
    //
    // const artifact = buildSessionTranscriptArtifact({
    //   chunkId: input.chunkId,
    //   sessionId: input.sessionId,
    //   source: input.source,
    //   text,
    //   chunks,
    //   includeLegacyTranscriptField: true,
    // });
    //
    // const relativePath = getSessionTranscriptRelativePath(input.chunkId);
    // const layout = dependencies.storageLayoutResolver.resolveSessionLayout(
    //   input.sessionId,
    // );
    // const absolutePath = path.join(layout.sessionRoot, relativePath);
    //
    // try {
    //   await dependencies.persistTranscriptToDisk(absolutePath, artifact);
    //   Log.ger?.({
    //     type: "info",
    //     message: "[transcription] saved transcript artifact with segments",
    //     data: {
    //       relativePath,
    //       segmentCount: chunks?.length ?? 0,
    //     },
    //   });
    // } catch (persistErr) {
    //   const pmsg =
    //     persistErr instanceof Error ? persistErr.message : String(persistErr);
    //   Log.ger?.({
    //     type: "error",
    //     message:
    //       "[transcription] failed to write transcript JSON (ASR result still returned)",
    //     data: { chunkId: input.chunkId, error: pmsg },
    //   });
    // }

    Log.ger?.({
      type: "info",
      message: "[transcription] transcribeAudio complete",
      data: {
        sessionId: input.sessionId.slice(0, 8),
        chunkId: input.chunkId,
        source: input.source,
        textLength: text.length,
      },
    });

    return result;
  };
}

