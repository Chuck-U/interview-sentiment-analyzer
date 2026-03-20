export const QUESTION_ANNOTATION_TYPES = [
  "behavioral",
  "technical",
  "clarifying",
  "follow-up",
  "introductory",
  "closing",
  "unknown",
] as const;

export type QuestionAnnotationType = (typeof QUESTION_ANNOTATION_TYPES)[number];

export const EXPECTED_ANSWER_SHAPES = [
  "star",
  "direct",
  "clarification",
  "brainstorming",
  "unknown",
] as const;

export type ExpectedAnswerShape = (typeof EXPECTED_ANSWER_SHAPES)[number];

export type QuestionAnnotationEvidence = Record<string, unknown>;

export type QuestionAnnotationEntity = {
  readonly id: string;
  readonly sessionId: string;
  readonly chunkId: string;
  readonly askerParticipantId: string;
  readonly addressedToParticipantId?: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly questionText: string;
  readonly questionType: QuestionAnnotationType;
  readonly topicTags: readonly string[];
  readonly ambiguityScore: number;
  readonly multiPart: boolean;
  readonly expectedAnswerShape: ExpectedAnswerShape;
  readonly annotationConfidence: number;
  readonly evidence: readonly QuestionAnnotationEvidence[];
};
