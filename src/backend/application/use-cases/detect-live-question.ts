import { isNonEmptyNumber } from "@/backend/guards/checks";
import { log } from "../../../lib/logger";
import type { QuestionDetectionPayload } from "../../../shared/question-detection";
import type { AudioMediaSource } from "../../../shared/session-lifecycle";
const QUESTION_REGEX = new RegExp(/[A-Z][^?.|]*/, "i");

export const DISTILBERT_MNLI_MODEL_ID =
  "onnx-community/distilbert-base-uncased-mnli-ONNX";

export const QUESTION_CLASSIFIER_LABELS = {
  question: "A question, request or instruction. Example: 'Do you know about', 'tell me about', 'what is ...'",
  nonQuestion: "A statement or answer that is not a question. Example: 'ok, thanks for that', 'alright, let's move on to the next question'",
  statement: "A statement or answer that is not a question. Example: 'ok, thanks for that', 'alright, let's move on to the next question'",
  anecdote: "A short story or anecdote. Example: 'I had one project that I was really proud of.'",
  greeting: "A greeting. Example: 'hello', 'hi', 'good morning', 'good afternoon', 'good evening'",
  introduction: "An introduction. Example: 'I'm John Doe', 'my name is Sarah, thanks for'",
} as const;

export const LIVE_QUESTION_MIN_SCORE = 0.3;
export const LIVE_QUESTION_MIN_MARGIN = 0.12;


type ZeroShotClassificationPipeline = (
  sequence: string,
  labels: readonly string[],
  options?: Record<string, unknown>,
) => Promise<unknown>;

export type ZeroShotClassificationOutput = {
  readonly labels: readonly string[];
  readonly scores: readonly number[];
};

export type DetectLiveQuestionInput = {
  readonly sessionId: string;
  readonly chunkId: string;
  readonly source: AudioMediaSource;
  readonly text: string;
};

export type DetectLiveQuestionDependencies = {
  readonly getPipeline: (modelId: string) => Promise<unknown>;
};

function normalizeZeroShotOutput(
  raw: unknown,
): ZeroShotClassificationOutput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("zero-shot classification output must be an object");
  }

  const labels = (raw as { labels?: unknown }).labels;
  const scores = (raw as { scores?: unknown }).scores;

  if (!Array.isArray(labels) || !Array.isArray(scores)) {
    throw new Error(
      "zero-shot classification output must include labels and scores arrays",
    );
  }

  if (labels.length !== scores.length) {
    throw new Error(
      "zero-shot classification output labels and scores must be the same length",
    );
  }

  return {
    labels: labels.map((label) => String(label)),
    scores: scores.map((score) =>
      isNonEmptyNumber(score) && score > 0 ? score : 0,
    ),
  };
}

function getScoreForLabelSilent(
  output: ZeroShotClassificationOutput,
  label: string,
): number {
  const index = output.labels.findIndex(
    (candidate) => candidate.trim().toLowerCase() === label.trim().toLowerCase(),
  );
  return index >= 0 ? output.scores[index] ?? 0 : 0;
}

export type QuestionClassifierLabelKey = keyof typeof QUESTION_CLASSIFIER_LABELS;

export type QuestionEvaluationResult = {
  /** Per-key scores aligned with `QUESTION_CLASSIFIER_LABELS` */
  readonly scores: Record<QuestionClassifierLabelKey, number>;
  /** Full classifier label string with the highest score */
  readonly topLabel: string;
  /** Gradient 0–1: question signal with competing-label penalty */
  readonly questionConfidence: number;
};

/**
 * Maps zero-shot output to per-label scores, top label, and gradient question confidence.
 * Formula (tunable): questionScore * (1 - max(statementScore, nonQuestionScore) * 0.5)
 */
export function evaluateQuestionScores(
  output: ZeroShotClassificationOutput,
): QuestionEvaluationResult {
  const scores = {} as Record<QuestionClassifierLabelKey, number>;
  for (const key of Object.keys(QUESTION_CLASSIFIER_LABELS) as QuestionClassifierLabelKey[]) {
    scores[key] = getScoreForLabelSilent(
      output,
      QUESTION_CLASSIFIER_LABELS[key],
    );
  }

  const entries = (
    Object.keys(QUESTION_CLASSIFIER_LABELS) as QuestionClassifierLabelKey[]
  ).map((key) => ({
    label: QUESTION_CLASSIFIER_LABELS[key],
    score: scores[key],
  }));
  const top = entries.reduce((a, b) => (a.score >= b.score ? a : b));

  const questionScore = scores.question;
  const statementScore = scores.statement;
  const nonQuestionScore = scores.nonQuestion;
  const questionConfidence =
    questionScore * (1 - Math.max(statementScore, nonQuestionScore) * 0.5);

  return {
    scores,
    topLabel: top.label,
    questionConfidence,
  };
}

type Score = {
  label: string;
  score: number;
};


export function mapQuestionDetectionResult(args: {
  readonly sessionId: string;
  readonly chunkId: string;
  readonly source: AudioMediaSource;
  readonly text: string;
  readonly raw: unknown;
  readonly detectedAt?: string;
  readonly minScore?: number;
  readonly minMargin?: number;
}): QuestionDetectionPayload | null {
  const output = normalizeZeroShotOutput(args.raw);
  const evaluation = evaluateQuestionScores(output);

  const scores = (
    Object.keys(QUESTION_CLASSIFIER_LABELS) as QuestionClassifierLabelKey[]
  )
    .map((key) => ({
      label: QUESTION_CLASSIFIER_LABELS[key],
      score: evaluation.scores[key],
    }))
    .sort((a: Score, b: Score) => b.score - a.score);

  const questionScore = evaluation.scores.question;
  const nonQuestionScore = evaluation.scores.nonQuestion;

  if (scores[0]?.label === QUESTION_CLASSIFIER_LABELS.question || (scores.find(score => score.label === QUESTION_CLASSIFIER_LABELS.question)?.score ?? 0) > 0.2) {
    log.ger({
      type: "info",
      message: "[question-detection] question detected by label",
      data: {
        sessionId: args.sessionId.slice(0, 8),
        chunkId: args.chunkId,
        source: args.source,
        scores,
        questionScore: scores[0]?.score.toFixed(4),
      },
    });
    return {
      sessionId: args.sessionId,
      chunkId: args.chunkId,
      source: args.source,
      text: args.text.trim(),
      questionScore,
      nonQuestionScore,
      statementScore: scores.find(score => score.label === QUESTION_CLASSIFIER_LABELS.statement)?.score ?? 0,
      anecdoteScore: scores.find(score => score.label === QUESTION_CLASSIFIER_LABELS.anecdote)?.score ?? 0,
      greetingScore: scores.find(score => score.label === QUESTION_CLASSIFIER_LABELS.greeting)?.score ?? 0,
      introductionScore: scores.find(score => score.label === QUESTION_CLASSIFIER_LABELS.introduction)?.score ?? 0,
      topLabel: evaluation.topLabel,
      questionConfidence: evaluation.questionConfidence,
      detectedAt: args.detectedAt ?? new Date().toISOString(),
    };
  }
  const minScore = args.minScore ?? LIVE_QUESTION_MIN_SCORE;
  const minMargin = args.minMargin ?? LIVE_QUESTION_MIN_MARGIN;
  const margin = questionScore - nonQuestionScore;
  // Add a regex that looks for a capital letter, followed by any number of word or non-word characters excluding ? | .

  // log.ger({
  //   type: "info",
  //   message: "[question-detection] classifier scores computed",
  //   data: {
  //     text: args.text,
  //     questionScore: questionScore.toFixed(4),
  //     nonQuestionScore: nonQuestionScore.toFixed(4),
  //     margin: margin.toFixed(4),
  //     minScore,
  //     minMargin,
  //   },
  // });

  if (questionScore < minScore) {
    return null;
  }

  if (margin < minMargin) {
    return null;
  }

  log.ger({
    type: "info",
    message: "[question-detection] question detected by margin",
    data: {
      sessionId: args.sessionId.slice(0, 8),
      chunkId: args.chunkId,
      source: args.source,
      questionScore: questionScore.toFixed(4),
      nonQuestionScore: nonQuestionScore.toFixed(4),
      preview: args.text.trim().slice(0, 200),
    },
  });

  return {
    sessionId: args.sessionId,
    chunkId: args.chunkId,
    source: args.source,
    text: args.text.trim(),
    questionScore,
    nonQuestionScore,
    statementScore: scores.find(score => score.label === QUESTION_CLASSIFIER_LABELS.statement)?.score ?? 0,
    anecdoteScore: scores.find(score => score.label === QUESTION_CLASSIFIER_LABELS.anecdote)?.score ?? 0,
    greetingScore: scores.find(score => score.label === QUESTION_CLASSIFIER_LABELS.greeting)?.score ?? 0,
    introductionScore: scores.find(score => score.label === QUESTION_CLASSIFIER_LABELS.introduction)?.score ?? 0,
    topLabel: evaluation.topLabel,
    questionConfidence: evaluation.questionConfidence,
    detectedAt: args.detectedAt ?? new Date().toISOString(),
  };
}

export function createDetectLiveQuestionUseCase(
  dependencies: DetectLiveQuestionDependencies,
) {
  return async function detectLiveQuestion(
    input: DetectLiveQuestionInput,
  ): Promise<QuestionDetectionPayload | null> {
    const text = input.text.trim();
    if (text.length === 0) {
      return null;
    }

    // log.ger({
    //   type: "info",
    //   message: "[question-detection] loading classifier pipeline",
    //   data: {
    //     sessionId: input.sessionId.slice(0, 8),
    //     chunkId: input.chunkId,
    //     source: input.source,
    //     modelId: DISTILBERT_MNLI_MODEL_ID,
    //     textLength: text.length,
    //     preview: text.slice(0, 200),
    //   },
    // });

    const pipelineUnknown = await dependencies.getPipeline(
      DISTILBERT_MNLI_MODEL_ID,
    );
    const classify = pipelineUnknown as ZeroShotClassificationPipeline;

    log.ger({
      type: "info",
      message: "[question-detection] classifier invoked",
    });

    const raw = await classify(
      text,
      [
        ...Object.values(QUESTION_CLASSIFIER_LABELS),
      ],
      {
        hypothesis_template: "This transcript chunk is {}.",
        multi_label: false,
      },
    );
    // const isolatedQuestion = text.match(QUESTION_REGEX)?.[0];

    return mapQuestionDetectionResult({
      sessionId: input.sessionId,
      chunkId: input.chunkId,
      source: input.source,
      text,
      raw,
    });
  };
}
