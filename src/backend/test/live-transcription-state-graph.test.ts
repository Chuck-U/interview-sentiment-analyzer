import assert from "node:assert/strict";
import { test } from "@jest/globals";

import { LiveTranscriptionStateGraph } from "../application/services/live-transcription-state-graph";
import type { QuestionDetectionPayload } from "../../shared/question-detection";
import type { AnswerRelevanceAssessmentPayload } from "../../shared/answer-relevance";

function createQuestionDetectionPayload(input: {
  readonly chunkId: string;
  readonly detectedAt: string;
  readonly text: string;
}): QuestionDetectionPayload {
  return {
    sessionId: "session-1",
    chunkId: input.chunkId,
    source: "desktop-capture",
    text: input.text,
    questionScore: 0.92,
    statementScore: 0.08,
    anecdoteScore: 0,
    greetingScore: 0,
    introductionScore: 0,
    nonQuestionScore: 0.08,
    topLabel: "question",
    questionConfidence: 0.88,
    detectedAt: input.detectedAt,
  };
}

test("live transcription state graph makes the detected question first-class state", async () => {
  const publishedQuestions: QuestionDetectionPayload[] = [];
  const graph = new LiveTranscriptionStateGraph({
    detectLiveQuestion: async ({ chunkId, detectedAt, text }) =>
      createQuestionDetectionPayload({
        chunkId,
        detectedAt: detectedAt ?? "2026-04-06T12:00:00.000Z",
        text,
      }),
    detectLiveAnswerRelevance: async () => {
      throw new Error("answer relevance should not run for question-only input");
    },
    publishQuestionDetected(payload) {
      publishedQuestions.push(payload);
    },
  });

  const graphState = await graph.process({
    sessionId: "session-1",
    chunkId: "question-chunk",
    source: "desktop-capture",
    transcription: {
      sessionId: "session-1",
      chunkId: "question-chunk",
      source: "desktop-capture",
      text: "Tell me about a time you led a migration.",
      recordedAt: "2026-04-06T12:00:00.000Z",
    },
  });

  assert.equal(publishedQuestions.length, 1);
  assert.equal(
    graphState.activeQuestion?.questionText,
    "Tell me about a time you led a migration.",
  );
  assert.equal(graphState.liveAnswerEvaluation?.status, "waiting-for-answer");
  assert.equal(graphState.liveAnswerEvaluation?.streakCount, 0);
});

test("live transcription state graph refuses to score microphone answers until a question exists", async () => {
  const publishedAssessments: AnswerRelevanceAssessmentPayload[] = [];
  const graph = new LiveTranscriptionStateGraph({
    detectLiveQuestion: async () => null,
    detectLiveAnswerRelevance: async () => {
      throw new Error("answer relevance should not run without a question");
    },
    publishAnswerRelevance(payload) {
      publishedAssessments.push(payload);
    },
  });

  const graphState = await graph.process({
    sessionId: "session-1",
    chunkId: "answer-chunk",
    source: "microphone",
    transcription: {
      sessionId: "session-1",
      chunkId: "answer-chunk",
      source: "microphone",
      text: "I led the rollout and coordinated QA.",
      recordedAt: "2026-04-06T12:00:05.000Z",
    },
  });

  assert.equal(graphState.activeQuestion, undefined);
  assert.equal(graphState.liveAnswerEvaluation?.status, "waiting-for-question");
  assert.equal(publishedAssessments.length, 0);
});

test("live transcription state graph scores buffered answer windows and tracks the three-window streak", async () => {
  const publishedAssessments: AnswerRelevanceAssessmentPayload[] = [];
  const appendedLogs: string[] = [];
  const graph = new LiveTranscriptionStateGraph({
    detectLiveQuestion: async ({ chunkId, detectedAt, text }) =>
      createQuestionDetectionPayload({
        chunkId,
        detectedAt: detectedAt ?? "2026-04-06T12:00:00.000Z",
        text,
      }),
    detectLiveAnswerRelevance: async ({
      activeQuestion,
      answerWindowText,
      evaluatedAt,
      previousStreakCount,
    }) => ({
      status: previousStreakCount + 1 >= 3 ? "off-topic" : "scored",
      activeQuestionText: activeQuestion?.questionText,
      answerWindowText,
      relevanceScore: 0.1,
      offTopicSignal: 0.9,
      streakCount: previousStreakCount + 1,
      lastUpdatedAt: evaluatedAt,
    }),
    appendTranscriptLog: async (input) => {
      appendedLogs.push(`${input.source}:${input.text}`);
    },
    publishAnswerRelevance(payload) {
      publishedAssessments.push(payload);
    },
  });

  await graph.process({
    sessionId: "session-1",
    chunkId: "question-chunk",
    source: "desktop-capture",
    transcription: {
      sessionId: "session-1",
      chunkId: "question-chunk",
      source: "desktop-capture",
      text: "Tell me about a time you led a migration.",
      recordedAt: "2026-04-06T12:00:00.000Z",
    },
  });

  await graph.process({
    sessionId: "session-1",
    chunkId: "answer-1",
    source: "microphone",
    transcription: {
      sessionId: "session-1",
      chunkId: "answer-1",
      source: "microphone",
      text: "I mostly talked about travel.",
      recordedAt: "2026-04-06T12:00:01.000Z",
    },
  });
  await graph.process({
    sessionId: "session-1",
    chunkId: "answer-2",
    source: "microphone",
    transcription: {
      sessionId: "session-1",
      chunkId: "answer-2",
      source: "microphone",
      text: "Then I drifted into hobbies.",
      recordedAt: "2026-04-06T12:00:11.000Z",
    },
  });
  await graph.process({
    sessionId: "session-1",
    chunkId: "answer-3",
    source: "microphone",
    transcription: {
      sessionId: "session-1",
      chunkId: "answer-3",
      source: "microphone",
      text: "After that I talked about a concert.",
      recordedAt: "2026-04-06T12:00:21.000Z",
    },
  });

  const finalState = await graph.flushSession("session-1");

  assert.equal(publishedAssessments.length, 3);
  assert.deepEqual(
    publishedAssessments.map((payload) => payload.streakCount),
    [1, 2, 3],
  );
  assert.equal(publishedAssessments[2]?.status, "off-topic");
  assert.equal(finalState.liveAnswerEvaluation?.status, "off-topic");
  assert.equal(finalState.liveAnswerEvaluation?.streakCount, 3);
  assert.deepEqual(appendedLogs, [
    "desktop-capture:Tell me about a time you led a migration.",
    "microphone:I mostly talked about travel.",
    "microphone:Then I drifted into hobbies.",
    "microphone:After that I talked about a concert.",
  ]);
});
