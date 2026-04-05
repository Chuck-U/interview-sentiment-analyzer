import type { AudioMediaSource, Unsubscribe } from "./session-lifecycle";

export const QUESTION_DETECTION_EVENT_CHANNELS = {
  questionDetected: "question-detection:event-detected",
} as const;

export type QuestionDetectionPayload = {
  readonly sessionId: string;
  readonly chunkId: string;
  readonly source: AudioMediaSource;
  readonly text: string;
  readonly questionScore: number;
  readonly statementScore: number;
  readonly anecdoteScore: number;
  readonly greetingScore: number;
  readonly introductionScore: number;
  readonly nonQuestionScore: number;
  readonly detectedAt: string;
};

export type QuestionDetectionEventsBridge = {
  onQuestionDetected(
    listener: (payload: QuestionDetectionPayload) => void,
  ): Unsubscribe;
};
