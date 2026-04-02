import { isNonEmptyNumber } from "@/backend/guards/checks";
import { log } from "../../../lib/logger";
import type { QuestionDetectionPayload } from "../../../shared/question-detection";
import type { AudioMediaSource } from "../../../shared/session-lifecycle";

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
      isNonEmptyNumber(score) && score > 0 ? score : 0,
    ),
  };
}

function getScoreForLabel(
  output: ZeroShotClassificationOutput,
  label: string,
): number {
  log.ger({
    type: "info",
    message: "getScoreForLabel",
    data: {
      output,
      label,
    },
  });
  // look at this code and see if it is correct.
  const index = output.labels.findIndex(
    (candidate) => candidate.trim().toLowerCase() === label.trim().toLowerCase(),
  );
  return index >= 0 ? output.scores[index] ?? 0 : 0;
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

  const scores = Object.values(QUESTION_CLASSIFIER_LABELS).reduce((acc: Score[], question: string) => {
    const score = getScoreForLabel(output, question);
    acc.push({ label: question, score });
    return acc;
  }, [] as Score[]).sort((a: Score, b: Score) => b.score - a.score);

  const questionScore = getScoreForLabel(
    output,
    QUESTION_CLASSIFIER_LABELS.question,
  );
  const nonQuestionScore = getScoreForLabel(
    output,
    QUESTION_CLASSIFIER_LABELS.nonQuestion,
  );

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
      detectedAt: args.detectedAt ?? new Date().toISOString(),
    };
  }
  const minScore = args.minScore ?? LIVE_QUESTION_MIN_SCORE;
  const minMargin = args.minMargin ?? LIVE_QUESTION_MIN_MARGIN;
  const margin = questionScore - nonQuestionScore;

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

    return mapQuestionDetectionResult({
      sessionId: input.sessionId,
      chunkId: input.chunkId,
      source: input.source,
      text,
      raw,
    });
  };
}
