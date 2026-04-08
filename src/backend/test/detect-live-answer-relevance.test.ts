import assert from "node:assert/strict";
import { test } from "@jest/globals";

import { createDetectLiveAnswerRelevanceUseCase } from "../application/use-cases/detect-live-answer-relevance";

const activeQuestion = {
  questionId: "question-1",
  questionText: "Tell me about a time you led a migration.",
  sourceChunkId: "question-chunk",
  sourceEventId: "question-event",
  detectedAt: "2026-04-06T12:00:00.000Z",
  confidence: 0.94,
} as const;

test("answer relevance refuses to score when no active question exists", async () => {
  const detectLiveAnswerRelevance = createDetectLiveAnswerRelevanceUseCase({
    scoreAnswerRelevance: async () => ({
      relevanceScore: 0.9,
    }),
  });

  const result = await detectLiveAnswerRelevance({
    answerWindowText: "I led a migration to a new API gateway.",
    evaluatedAt: "2026-04-06T12:00:10.000Z",
    previousStreakCount: 0,
  });

  assert.equal(result.status, "waiting-for-question");
  assert.equal(result.relevanceScore, undefined);
  assert.equal(result.offTopicSignal, undefined);
  assert.equal(result.streakCount, 0);
});

test("answer relevance marks off-topic only after three consecutive qualifying windows", async () => {
  const detectLiveAnswerRelevance = createDetectLiveAnswerRelevanceUseCase({
    scoreAnswerRelevance: async () => ({
      relevanceScore: 0.12,
    }),
  });

  const first = await detectLiveAnswerRelevance({
    activeQuestion,
    answerWindowText: "I mostly rambled about movies and weekend plans.",
    evaluatedAt: "2026-04-06T12:00:10.000Z",
    previousStreakCount: 0,
  });
  const second = await detectLiveAnswerRelevance({
    activeQuestion,
    answerWindowText: "Then I drifted into travel stories and unrelated hobbies.",
    evaluatedAt: "2026-04-06T12:00:20.000Z",
    previousStreakCount: first.streakCount ?? 0,
  });
  const third = await detectLiveAnswerRelevance({
    activeQuestion,
    answerWindowText: "After that I kept talking about a concert and food.",
    evaluatedAt: "2026-04-06T12:00:30.000Z",
    previousStreakCount: second.streakCount ?? 0,
  });

  assert.equal(first.status, "scored");
  assert.equal(first.streakCount, 1);
  assert.equal(second.status, "scored");
  assert.equal(second.streakCount, 2);
  assert.equal(third.status, "off-topic");
  assert.equal(third.streakCount, 3);
  assert.ok((third.offTopicSignal ?? 0) >= 0.75);
});

test("answer relevance resets the streak when the answer returns on topic", async () => {
  const scores = [0.18, 0.82];
  const detectLiveAnswerRelevance = createDetectLiveAnswerRelevanceUseCase({
    scoreAnswerRelevance: async () => ({
      relevanceScore: scores.shift() ?? 0,
    }),
  });

  const drifting = await detectLiveAnswerRelevance({
    activeQuestion,
    answerWindowText: "I talked about travel instead of the migration.",
    evaluatedAt: "2026-04-06T12:00:10.000Z",
    previousStreakCount: 1,
  });
  const recovered = await detectLiveAnswerRelevance({
    activeQuestion,
    answerWindowText: "I led the migration rollout, coordinated QA, and cut over traffic safely.",
    evaluatedAt: "2026-04-06T12:00:20.000Z",
    previousStreakCount: drifting.streakCount ?? 0,
  });

  assert.equal(drifting.streakCount, 2);
  assert.equal(recovered.status, "scored");
  assert.equal(recovered.streakCount, 0);
  assert.ok((recovered.offTopicSignal ?? 1) < 0.6);
});

test("answer relevance thresholds are configurable for calibration", async () => {
  const detectLiveAnswerRelevance = createDetectLiveAnswerRelevanceUseCase({
    offTopicWarningThreshold: 0.8,
    strongDriftThreshold: 0.9,
    offTopicStreakThreshold: 2,
    scoreAnswerRelevance: async () => ({
      relevanceScore: 0.25,
    }),
  });

  const first = await detectLiveAnswerRelevance({
    activeQuestion,
    answerWindowText: "I drifted into unrelated stories.",
    evaluatedAt: "2026-04-06T12:01:10.000Z",
    previousStreakCount: 0,
  });
  const second = await detectLiveAnswerRelevance({
    activeQuestion,
    answerWindowText: "I still stayed off topic.",
    evaluatedAt: "2026-04-06T12:01:20.000Z",
    previousStreakCount: first.streakCount,
  });

  assert.equal(first.status, "scored");
  assert.equal(first.streakCount, 0);
  assert.equal(second.status, "scored");
  assert.equal(second.streakCount, 0);
});
