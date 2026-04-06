import { log } from "../../../lib/logger";
import { DEFAULT_TRANSCRIPTION_MODEL_ID } from "../../../shared/model-manifest";
import type {
  TranscriptionResult,
} from "../../../shared/transcription";
import type { AudioMediaSource } from "../../../shared/session-lifecycle";
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
};



export function createTranscribeAudioUseCase(
  dependencies: TranscribeAudioDependencies,
) {
  return async function transcribeAudio(
    input: TranscribeAudioInput,
  ): Promise<TranscriptionResult> {
    const start = performance.now();
    const pipelineUnknown: unknown = await dependencies.getPipeline(
      DEFAULT_TRANSCRIPTION_MODEL_ID,
    );
    const asrPipeline = pipelineUnknown as AsrPipeline;

    const pcmStats = {
      length: input.pcm.length,
      min: 0,
      max: 0,
      rms: 0,
    };
    let sumSq = 0;
    for (let i = 0; i < input.pcm.length; i++) {
      const v = input.pcm[i];
      if (v < pcmStats.min) pcmStats.min = v;
      if (v > pcmStats.max) pcmStats.max = v;
      sumSq += v * v;
    }
    pcmStats.rms = Math.sqrt(sumSq / (input.pcm.length || 1));



    // Typical live desktop-capture slice is ~6s at 16 kHz mono (AUDIO_CHUNK_INTERVAL_MS).
    // chunk_length_s above that lets one internal ASR window cover most slices; short PCM
    // still passes as a single window. Smaller stride than the old 30/5 pair reduces
    // stitched boundary repetition when a slice is long enough to split.
    const raw: unknown = await asrPipeline(input.pcm, {
      return_timestamps: true,
      chunk_length_s: 12,
      stride_length_s: 2,
    });

    const { text, chunks } = normalizeAsrOutput(raw);



    const result: TranscriptionResult = {
      source: input.source,
      text,
      sessionId: input.sessionId,
      chunkId: input.chunkId,
      ...(chunks && chunks.length > 0 ? { chunks } : {}),
    };

    log.ger?.({
      type: "trace",
      message: "[transcription] transcribeAudio complete",
      data: {
        sessionId: input.sessionId.slice(0, 8),
        chunkId: input.chunkId,
        source: input.source,
        textLength: text,
        duration: performance.now() - start,
      },
    });

    return result;
  };
}
