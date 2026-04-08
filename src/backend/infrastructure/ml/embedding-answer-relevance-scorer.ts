import { DEFAULT_ANSWER_RELEVANCE_MODEL_ID } from "../../../shared/model-manifest";
import type {
  ScoreAnswerRelevanceInput,
  ScoreAnswerRelevanceResult,
} from "../../application/use-cases/detect-live-answer-relevance";

type FeatureExtractionPipeline = (
  input: string | readonly string[],
  options?: {
    readonly pooling?: "mean";
    readonly normalize?: boolean;
  },
) => Promise<unknown>;

export type CreateEmbeddingAnswerRelevanceScorerDependencies = {
  readonly getPipeline: (modelId: string) => Promise<unknown>;
  readonly modelId?: string;
  readonly providerId?: string;
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toNumericVector(raw: unknown): readonly number[] {
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return [];
    }

    if (raw.every((value) => typeof value === "number")) {
      return raw
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
    }

    return toNumericVector(raw[0]);
  }

  if (typeof raw !== "object" || raw === null) {
    throw new Error("feature extraction output must be an object or array");
  }

  const candidate = raw as {
    readonly data?: ArrayLike<unknown>;
    readonly tolist?: () => unknown;
  };

  if (typeof candidate.tolist === "function") {
    return toNumericVector(candidate.tolist());
  }

  if (candidate.data) {
    return Array.from(candidate.data)
      .map((value) => (typeof value === "number" ? value : Number(value)))
      .filter((value) => Number.isFinite(value));
  }

  throw new Error("feature extraction output did not include embedding values");
}

function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  const dimension = Math.min(left.length, right.length);

  if (dimension === 0) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < dimension; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function createEmbeddingAnswerRelevanceScorer(
  dependencies: CreateEmbeddingAnswerRelevanceScorerDependencies,
): (
  input: ScoreAnswerRelevanceInput,
) => Promise<ScoreAnswerRelevanceResult> {
  const modelId = dependencies.modelId ?? DEFAULT_ANSWER_RELEVANCE_MODEL_ID;
  const providerId = dependencies.providerId ?? "local-transformersjs";

  return async function scoreAnswerRelevance(
    input: ScoreAnswerRelevanceInput,
  ): Promise<ScoreAnswerRelevanceResult> {
    const pipelineUnknown = await dependencies.getPipeline(modelId);
    const extractEmbedding = pipelineUnknown as FeatureExtractionPipeline;
    const extractorOptions = {
      pooling: "mean" as const,
      normalize: true,
    };

    const [questionRawEmbedding, answerRawEmbedding] = await Promise.all([
      extractEmbedding(input.questionText, extractorOptions),
      extractEmbedding(input.answerWindowText, extractorOptions),
    ]);
    const questionEmbedding = toNumericVector(questionRawEmbedding);
    const answerEmbedding = toNumericVector(answerRawEmbedding);
    const similarity = cosineSimilarity(questionEmbedding, answerEmbedding);

    return {
      // Cosine similarity spans [-1, 1]; normalize into the use case's 0..1 range.
      relevanceScore: clampScore((similarity + 1) / 2),
      scorer: {
        kind: "local-embeddings",
        providerId,
        modelId,
      },
    };
  };
}
