import { logger } from "../../../lib/logger";
import type { QuestionDetectionPayload } from "../../../shared/question-detection";
import type { AudioMediaSource } from "../../../shared/session-lifecycle";

export const DISTILBERT_MNLI_MODEL_ID =
  "onnx-community/distilbert-base-uncased-mnli-ONNX";

export const QUESTION_CLASSIFIER_LABELS = {
  question: "a spoken interview question",
  nonQuestion: "a spoken statement or answer",
} as const;

export const LIVE_QUESTION_MIN_SCORE = 0.7;
export const LIVE_QUESTION_MIN_MARGIN = 0.12;

const log = logger.forSource("DetectLiveQuestionUseCase");

type ZeroShotClassificationPipeline = (
  sequence: string,
  labels: readonly string[],
  options?: Record<string, unknown>,
) => Promise<unknown>;

type ZeroShotClassificationOutput = {
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
      typeof score === "number" && Number.isFinite(score) ? score : 0,
    ),
  };
}

function getScoreForLabel(
  output: ZeroShotClassificationOutput,
  label: string,
): number {
  const index = output.labels.findIndex(
    (candidate) => candidate.trim().toLowerCase() === label.trim().toLowerCase(),
  );
  return index >= 0 ? output.scores[index] ?? 0 : 0;
}

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
  const questionScore = getScoreForLabel(
    output,
    QUESTION_CLASSIFIER_LABELS.question,
  );
  const nonQuestionScore = getScoreForLabel(
    output,
    QUESTION_CLASSIFIER_LABELS.nonQuestion,
  );
  const minScore = args.minScore ?? LIVE_QUESTION_MIN_SCORE;
  const minMargin = args.minMargin ?? LIVE_QUESTION_MIN_MARGIN;
  const margin = questionScore - nonQuestionScore;

  log.ger({
    type: "info",
    message: "[question-detection] classifier scores computed",
    data: {
      sessionId: args.sessionId.slice(0, 8),
      chunkId: args.chunkId,
      source: args.source,
      textLength: args.text.trim().length,
      questionScore: questionScore.toFixed(4),
      nonQuestionScore: nonQuestionScore.toFixed(4),
      margin: margin.toFixed(4),
      minScore,
      minMargin,
    },
  });

  if (questionScore < minScore) {
    log.ger({
      type: "debug",
      message: "[question-detection] rejected by min score threshold",
      data: {
        sessionId: args.sessionId.slice(0, 8),
        chunkId: args.chunkId,
        questionScore: questionScore.toFixed(4),
        minScore,
      },
    });
    return null;
  }

  if (margin < minMargin) {
    log.ger({
      type: "debug",
      message: "[question-detection] rejected by score margin threshold",
      data: {
        sessionId: args.sessionId.slice(0, 8),
        chunkId: args.chunkId,
        margin: margin.toFixed(4),
        minMargin,
      },
    });
    return null;
  }

  log.ger({
    type: "info",
    message: "[question-detection] question detected",
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
      log.ger({
        type: "debug",
        message: "[question-detection] skipped blank transcript chunk",
        data: {
          sessionId: input.sessionId.slice(0, 8),
          chunkId: input.chunkId,
          source: input.source,
        },
      });
      return null;
    }

    log.ger({
      type: "info",
      message: "[question-detection] loading classifier pipeline",
      data: {
        sessionId: input.sessionId.slice(0, 8),
        chunkId: input.chunkId,
        source: input.source,
        modelId: DISTILBERT_MNLI_MODEL_ID,
        textLength: text.length,
        preview: text.slice(0, 200),
      },
    });

    const pipelineUnknown = await dependencies.getPipeline(
      DISTILBERT_MNLI_MODEL_ID,
    );
    const classify = pipelineUnknown as ZeroShotClassificationPipeline;

    log.ger({
      type: "info",
      message: "[question-detection] classifier invoked",
      data: {
        sessionId: input.sessionId.slice(0, 8),
        chunkId: input.chunkId,
        labels: [
          QUESTION_CLASSIFIER_LABELS.question,
          QUESTION_CLASSIFIER_LABELS.nonQuestion,
        ],
      },
    });

    const raw = await classify(
      text,
      [
        QUESTION_CLASSIFIER_LABELS.question,
        QUESTION_CLASSIFIER_LABELS.nonQuestion,
      ],
      {
        hypothesis_template: "This transcript chunk is {}.",
        multi_label: false,
      },
    );

    log.ger({
      type: "debug",
      message: "[question-detection] classifier raw output received",
      data: {
        sessionId: input.sessionId.slice(0, 8),
        chunkId: input.chunkId,
        rawType: typeof raw,
        rawKeys:
          raw && typeof raw === "object"
            ? Object.keys(raw as Record<string, unknown>)
            : [],
      },
    });

    return mapQuestionDetectionResult({
      sessionId: input.sessionId,
      chunkId: input.chunkId,
      source: input.source,
      text,
      raw,
    });
  };
}
