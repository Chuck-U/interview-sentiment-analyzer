import { logger } from "../../../lib/logger";
import type { QuestionDetectionPayload } from "../../../shared/question-detection";
import type { TranscriptionResult } from "../../../shared/transcription";
import { isAudioMediaChunkSource, type AudioMediaSource } from "../../../shared/session-lifecycle";
import { LiveQuestionMemory } from "../../application/services/live-question-memory";
import { LiveQuestionTranscriptBuffer } from "../../application/services/live-question-transcript-buffer";
import {
  createDetectLiveQuestionUseCase,
  LIVE_QUESTION_MIN_SCORE,
} from "../../application/use-cases/detect-live-question";
import { parseTranscribeAudioRequest } from "../../guards/transcribe-audio-request";
import { createTranscribeAudioUseCase } from "../../application/use-cases/transcribe-audio";

export type AppendTranscriptLogInput = {
  readonly sessionId: string;
  readonly source: AudioMediaSource;
  readonly text: string;
};

const Log = logger.forSource("TranscriptionController");

// ---------------------------------------------------------------------------
// Post-transcription hook contract
// ---------------------------------------------------------------------------

export type PostTranscriptionContext = {
  readonly sessionId: string;
  readonly chunkId: string;
  readonly source: AudioMediaSource;
  readonly transcription: TranscriptionResult;
};

/**
 * A composable step that runs after ASR completes.
 * Hooks run sequentially and should not throw — wrap internal errors with try/catch.
 */
export type PostTranscriptionHook = (ctx: PostTranscriptionContext) => Promise<void>;

// ---------------------------------------------------------------------------
// Built-in hook: live question detection pipeline
// ---------------------------------------------------------------------------

function liveQuestionBufferKey(sessionId: string, source: AudioMediaSource): string {
  return `${sessionId}\0${source}`;
}

export type LiveQuestionDetectionHookOptions = {
  readonly getPipeline: (modelId: string) => Promise<unknown>;
  readonly minimumQuestionConfidence?: number;
  readonly questionMemory?: LiveQuestionMemory;
  readonly appendTranscriptLog?: (input: AppendTranscriptLogInput) => Promise<void>;
  readonly publishQuestionDetected?: (payload: QuestionDetectionPayload) => void;
};

export function createLiveQuestionDetectionHook(
  options: LiveQuestionDetectionHookOptions,
): PostTranscriptionHook {
  const liveQuestionBuffers = new Map<string, LiveQuestionTranscriptBuffer>();
  const minimumQuestionConfidence =
    options.minimumQuestionConfidence ?? LIVE_QUESTION_MIN_SCORE;
  const detectLiveQuestionUseCase = createDetectLiveQuestionUseCase({
    getPipeline: options.getPipeline,
  });

  return async (ctx) => {
    try {
      const { sessionId, chunkId, source, transcription } = ctx;
      const bufferKey = liveQuestionBufferKey(sessionId, source);
      let transcriptBuffer = liveQuestionBuffers.get(bufferKey);
      if (!transcriptBuffer) {
        transcriptBuffer = new LiveQuestionTranscriptBuffer();
        liveQuestionBuffers.set(bufferKey, transcriptBuffer);
      }
      transcriptBuffer.pushSample(transcription.text);

      if (!transcriptBuffer.shouldEvaluate()) {
        Log.ger({
          type: "trace",
          message: "[transcription] question detection deferred",
          data: {
            sessionId: sessionId.slice(0, 8),
            chunkId,
            source,
            bufferedSamples: transcriptBuffer.getSampleCount(),
            latestPreview: transcription.text.slice(0, 120),
          },
        });
        return;
      }

      const textForQuestion = transcriptBuffer.getCombinedText();
      transcriptBuffer.clear();

      if (options.appendTranscriptLog) {
        try {
          await options.appendTranscriptLog({ sessionId, source, text: textForQuestion });
        } catch (appendTranscriptLogError) {
          Log.ger({
            type: "warn",
            message: "[transcription] transcript log append failed",
            data: {
              sessionId: sessionId.slice(0, 8),
              chunkId,
              source,
              error:
                appendTranscriptLogError instanceof Error
                  ? appendTranscriptLogError.message
                  : String(appendTranscriptLogError),
            },
          });
        }
      }

      Log.ger({
        type: "info",
        message: "[transcription] starting question detection (rolled-up transcript)",
        data: {
          sessionId: sessionId.slice(0, 8),
          chunkId,
          source,
          transcriptPreview: textForQuestion.slice(0, 200),
          transcriptLength: textForQuestion.length,
        },
      });

      const detection = await detectLiveQuestionUseCase({
        sessionId,
        chunkId,
        source,
        text: textForQuestion,
        detectedAt: transcription.recordedAt,
      });

      if (detection && detection.questionConfidence >= minimumQuestionConfidence) {
        Log.ger({
          type: "info",
          message: "[transcription] publishing detected question",
          data: {
            sessionId: sessionId.slice(0, 8),
            chunkId,
            source,
            questionScore: detection.questionScore.toFixed(4),
            nonQuestionScore: detection.nonQuestionScore.toFixed(4),
            questionConfidence: detection.questionConfidence.toFixed(4),
            preview: detection.text.slice(0, 200),
          },
        });
        options.questionMemory?.setLatestQuestion(sessionId, detection);
        options.publishQuestionDetected?.(detection);
      } else if (detection) {
        Log.ger({
          type: "trace",
          message: "[transcription] question detection below publish threshold",
          data: {
            sessionId: sessionId.slice(0, 8),
            chunkId,
            source,
            questionConfidence: detection.questionConfidence.toFixed(4),
            minimumQuestionConfidence: minimumQuestionConfidence.toFixed(4),
            topLabel: detection.topLabel,
            preview: detection.text.trim(),
          },
        });
      }
    } catch (questionDetectionError) {
      Log.ger({
        type: "warn",
        message: "[transcription] question detection failed",
        data: {
          sessionId: ctx.sessionId.slice(0, 8),
          chunkId: ctx.chunkId,
          source: ctx.source,
          error:
            questionDetectionError instanceof Error
              ? questionDetectionError.message
              : String(questionDetectionError),
        },
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Core handler factory
// ---------------------------------------------------------------------------

export type TranscribeAudioIpcHandlerDependencies = {
  readonly getPipeline: (modelId: string) => Promise<unknown>;
  readonly postTranscriptionHooks?: readonly PostTranscriptionHook[];
};

function transcribeAudioDedupeKey(
  sessionId: string,
  chunkId: string,
  source: AudioMediaSource,
): string {
  return `${sessionId}\0${chunkId}\0${source}`;
}

export function createTranscribeAudioIpcHandler(
  dependencies: TranscribeAudioIpcHandlerDependencies,
) {
  const transcribeAudioUseCase = createTranscribeAudioUseCase({
    getPipeline: dependencies.getPipeline,
  });
  const hooks = dependencies.postTranscriptionHooks ?? [];
  const completedByKey = new Map<string, TranscriptionResult>();

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

      if (!isAudioMediaChunkSource(parsedRequest.source)) {
        throw new Error("transcribeAudio requires a supported audio source");
      }
      const source: AudioMediaSource = parsedRequest.source;

      const dedupeKey = transcribeAudioDedupeKey(sessionId, chunkId, source);
      const cached = completedByKey.get(dedupeKey);
      if (cached) {
        Log.ger({
          type: "info",
          message: "[transcription] transcribeAudio duplicate IPC skipped (same session chunk source)",
          data: {
            sessionId: sessionId.slice(0, 8),
            chunkId,
            source,
          },
        });
        return cached;
      }

      Log.ger({
        type: "info",
        message: "[transcription] request accepted; running ASR",
        data: {
          sessionId: sessionId.slice(0, 8),
          chunkId,
          source,
        },
      });

      const pcm = new Float32Array(pcmSamples.length);
      for (let i = 0; i < pcmSamples.length; i += 1) {
        const n = pcmSamples[i];
        pcm[i] = typeof n === "number" && Number.isFinite(n) ? n : 0;
      }

      const transcription = await transcribeAudioUseCase({
        pcm,
        sessionId,
        chunkId,
        source,
        recordedAt: parsedRequest.recordedAt,
      });

      const ctx: PostTranscriptionContext = { sessionId, chunkId, source, transcription };
      for (const hook of hooks) {
        await hook(ctx);
      }

      completedByKey.set(dedupeKey, transcription);

      return transcription;
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
          source: body?.source,
        },
      });
      throw err;
    }
  };
}
