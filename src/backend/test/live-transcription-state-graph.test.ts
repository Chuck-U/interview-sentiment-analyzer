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

test("mixed desktop-capture does not set activeQuestion", async () => {
  const publishedQuestions: QuestionDetectionPayload[] = [];
  const graph = new LiveTranscriptionStateGraph({
    detectLiveQuestion: async ({ chunkId, detectedAt, text }) =>
      createQuestionDetectionPayload({
        chunkId,
        detectedAt: detectedAt ?? "2026-04-06T12:00:00.000Z",
        text,
      }),
    detectLiveAnswerRelevance: async () => {
      throw new Error("answer relevance should not run for mixed input");
    },
    publishQuestionDetected(payload) {
      publishedQuestions.push(payload);
    },
  });

  const graphState = await graph.process({
    sessionId: "session-mixed-q",
    chunkId: "mixed-chunk",
    source: "desktop-capture",
    provenance: "mixed-desktop-audio",
    transcription: {
      sessionId: "session-mixed-q",
      chunkId: "mixed-chunk",
      source: "desktop-capture",
      text: "Tell me about a time you led a migration.",
      recordedAt: "2026-04-06T12:00:00.000Z",
    },
  });

  assert.equal(publishedQuestions.length, 0);
  assert.equal(graphState.activeQuestion, undefined);
});

test("mixed desktop-capture does not feed answer scoring", async () => {
  const publishedAssessments: AnswerRelevanceAssessmentPayload[] = [];
  const graph = new LiveTranscriptionStateGraph({
    detectLiveQuestion: async ({ chunkId, detectedAt, text }) =>
      createQuestionDetectionPayload({
        chunkId,
        detectedAt: detectedAt ?? "2026-04-06T12:00:00.000Z",
        text,
      }),
    detectLiveAnswerRelevance: async () => {
      throw new Error("answer relevance should not run for mixed mic input");
    },
    publishQuestionDetected() {},
    publishAnswerRelevance(payload) {
      publishedAssessments.push(payload);
    },
  });

  await graph.process({
    sessionId: "session-mixed-a",
    chunkId: "question-chunk",
    source: "desktop-capture",
    provenance: "clean-system-audio",
    transcription: {
      sessionId: "session-mixed-a",
      chunkId: "question-chunk",
      source: "desktop-capture",
      text: "What was the biggest challenge?",
      recordedAt: "2026-04-06T12:00:00.000Z",
    },
  });

  const graphState = await graph.process({
    sessionId: "session-mixed-a",
    chunkId: "answer-chunk",
    source: "microphone",
    provenance: "mixed-desktop-audio",
    transcription: {
      sessionId: "session-mixed-a",
      chunkId: "answer-chunk",
      source: "microphone",
      text: "I rebuilt the whole system.",
      recordedAt: "2026-04-06T12:00:05.000Z",
    },
  });

  assert.equal(publishedAssessments.length, 0);
  assert.notEqual(graphState.activeQuestion, undefined);
});

test("clean system-audio can produce an active question", async () => {
  const publishedQuestions: QuestionDetectionPayload[] = [];
  const graph = new LiveTranscriptionStateGraph({
    detectLiveQuestion: async ({ chunkId, detectedAt, text }) =>
      createQuestionDetectionPayload({
        chunkId,
        detectedAt: detectedAt ?? "2026-04-06T12:00:00.000Z",
        text,
      }),
    detectLiveAnswerRelevance: async () => {
      throw new Error("answer relevance should not run");
    },
    publishQuestionDetected(payload) {
      publishedQuestions.push(payload);
    },
  });

  const graphState = await graph.process({
    sessionId: "session-sys-audio",
    chunkId: "sys-chunk",
    source: "system-audio",
    provenance: "clean-system-audio",
    transcription: {
      sessionId: "session-sys-audio",
      chunkId: "sys-chunk",
      source: "system-audio",
      text: "What was the biggest challenge?",
      recordedAt: "2026-04-06T12:00:00.000Z",
    },
  });

  assert.equal(publishedQuestions.length, 1);
  assert.notEqual(graphState.activeQuestion, undefined);
});

test("dedicated microphone stays answer-only", async () => {
  const publishedQuestions: QuestionDetectionPayload[] = [];
  const graph = new LiveTranscriptionStateGraph({
    detectLiveQuestion: async () => null,
    detectLiveAnswerRelevance: async () => {
      throw new Error("no question yet");
    },
    publishQuestionDetected(payload) {
      publishedQuestions.push(payload);
    },
  });

  const graphState = await graph.process({
    sessionId: "session-ded-mic",
    chunkId: "mic-chunk",
    source: "microphone",
    provenance: "dedicated-microphone",
    transcription: {
      sessionId: "session-ded-mic",
      chunkId: "mic-chunk",
      source: "microphone",
      text: "I worked on the backend.",
      recordedAt: "2026-04-06T12:00:00.000Z",
    },
  });

  assert.equal(publishedQuestions.length, 0);
  assert.equal(graphState.activeQuestion, undefined);
  assert.equal(graphState.liveAnswerEvaluation?.status, "waiting-for-question");
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

  const mic = (
    chunkId: string,
    text: string,
    recordedAt: string,
    pcmDurationMs: number,
    pcmRms: number,
  ) =>
    graph.process({
      sessionId: "session-1",
      chunkId,
      source: "microphone",
      transcription: {
        sessionId: "session-1",
        chunkId,
        source: "microphone",
        text,
        recordedAt,
        pcmDurationMs,
        pcmRms,
      },
    });

  await mic("a1", "I mostly talked about travel.", "2026-04-06T12:00:01.000Z", 500, 0.02);
  await mic("s1", "", "2026-04-06T12:00:01.500Z", 2000, 0.001);
  await mic("s2", "", "2026-04-06T12:00:03.500Z", 2000, 0.001);

  await mic("a2", "Then I drifted into hobbies.", "2026-04-06T12:00:06.000Z", 500, 0.02);
  await mic("s3", "", "2026-04-06T12:00:06.500Z", 2000, 0.001);
  await mic("s4", "", "2026-04-06T12:00:08.500Z", 2000, 0.001);

  await mic(
    "a3",
    "After that I talked about a concert.",
    "2026-04-06T12:00:11.000Z",
    500,
    0.02,
  );
  await mic("s5", "", "2026-04-06T12:00:11.500Z", 2000, 0.001);
  await mic("s6", "", "2026-04-06T12:00:13.500Z", 2000, 0.001);

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

test("live transcription state graph skips answer relevance when OpenRouter is disabled (no key)", async () => {
  const publishedAssessments: AnswerRelevanceAssessmentPayload[] = [];
  const pipelineEvents: string[] = [];
  const appendedLogs: string[] = [];
  const graph = new LiveTranscriptionStateGraph({
    detectLiveQuestion: async ({ chunkId, detectedAt, text }) =>
      createQuestionDetectionPayload({
        chunkId,
        detectedAt: detectedAt ?? "2026-04-06T12:00:00.000Z",
        text,
      }),
    detectLiveAnswerRelevance: async () => {
      throw new Error("answer relevance must not run when OpenRouter is disabled");
    },
    isLiveOpenRouterRelevanceEnabled: async () => false,
    appendTranscriptLog: async (input) => {
      appendedLogs.push(`${input.source}:${input.text}`);
    },
    appendPipelineEvent: async (event) => {
      pipelineEvents.push(event.eventType);
    },
    publishAnswerRelevance(payload) {
      publishedAssessments.push(payload);
    },
  });

  await graph.process({
    sessionId: "session-no-key",
    chunkId: "question-chunk",
    source: "desktop-capture",
    transcription: {
      sessionId: "session-no-key",
      chunkId: "question-chunk",
      source: "desktop-capture",
      text: "Tell me about a time you led a migration.",
      recordedAt: "2026-04-06T12:00:00.000Z",
    },
  });

  const mic = (
    chunkId: string,
    text: string,
    recordedAt: string,
    pcmDurationMs: number,
    pcmRms: number,
  ) =>
    graph.process({
      sessionId: "session-no-key",
      chunkId,
      source: "microphone",
      transcription: {
        sessionId: "session-no-key",
        chunkId,
        source: "microphone",
        text,
        recordedAt,
        pcmDurationMs,
        pcmRms,
      },
    });

  await mic("a1", "I mostly talked about travel.", "2026-04-06T12:00:01.000Z", 500, 0.02);
  await mic("s1", "", "2026-04-06T12:00:01.500Z", 2000, 0.001);
  await mic("s2", "", "2026-04-06T12:00:03.500Z", 2000, 0.001);

  const finalState = await graph.flushSession("session-no-key");

  assert.equal(publishedAssessments.length, 0);
  assert.equal(pipelineEvents.length, 0);
  assert.deepEqual(appendedLogs, [
    "desktop-capture:Tell me about a time you led a migration.",
  ]);
  assert.equal(finalState.liveAnswerEvaluation?.status, "waiting-for-answer");
  assert.equal(finalState.liveAnswerEvaluation?.streakCount, 0);
  assert.equal(
    finalState.liveAnswerEvaluation?.answerWindowText,
    "I mostly talked about travel.",
  );
});
