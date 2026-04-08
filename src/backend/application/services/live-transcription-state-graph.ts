import type {
  PipelineActiveQuestionState,
  PipelineSessionGraphState,
} from "../../../shared";
import type { AnswerRelevanceAssessmentPayload } from "../../../shared/answer-relevance";
import type { QuestionDetectionPayload } from "../../../shared/question-detection";
import type { AudioMediaSource } from "../../../shared/session-lifecycle";
import type { TranscriptionResult } from "../../../shared/transcription";
import { LiveQuestionTranscriptBuffer } from "./live-question-transcript-buffer";
import {
  LiveAnswerIntervalBuffer,
  type LiveAnswerInterval,
} from "./live-answer-interval-buffer";
import type {
  DetectLiveAnswerRelevanceInput,
  DetectLiveAnswerRelevanceResult,
} from "../use-cases/detect-live-answer-relevance";
import type { DetectLiveQuestionInput } from "../use-cases/detect-live-question";

type AppendTranscriptLogInput = {
  readonly sessionId: string;
  readonly source: AudioMediaSource;
  readonly text: string;
  readonly timestamp?: string;
};

type LiveTranscriptionStateGraphInput = {
  readonly sessionId: string;
  readonly chunkId: string;
  readonly source: AudioMediaSource;
  readonly transcription: TranscriptionResult;
};

type LiveTranscriptionSessionState = {
  graphState: PipelineSessionGraphState;
  questionBuffer: LiveQuestionTranscriptBuffer;
  answerBuffer: LiveAnswerIntervalBuffer;
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
};

const DEFAULT_MINIMUM_QUESTION_CONFIDENCE = 0.3;

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

  private readonly sessions = new Map<string, LiveTranscriptionSessionState>();

  constructor(
    private readonly dependencies: LiveTranscriptionStateGraphDependencies,
  ) {
    this.minimumQuestionConfidence =
      dependencies.minimumQuestionConfidence ?? DEFAULT_MINIMUM_QUESTION_CONFIDENCE;
  }

  async process(
    input: LiveTranscriptionStateGraphInput,
  ): Promise<PipelineSessionGraphState> {
    const sessionState = this.getOrCreateSessionState(input.sessionId);

    switch (input.source) {
      case "desktop-capture":
        await this.processQuestionProducer(sessionState, input);
        break;
      case "microphone":
        await this.processAnswerConsumer(sessionState, input);
        break;
      case "system-audio":
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

    await this.scoreReadyIntervals(
      sessionId,
      "microphone",
      activeQuestion,
      sessionState.answerBuffer.flushAll(),
      sessionState,
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
      answerBuffer: new LiveAnswerIntervalBuffer(),
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
      text: rolledUpText,
      timestamp: detectedAt,
    });

    const detectedQuestion = await this.dependencies.detectLiveQuestion({
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
    sessionState.answerBuffer.reset(detectedQuestion.detectedAt);
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

    const { readyIntervals } = sessionState.answerBuffer.append({
      chunkId: input.chunkId,
      recordedAt,
      text: input.transcription.text,
    });

    if (readyIntervals.length === 0) {
      sessionState.graphState.liveAnswerEvaluation = {
        status: "buffering",
        activeQuestionText: activeQuestion.questionText,
        answerWindowText: input.transcription.text.trim() || undefined,
        streakCount: sessionState.graphState.liveAnswerEvaluation?.streakCount ?? 0,
        lastUpdatedAt: recordedAt,
      };
      return;
    }

    await this.scoreReadyIntervals(
      input.sessionId,
      input.source,
      activeQuestion,
      readyIntervals,
      sessionState,
    );
  }

  private async scoreReadyIntervals(
    sessionId: string,
    source: AudioMediaSource,
    activeQuestion: PipelineActiveQuestionState,
    intervals: readonly LiveAnswerInterval[],
    sessionState: LiveTranscriptionSessionState,
  ): Promise<void> {
    for (const interval of intervals) {
      const priorStreakCount =
        sessionState.graphState.liveAnswerEvaluation?.streakCount ?? 0;
      const evaluation = await this.dependencies.detectLiveAnswerRelevance({
        activeQuestion,
        answerWindowText: interval.text,
        evaluatedAt: interval.windowEndedAt,
        previousStreakCount: priorStreakCount,
      });

      sessionState.graphState.liveAnswerEvaluation = evaluation;
      await this.dependencies.appendTranscriptLog?.({
        sessionId,
        source,
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
      });
    }
  }
}
