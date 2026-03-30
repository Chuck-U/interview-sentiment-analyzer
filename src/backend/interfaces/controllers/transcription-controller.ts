import { logger } from "../../../lib/logger";
import type { QuestionDetectionPayload } from "../../../shared/question-detection";
import type { TranscriptionResult } from "../../../shared/transcription";
import { isAudioMediaChunkSource, type AudioMediaSource } from "../../../shared/session-lifecycle";
import { createDetectLiveQuestionUseCase } from "../../application/use-cases/detect-live-question";
import { parseTranscribeAudioRequest } from "../../guards/transcribe-audio-request";
import { createTranscribeAudioUseCase } from "../../application/use-cases/transcribe-audio";

export type TranscribeAudioIpcHandlerDependencies = {
  readonly getPipeline: (modelId: string) => Promise<unknown>;
  readonly publishQuestionDetected?: (
    payload: QuestionDetectionPayload,
  ) => void;
};

const Log = logger.forSource("TranscriptionController");

export function createTranscribeAudioIpcHandler(
  dependencies: TranscribeAudioIpcHandlerDependencies,
) {
  const transcribeAudioUseCase = createTranscribeAudioUseCase({
    getPipeline: dependencies.getPipeline,
  });
  const detectLiveQuestionUseCase = createDetectLiveQuestionUseCase({
    getPipeline: dependencies.getPipeline,
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

      if (!isAudioMediaChunkSource(parsedRequest.source)) {
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

      const transcription = await transcribeAudioUseCase({
        pcm,
        sessionId,
        chunkId,
        source,
      });

      try {
        Log.ger({
          type: "info",
          message: "[transcription] starting question detection",
          data: {
            sessionId: sessionId.slice(0, 8),
            chunkId,
            source,
            transcriptPreview: transcription.text.slice(0, 200),
            transcriptLength: transcription.text.length,
          },
        });
        const detectedQuestion = await detectLiveQuestionUseCase({
          sessionId,
          chunkId,
          source,
          text: transcription.text,
        });
        if (detectedQuestion) {
          Log.ger({
            type: "info",
            message: "[transcription] publishing detected question",
            data: {
              sessionId: sessionId.slice(0, 8),
              chunkId,
              source,
              questionScore: detectedQuestion.questionScore.toFixed(4),
              nonQuestionScore: detectedQuestion.nonQuestionScore.toFixed(4),
              preview: detectedQuestion.text.slice(0, 200),
            },
          });
          dependencies.publishQuestionDetected?.(detectedQuestion);
        } else {
          Log.ger({
            type: "debug",
            message: "[transcription] question detection returned no match",
            data: {
              sessionId: sessionId.slice(0, 8),
              chunkId,
            },
          });
        }
      } catch (questionDetectionError) {
        Log.ger({
          type: "warn",
          message: "[transcription] question detection failed",
          data: {
            sessionId: sessionId.slice(0, 8),
            chunkId,
            source,
            error:
              questionDetectionError instanceof Error
                ? questionDetectionError.message
                : String(questionDetectionError),
          },
        });
      }

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
          chunkId:
            typeof body?.chunkId === "string" ? body.chunkId : undefined,
          source: body?.source,
        },
      });
      throw err;
    }
  };
}
