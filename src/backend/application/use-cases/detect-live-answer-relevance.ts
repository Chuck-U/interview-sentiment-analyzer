import type {
  PipelineActiveQuestionState,
  PipelineLiveAnswerEvaluationState,
} from "../../../shared";

const DEFAULT_OFF_TOPIC_WARNING_THRESHOLD = 0.6;
const DEFAULT_STRONG_DRIFT_THRESHOLD = 0.75;
const DEFAULT_OFF_TOPIC_STREAK_THRESHOLD = 3;

const STOP_WORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "but",
  "by",
  "can",
  "did",
  "do",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "just",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "so",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "was",
  "we",
  "what",
  "when",
  "where",
  "which",
  "with",
  "you",
  "your",
]);

const FILLER_WORDS = new Set([
  "actually",
  "basically",
  "honestly",
  "just",
  "kind",
  "kinda",
  "like",
  "literally",
  "maybe",
  "really",
  "sort",
  "uh",
  "uhh",
  "um",
  "umm",
  "well",
]);

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

export type ScoreAnswerRelevanceInput = {
  readonly questionText: string;
  readonly answerWindowText: string;
  readonly abortSignal?: AbortSignal;
};

export type AnswerRelevanceScorerKind =
  | "local-embeddings"
  | "local-reranker"
  | "external-provider";

export type AnswerRelevanceScorerDescriptor = {
  readonly kind: AnswerRelevanceScorerKind;
  readonly providerId: string;
  readonly modelId: string;
};

export type ScoreAnswerRelevanceUsage = {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly cachedTokens?: number;
};

export type ScoreAnswerRelevanceResult = {
  readonly relevanceScore: number;
  readonly scorer?: AnswerRelevanceScorerDescriptor;
  readonly onTopic?: boolean;
  readonly offTopicPoints?: readonly string[];
  readonly usage?: ScoreAnswerRelevanceUsage;
  readonly modelId?: string;
  readonly providerRequestId?: string;
};

export type DetectLiveAnswerRelevanceInput = {
  readonly activeQuestion?: PipelineActiveQuestionState;
  readonly answerWindowText: string;
  readonly evaluatedAt: string;
  readonly previousStreakCount: number;
  readonly abortSignal?: AbortSignal;
};

export type DetectLiveAnswerRelevanceDependencies = {
  readonly scoreAnswerRelevance?: (
    input: ScoreAnswerRelevanceInput,
  ) => Promise<ScoreAnswerRelevanceResult>;
  readonly offTopicWarningThreshold?: number;
  readonly strongDriftThreshold?: number;
  readonly offTopicStreakThreshold?: number;
};

export type DetectLiveAnswerRelevanceResult =
  PipelineLiveAnswerEvaluationState & {
    readonly streakCount: number;
    readonly lastUpdatedAt: string;
    readonly onTopic?: boolean;
    readonly offTopicPoints?: readonly string[];
    readonly usage?: ScoreAnswerRelevanceUsage;
    readonly modelId?: string;
    readonly providerRequestId?: string;
  };

function normalizeThreshold(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a finite number between 0 and 1`);
  }

  return value;
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function createHeuristicScoreAnswerRelevance(): (
  input: ScoreAnswerRelevanceInput,
) => Promise<ScoreAnswerRelevanceResult> {
  return async ({ questionText, answerWindowText }) => {
    const questionTokens = tokenize(questionText);
    const answerTokens = tokenize(answerWindowText);

    if (questionTokens.length === 0 || answerTokens.length === 0) {
      return { relevanceScore: 0 };
    }

    const questionTokenSet = new Set(questionTokens);
    const answerTokenSet = new Set(answerTokens);
    const overlapCount = [...questionTokenSet].filter((token) =>
      answerTokenSet.has(token),
    ).length;
    const coverage = overlapCount / questionTokenSet.size;
    const unionCount = new Set([...questionTokenSet, ...answerTokenSet]).size;
    const jaccard = unionCount === 0 ? 0 : overlapCount / unionCount;
    const fillerRatio =
      answerTokens.length === 0
        ? 0
        : answerTokens.filter((token) => FILLER_WORDS.has(token)).length
          / answerTokens.length;
    const lengthScore = Math.min(1, answerTokens.length / 12);
    const relevanceScore = clampScore(
      coverage * 0.55 + jaccard * 0.3 + lengthScore * 0.15 - fillerRatio * 0.2,
    );

    return { relevanceScore };
  };
}

export function createDetectLiveAnswerRelevanceUseCase(
  dependencies: DetectLiveAnswerRelevanceDependencies = {},
) {
  const scoreAnswerRelevance =
    dependencies.scoreAnswerRelevance ?? createHeuristicScoreAnswerRelevance();
  const offTopicWarningThreshold = normalizeThreshold(
    dependencies.offTopicWarningThreshold,
    DEFAULT_OFF_TOPIC_WARNING_THRESHOLD,
    "offTopicWarningThreshold",
  );
  const strongDriftThreshold = normalizeThreshold(
    dependencies.strongDriftThreshold,
    DEFAULT_STRONG_DRIFT_THRESHOLD,
    "strongDriftThreshold",
  );
  const offTopicStreakThreshold = normalizePositiveInteger(
    dependencies.offTopicStreakThreshold,
    DEFAULT_OFF_TOPIC_STREAK_THRESHOLD,
    "offTopicStreakThreshold",
  );

  return async function detectLiveAnswerRelevance(
    input: DetectLiveAnswerRelevanceInput,
  ): Promise<DetectLiveAnswerRelevanceResult> {
    const answerWindowText = input.answerWindowText.trim();

    if (!input.activeQuestion) {
      return {
        status: "waiting-for-question",
        answerWindowText: answerWindowText || undefined,
        streakCount: 0,
        lastUpdatedAt: input.evaluatedAt,
      };
    }

    if (answerWindowText.length === 0) {
      return {
        status: "waiting-for-answer",
        activeQuestionText: input.activeQuestion.questionText,
        streakCount: 0,
        lastUpdatedAt: input.evaluatedAt,
      };
    }

    const scored = await scoreAnswerRelevance({
      questionText: input.activeQuestion.questionText,
      answerWindowText,
      abortSignal: input.abortSignal,
    });
    const { relevanceScore } = scored;
    const normalizedRelevanceScore = clampScore(relevanceScore);
    const offTopicSignal = clampScore(1 - normalizedRelevanceScore);
    const isStrongDrift = offTopicSignal >= strongDriftThreshold;
    const qualifiesForOffTopicStreak =
      offTopicSignal >= offTopicWarningThreshold || isStrongDrift;
    const nextStreakCount =
      qualifiesForOffTopicStreak
        ? input.previousStreakCount + 1
        : 0;

    return {
      status:
        nextStreakCount >= offTopicStreakThreshold ? "off-topic" : "scored",
      activeQuestionText: input.activeQuestion.questionText,
      answerWindowText,
      relevanceScore: normalizedRelevanceScore,
      offTopicSignal,
      streakCount: nextStreakCount,
      lastUpdatedAt: input.evaluatedAt,
      ...(scored.onTopic !== undefined ? { onTopic: scored.onTopic } : {}),
      ...(scored.offTopicPoints !== undefined
        ? { offTopicPoints: [...scored.offTopicPoints] }
        : {}),
      ...(scored.usage !== undefined ? { usage: scored.usage } : {}),
      ...(scored.modelId !== undefined ? { modelId: scored.modelId } : {}),
      ...(scored.providerRequestId !== undefined
        ? { providerRequestId: scored.providerRequestId }
        : {}),
    };
  };
}
