import assert from "node:assert/strict";
import { test } from "@jest/globals";

import {
  QUESTION_CLASSIFIER_LABELS,
  createDetectLiveQuestionUseCase,
  evaluateQuestionScores,
  mapQuestionDetectionResult,
} from "../application/use-cases/detect-live-question";

test("evaluateQuestionScores maps every classifier key and picks topLabel by score", () => {
  const q = QUESTION_CLASSIFIER_LABELS.question;
  const nq = QUESTION_CLASSIFIER_LABELS.nonQuestion;
  const anecdote = QUESTION_CLASSIFIER_LABELS.anecdote;

  const evaluation = evaluateQuestionScores({
    labels: [anecdote, q, nq],
    scores: [0.1, 0.7, 0.2],
  });

  assert.equal(evaluation.scores.question, 0.7);
  assert.equal(evaluation.scores.nonQuestion, 0.2);
  assert.equal(evaluation.scores.anecdote, 0.1);
  assert.equal(evaluation.scores.statement, 0.2);
  assert.equal(evaluation.scores.greeting, 0);
  assert.equal(evaluation.scores.introduction, 0);
  assert.equal(evaluation.topLabel, q);
  const expectedConfidence = 0.7 * (1 - Math.max(0.2, 0.2) * 0.5);
  assert.equal(evaluation.questionConfidence, expectedConfidence);
});

test("evaluateQuestionScores applies questionScore * (1 - max(statement,nonQuestion) * 0.5)", () => {
  const q = QUESTION_CLASSIFIER_LABELS.question;
  const nq = QUESTION_CLASSIFIER_LABELS.nonQuestion;

  const evaluation = evaluateQuestionScores({
    labels: [q, nq],
    scores: [0.8, 0.4],
  });

  assert.equal(evaluation.scores.question, 0.8);
  assert.equal(evaluation.scores.nonQuestion, 0.4);
  assert.equal(evaluation.scores.statement, 0.4);
  assert.equal(
    evaluation.questionConfidence,
    0.8 * (1 - Math.max(0.4, 0.4) * 0.5),
  );
});

test("mapQuestionDetectionResult matches labels by name instead of order", () => {
  const detection = mapQuestionDetectionResult({
    sessionId: "session-1",
    chunkId: "chunk-1",
    source: "desktop-capture",
    text: "Can you walk me through a time you handled conflict?",
    raw: {
      labels: [
        QUESTION_CLASSIFIER_LABELS.nonQuestion,
        QUESTION_CLASSIFIER_LABELS.question,
      ],
      scores: [0.08, 0.92],
    },
  });

  assert.equal(
    detection.text,
    "Can you walk me through a time you handled conflict?",
  );
  assert.equal(detection.sessionId, "session-1");
  assert.equal(detection.chunkId, "chunk-1");
  assert.equal(detection.source, "desktop-capture");
  assert.equal(detection.questionScore, 0.92);
  assert.equal(detection.nonQuestionScore, 0.08);
  assert.equal(detection.statementScore, 0.08);
  assert.equal(detection.anecdoteScore, 0);
  assert.equal(detection.greetingScore, 0);
  assert.equal(detection.introductionScore, 0);
  assert.equal(detection.topLabel, QUESTION_CLASSIFIER_LABELS.question);
  assert.equal(
    detection.questionConfidence,
    0.92 * (1 - Math.max(0.08, 0.08) * 0.5),
  );
  assert.match(detection.detectedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("mapQuestionDetectionResult returns payload with low questionConfidence when classifier favors non-question", () => {
  const detection = mapQuestionDetectionResult({
    sessionId: "session-1",
    chunkId: "chunk-1",
    source: "desktop-capture",
    text: "Tell me about yourself.",
    raw: {
      labels: [
        QUESTION_CLASSIFIER_LABELS.question,
        QUESTION_CLASSIFIER_LABELS.nonQuestion,
      ],
      scores: [0.15, 0.85],
    },
  });

  assert.equal(detection.questionScore, 0.15);
  assert.equal(detection.nonQuestionScore, 0.85);
  assert.equal(detection.statementScore, 0.85);
  assert.equal(detection.topLabel, QUESTION_CLASSIFIER_LABELS.nonQuestion);
  assert.equal(
    detection.questionConfidence,
    0.15 * (1 - Math.max(0.85, 0.85) * 0.5),
  );
  assert.ok(detection.questionConfidence < 0.3);
});

test("detectLiveQuestion returns null for blank transcripts", async () => {
  const useCase = createDetectLiveQuestionUseCase({
    getPipeline: async () => {
      throw new Error("classifier should not run for blank input");
    },
  });

  const result = await useCase({
    sessionId: "session-1",
    chunkId: "chunk-1",
    source: "desktop-capture",
    text: "   ",
  });

  assert.equal(result, null);
});
