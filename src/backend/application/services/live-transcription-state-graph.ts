import { randomUUID } from "node:crypto";

import { traceable } from "langsmith/traceable";
import { log } from "../../../lib/logger";
import type {
  PipelineActiveQuestionState,
  PipelineEventEnvelope,
  PipelineSessionGraphState,
} from "../../../shared";
import type { AnswerRelevanceAssessmentPayload } from "../../../shared/answer-relevance";
import type { QuestionDetectionPayload } from "../../../shared/question-detection";
import type { AudioMediaSource } from "../../../shared/session-lifecycle";
import type { CaptureProvenance, TranscriptionResult } from "../../../shared/transcription";
import { LiveQuestionTranscriptBuffer } from "./live-question-transcript-buffer";
import {
  LiveAnswerWindowBuffer,
  type LiveAnswerWindowInterval,
} from "./live-answer-window-buffer";
import {
  createLiveAnswerRelevanceReadyEvent,
  createLiveAnswerRelevanceRequestedEvent,
} from "./pipeline-events";
import type {
  DetectLiveAnswerRelevanceInput,
  DetectLiveAnswerRelevanceResult,
} from "../use-cases/detect-live-answer-relevance";
import type { DetectLiveQuestionInput } from "../use-cases/detect-live-question";

type AppendTranscriptLogInput = {
  readonly sessionId: string;
  readonly source: AudioMediaSource;
  readonly provenance?: CaptureProvenance;
  readonly text: string;
  readonly timestamp?: string;
};

type LiveTranscriptionStateGraphInput = {
  readonly sessionId: string;
  readonly chunkId: string;
  readonly source: AudioMediaSource;
  readonly provenance?: CaptureProvenance;
  readonly transcription: TranscriptionResult;
};

type LiveTranscriptionSessionState = {
  graphState: PipelineSessionGraphState;
  questionBuffer: LiveQuestionTranscriptBuffer;
  answerBuffer: LiveAnswerWindowBuffer;
  /** Aborts in-flight OpenRouter scoring when a new question supersedes the active one. */
  answerScoringAbort?: AbortController;
};

export type LiveTranscriptionStateGraphDependencies = {
  readonly detectLiveQuestion: (
    input: DetectLiveQuestionInput,
  ) => Promise<QuestionDetectionPayload | null>;
  readonly detectLiveAnswerRelevance: (
    input: DetectLiveAnswerRelevanceInput,
  ) => Promise<DetectLiveAnswerRelevanceResult>;
  readonly minimumQuestionConfidence?: number;
  readonly appendTranscriptLog?: (
    input: AppendTranscriptLogInput,
  ) => Promise<void>;
  readonly publishQuestionDetected?: (payload: QuestionDetectionPayload) => void;
  readonly publishAnswerRelevance?: (
    payload: AnswerRelevanceAssessmentPayload,
  ) => void;
  readonly appendPipelineEvent?: (
    event: PipelineEventEnvelope,
  ) => Promise<void>;
  /**
   * When provided and resolves false, skips live answer relevance (no OpenRouter pipeline,
   * no SQLite live_answer_relevance.* events, no IPC assessment, no answer-window transcript log).
   * Omitted means enabled (for tests and backwards compatibility).
   */
  readonly isLiveOpenRouterRelevanceEnabled?: () => Promise<boolean>;
};

const DEFAULT_MINIMUM_QUESTION_CONFIDENCE = 0.3;

function isLangSmithTracingEnabled(): boolean {
  return (
    process.env.LANGCHAIN_TRACING_V2 === "true" ||
    (typeof process.env.LANGSMITH_API_KEY === "string" &&
      process.env.LANGSMITH_API_KEY.length > 0)
  );
}

function copyGraphState(graphState: PipelineSessionGraphState): PipelineSessionGraphState {
  return {
    ...graphState,
    activeQuestion: graphState.activeQuestion
      ? { ...graphState.activeQuestion }
      : undefined,
    liveAnswerEvaluation: graphState.liveAnswerEvaluation
      ? { ...graphState.liveAnswerEvaluation }
      : undefined,
    metadata: graphState.metadata ? { ...graphState.metadata } : undefined,
  };
}

function toActiveQuestionState(
  payload: QuestionDetectionPayload,
): PipelineActiveQuestionState {
  return {
    questionId: payload.chunkId,
    questionText: payload.text,
    sourceEventId: payload.chunkId,
    sourceChunkId: payload.chunkId,
    detectedAt: payload.detectedAt,
    confidence: payload.questionConfidence,
  };
}

export class LiveTranscriptionStateGraph {
  private readonly minimumQuestionConfidence: number;
  private readonly tracedDetectLiveQuestion: LiveTranscriptionStateGraphDependencies["detectLiveQuestion"];
  private readonly tracedDetectLiveAnswerRelevance: LiveTranscriptionStateGraphDependencies["detectLiveAnswerRelevance"];

  private readonly sessions = new Map<string, LiveTranscriptionSessionState>();

  constructor(
    private readonly dependencies: LiveTranscriptionStateGraphDependencies,
  ) {
    this.minimumQuestionConfidence =
      dependencies.minimumQuestionConfidence ?? DEFAULT_MINIMUM_QUESTION_CONFIDENCE;

    if (isLangSmithTracingEnabled()) {
      this.tracedDetectLiveQuestion = traceable(
        dependencies.detectLiveQuestion,
        { name: "detectLiveQuestion", tags: ["live-transcription"] },
      );
      this.tracedDetectLiveAnswerRelevance = traceable(
        dependencies.detectLiveAnswerRelevance,
        { name: "detectLiveAnswerRelevance", tags: ["live-transcription"] },
      );
    } else {
      this.tracedDetectLiveQuestion = dependencies.detectLiveQuestion;
      this.tracedDetectLiveAnswerRelevance = dependencies.detectLiveAnswerRelevance;
    }
  }

  async process(
    input: LiveTranscriptionStateGraphInput,
  ): Promise<PipelineSessionGraphState> {
    const sessionState = this.getOrCreateSessionState(input.sessionId);
    const provenance = input.provenance ?? input.transcription.provenance;

    switch (input.source) {
      case "desktop-capture":
        // Mixed desktop includes the interviewee mic in the same waveform; we still run
        // question detection so unified desktop+mic sessions work. Provenance is stamped on
        // events/logs so consumers know the stream is not interviewer-only. Answer scoring
        // stays on the dedicated microphone path only.
        await this.processQuestionProducer(sessionState, input);
        break;
      case "system-audio":
        if (provenance !== "mixed-desktop-audio") {
          await this.processQuestionProducer(sessionState, input);
        }
        break;
      case "microphone":
        if (provenance === "dedicated-microphone" || !provenance) {
          await this.processAnswerConsumer(sessionState, input);
        }
        break;
      default:
        break;
    }

    return copyGraphState(sessionState.graphState);
  }

  async flushSession(sessionId: string): Promise<PipelineSessionGraphState> {
    const sessionState = this.sessions.get(sessionId);

    if (!sessionState) {
      return {};
    }

    const activeQuestion = sessionState.graphState.activeQuestion;

    if (!activeQuestion) {
      return copyGraphState(sessionState.graphState);
    }

    await this.scoreReadyWindows(
      sessionId,
      "microphone",
      activeQuestion,
      sessionState.answerBuffer.flushAll(),
      sessionState,
      "dedicated-microphone",
    );

    return copyGraphState(sessionState.graphState);
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private getOrCreateSessionState(sessionId: string): LiveTranscriptionSessionState {
    const existing = this.sessions.get(sessionId);

    if (existing) {
      return existing;
    }

    const created: LiveTranscriptionSessionState = {
      graphState: {},
      questionBuffer: new LiveQuestionTranscriptBuffer(),
      answerBuffer: new LiveAnswerWindowBuffer(),
    };
    this.sessions.set(sessionId, created);

    return created;
  }

  private async processQuestionProducer(
    sessionState: LiveTranscriptionSessionState,
    input: LiveTranscriptionStateGraphInput,
  ): Promise<void> {
    sessionState.questionBuffer.pushSample(input.transcription.text);

    if (!sessionState.questionBuffer.shouldEvaluate()) {
      return;
    }

    const rolledUpText = sessionState.questionBuffer.getCombinedText();
    sessionState.questionBuffer.clear();
    const detectedAt = input.transcription.recordedAt ?? new Date().toISOString();

    if (rolledUpText.length === 0) {
      return;
    }

    await this.dependencies.appendTranscriptLog?.({
      sessionId: input.sessionId,
      source: input.source,
      provenance: input.provenance,
      text: rolledUpText,
      timestamp: detectedAt,
    });

    const detectedQuestion = await this.tracedDetectLiveQuestion({
      sessionId: input.sessionId,
      chunkId: input.chunkId,
      source: input.source,
      text: rolledUpText,
      detectedAt,
    });

    if (
      !detectedQuestion ||
      detectedQuestion.questionConfidence < this.minimumQuestionConfidence
    ) {
      return;
    }

    sessionState.graphState.activeQuestion = toActiveQuestionState(detectedQuestion);
    sessionState.graphState.liveAnswerEvaluation = {
      status: "waiting-for-answer",
      activeQuestionText: detectedQuestion.text,
      streakCount: 0,
      lastUpdatedAt: detectedQuestion.detectedAt,
    };
    sessionState.answerScoringAbort?.abort();
    sessionState.answerScoringAbort = new AbortController();
    sessionState.answerBuffer.reset();
    this.dependencies.publishQuestionDetected?.(detectedQuestion);
  }

  private async processAnswerConsumer(
    sessionState: LiveTranscriptionSessionState,
    input: LiveTranscriptionStateGraphInput,
  ): Promise<void> {
    const activeQuestion = sessionState.graphState.activeQuestion;
    const recordedAt = input.transcription.recordedAt ?? new Date().toISOString();

    if (!activeQuestion) {
      sessionState.graphState.liveAnswerEvaluation = {
        status: "waiting-for-question",
        answerWindowText: input.transcription.text.trim() || undefined,
        streakCount: 0,
        lastUpdatedAt: recordedAt,
      };
      return;
    }

    const { readyWindows } = sessionState.answerBuffer.append({
      chunkId: input.chunkId,
      recordedAt,
      text: input.transcription.text,
      pcmRms: input.transcription.pcmRms,
      pcmDurationMs: input.transcription.pcmDurationMs,
    });

    if (readyWindows.length === 0) {
      sessionState.graphState.liveAnswerEvaluation = {
        status: "buffering",
        activeQuestionText: activeQuestion.questionText,
        answerWindowText: input.transcription.text.trim() || undefined,
        streakCount: sessionState.graphState.liveAnswerEvaluation?.streakCount ?? 0,
        lastUpdatedAt: recordedAt,
      };
      return;
    }

    await this.scoreReadyWindows(
      input.sessionId,
      input.source,
      activeQuestion,
      readyWindows,
      sessionState,
      input.provenance,
    );
  }

  private async scoreReadyWindows(
    sessionId: string,
    source: AudioMediaSource,
    activeQuestion: PipelineActiveQuestionState,
    windows: readonly LiveAnswerWindowInterval[],
    sessionState: LiveTranscriptionSessionState,
    provenance?: CaptureProvenance,
  ): Promise<void> {
    for (const interval of windows) {
      const priorStreakCount =
        sessionState.graphState.liveAnswerEvaluation?.streakCount ?? 0;

      const relevanceEnabled =
        this.dependencies.isLiveOpenRouterRelevanceEnabled === undefined
          ? true
          : await this.dependencies.isLiveOpenRouterRelevanceEnabled();

      if (!relevanceEnabled) {
        log.ger({
          type: "info",
          message:
            "[live-transcription] skipping live answer relevance pipeline (no OpenRouter API key)",
          data: {
            sessionId,
            windowEndedAt: interval.windowEndedAt,
          },
        });
        sessionState.graphState.liveAnswerEvaluation = {
          status: "waiting-for-answer",
          activeQuestionText: activeQuestion.questionText,
          answerWindowText: interval.text.trim() || undefined,
          streakCount: priorStreakCount,
          lastUpdatedAt: interval.windowEndedAt,
        };
        continue;
      }

      const evaluationCorrelationId = randomUUID();
      const correlationId = evaluationCorrelationId;
      const micChunkId =
        interval.chunkIds[interval.chunkIds.length - 1] ?? activeQuestion.sourceChunkId;
      const occurredAtRequested = new Date().toISOString();
      const appendPipeline = this.dependencies.appendPipelineEvent;

      if (appendPipeline) {
        try {
          await appendPipeline(
            createLiveAnswerRelevanceRequestedEvent({
              sessionId,
              chunkId: micChunkId,
              eventId: randomUUID(),
              correlationId,
              occurredAt: occurredAtRequested,
              evaluationCorrelationId,
              activeQuestionText: activeQuestion.questionText,
              answerWindowText: interval.text,
              windowStartedAt: interval.windowStartedAt,
              windowEndedAt: interval.windowEndedAt,
              micChunkIds: interval.chunkIds,
              graphState: copyGraphState(sessionState.graphState),
            }),
          );
        } catch (err) {
          log.ger({
            type: "warn",
            message: "[live-transcription] pipeline live_answer_relevance.requested append failed",
            data: {
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      }

      let evaluation: DetectLiveAnswerRelevanceResult;
      try {
        evaluation = await this.tracedDetectLiveAnswerRelevance({
          activeQuestion,
          answerWindowText: interval.text,
          evaluatedAt: interval.windowEndedAt,
          previousStreakCount: priorStreakCount,
          abortSignal: sessionState.answerScoringAbort?.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          continue;
        }
        throw err;
      }

      sessionState.graphState.liveAnswerEvaluation = evaluation;
      await this.dependencies.appendTranscriptLog?.({
        sessionId,
        source,
        provenance,
        text: interval.text,
        timestamp: interval.windowEndedAt,
      });
      this.dependencies.publishAnswerRelevance?.({
        sessionId,
        chunkIds: interval.chunkIds,
        source,
        questionText: activeQuestion.questionText,
        answerWindowText: interval.text,
        windowStartedAt: interval.windowStartedAt,
        windowEndedAt: interval.windowEndedAt,
        status: evaluation.status,
        relevanceScore: evaluation.relevanceScore,
        offTopicSignal: evaluation.offTopicSignal,
        streakCount: evaluation.streakCount ?? 0,
        evaluatedAt: evaluation.lastUpdatedAt,
        onTopic: evaluation.onTopic,
        offTopicPoints: evaluation.offTopicPoints,
        modelId: evaluation.modelId,
        providerRequestId: evaluation.providerRequestId,
        usage: evaluation.usage,
      });

      const occurredAtReady = new Date().toISOString();
      if (appendPipeline) {
        try {
          await appendPipeline(
            createLiveAnswerRelevanceReadyEvent({
              sessionId,
              chunkId: micChunkId,
              eventId: randomUUID(),
              correlationId,
              occurredAt: occurredAtReady,
              evaluationCorrelationId,
              onTopic:
                evaluation.onTopic ??
                (evaluation.relevanceScore !== undefined
                  ? evaluation.relevanceScore >= 0.6
                  : true),
              offTopicPoints: evaluation.offTopicPoints ?? [],
              relevanceScore: evaluation.relevanceScore,
              offTopicSignal: evaluation.offTopicSignal,
              streakCount: evaluation.streakCount,
              modelId: evaluation.modelId,
              providerRequestId: evaluation.providerRequestId,
              usage: evaluation.usage,
              graphState: copyGraphState(sessionState.graphState),
            }),
          );
        } catch (err) {
          log.ger({
            type: "warn",
            message: "[live-transcription] pipeline live_answer_relevance.ready append failed",
            data: {
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      }
    }
  }
}
