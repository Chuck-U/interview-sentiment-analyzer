import type { PipelineLiveAnswerEvaluationStatus } from "./pipeline";
import type { AudioMediaSource, Unsubscribe } from "./session-lifecycle";

export const ANSWER_RELEVANCE_EVENT_CHANNELS = {
  assessed: "answer-relevance:event-assessed",
} as const;

export type AnswerRelevanceAssessmentPayload = {
  readonly sessionId: string;
  readonly chunkIds: readonly string[];
  readonly source: AudioMediaSource;
  readonly questionText: string;
  readonly answerWindowText: string;
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
  readonly status: PipelineLiveAnswerEvaluationStatus;
  readonly relevanceScore?: number;
  readonly offTopicSignal?: number;
  readonly streakCount: number;
  readonly evaluatedAt: string;
};

export type AnswerRelevanceEventsBridge = {
  onAssessment(
    listener: (payload: AnswerRelevanceAssessmentPayload) => void,
  ): Unsubscribe;
};
