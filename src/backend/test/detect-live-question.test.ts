import assert from "node:assert/strict";
import test from "node:test";

import {
  QUESTION_CLASSIFIER_LABELS,
  createDetectLiveQuestionUseCase,
  mapQuestionDetectionResult,
} from "../application/use-cases/detect-live-question";

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

  assert.ok(detection);
  assert.equal(
    detection?.text,
    "Can you walk me through a time you handled conflict?",
  );
  assert.equal(detection?.questionScore, 0.92);
  assert.equal(detection?.nonQuestionScore, 0.08);
});

test("mapQuestionDetectionResult rejects low-confidence classifications", () => {
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
      scores: [0.55, 0.45],
    },
  });

  assert.equal(detection, null);
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
