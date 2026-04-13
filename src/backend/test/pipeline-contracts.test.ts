import assert from "node:assert/strict";
import test from "node:test";

import {
  createPipelineEventEnvelope,
  normalizePipelineArtifactPath,
} from "../../shared";

test("pipeline artifact paths stay session-relative and normalized", () => {
  assert.equal(
    normalizePipelineArtifactPath("chunks\\audio//chunk-1.wav"),
    "chunks/audio/chunk-1.wav",
  );

  assert.throws(
    () => normalizePipelineArtifactPath("/tmp/chunk-1.wav"),
    /session-relative/,
  );
  assert.throws(
    () => normalizePipelineArtifactPath("../outside-session.wav"),
    /cannot escape the session root/,
  );
});

test("pipeline events default schema versions and enforce artifact handoffs", () => {
  const chunkRegistered = createPipelineEventEnvelope({
    eventId: "event-1",
    eventType: "chunk.registered",
    sessionId: "session-1",
    chunkId: "chunk-1",
    correlationId: "correlation-1",
    occurredAt: "2026-03-12T12:00:00.000Z",
    payload: {
      chunkId: "chunk-1",
      source: "microphone",
      recordedAt: "2026-03-12T11:59:58.000Z",
      registeredAt: "2026-03-12T12:00:00.000Z",
      byteSize: 256,
      inputArtifacts: [],
      outputArtifacts: [
        {
          artifactId: "artifact-1",
          artifactKind: "media-chunk",
          relativePath: "chunks/audio/chunk-1.wav",
          byteSize: 256,
        },
      ],
    },
  });

  assert.equal(chunkRegistered.schemaVersion, 1);
  assert.equal(chunkRegistered.payloadSchemaVersion, 1);
  assert.equal(chunkRegistered.stageName, "chunk.registered");

  assert.throws(
    () =>
      createPipelineEventEnvelope({
        eventId: "event-2",
        eventType: "transcript.ready",
        sessionId: "session-1",
        chunkId: "chunk-1",
        correlationId: "correlation-1",
        occurredAt: "2026-03-12T12:00:10.000Z",
        payload: {
          chunkId: "chunk-1",
          completedAt: "2026-03-12T12:00:10.000Z",
          language: "en",
          inputArtifacts: [
            {
              artifactId: "artifact-1",
              artifactKind: "media-chunk",
              relativePath: "chunks/audio/chunk-1.wav",
            },
          ],
          outputArtifacts: [],
        },
      }),
    /outputArtifacts must include artifact kinds: transcript/,
  );

  assert.throws(
    () =>
      createPipelineEventEnvelope({
        eventId: "event-3",
        eventType: "analyze_chunk.requested",
        sessionId: "session-1",
        chunkId: "chunk-1",
        correlationId: "correlation-1",
        occurredAt: "2026-03-12T12:00:20.000Z",
        payload: {
          chunkId: "chunk-1",
          requestedAt: "2026-03-12T12:00:20.000Z",
          inputArtifacts: [
            {
              artifactId: "transcript-1",
              artifactKind: "transcript",
              relativePath: "transcripts/chunk-1.json",
            },
            {
              artifactId: "signals-1",
              artifactKind: "signal-set",
              relativePath: "summaries/signals/chunk-1.json",
            },
          ],
          outputArtifacts: [],
        },
      }),
    /inputArtifacts must include artifact kinds: participant-set, question-set, interaction-metrics, participant-baseline/,
  );

  const coachingRequested = createPipelineEventEnvelope({
    eventId: "event-4",
    eventType: "coaching.requested",
    sessionId: "session-1",
    correlationId: "correlation-1",
    occurredAt: "2026-03-12T12:00:30.000Z",
    payload: {
      requestedAt: "2026-03-12T12:00:30.000Z",
      inputArtifacts: [
        {
          artifactId: "session-summary-1",
          artifactKind: "session-summary",
          relativePath: "summaries/session-summary-session-1.md",
        },
      ],
      outputArtifacts: [],
    },
  });

  assert.equal(coachingRequested.stageName, "coaching.requested");
  assert.equal(coachingRequested.payloadSchemaVersion, 1);
});

test("persisted pipeline events can skip artifact handoff validation (legacy rows)", () => {
  assert.throws(
    () =>
      createPipelineEventEnvelope({
        eventId: "legacy-derive",
        eventType: "derive_signals.requested",
        sessionId: "session-1",
        chunkId: "chunk-1",
        correlationId: "correlation-1",
        occurredAt: "2026-03-12T12:00:00.000Z",
        payload: {
          chunkId: "chunk-1",
          requestedAt: "2026-03-12T12:00:00.000Z",
          inputArtifacts: [
            {
              artifactId: "t-1",
              artifactKind: "transcript",
              relativePath: "transcripts/chunk-1.json",
            },
          ],
          outputArtifacts: [],
        },
      }),
    /inputArtifacts must include artifact kinds: participant-set/,
  );

  const legacy = createPipelineEventEnvelope(
    {
      eventId: "legacy-derive",
      eventType: "derive_signals.requested",
      sessionId: "session-1",
      chunkId: "chunk-1",
      correlationId: "correlation-1",
      occurredAt: "2026-03-12T12:00:00.000Z",
      payload: {
        chunkId: "chunk-1",
        requestedAt: "2026-03-12T12:00:00.000Z",
        inputArtifacts: [
          {
            artifactId: "t-1",
            artifactKind: "transcript",
            relativePath: "transcripts/chunk-1.json",
          },
        ],
        outputArtifacts: [],
      },
    },
    { skipArtifactHandoffValidation: true },
  );

  assert.equal(legacy.eventType, "derive_signals.requested");
  assert.equal(legacy.payload.inputArtifacts.length, 1);
});

test("pipeline events preserve graph-state snapshots and provider routes", () => {
  const transcriptReady = createPipelineEventEnvelope({
    eventId: "event-graph-state-1",
    eventType: "transcript.ready",
    sessionId: "session-1",
    chunkId: "chunk-1",
    correlationId: "correlation-1",
    occurredAt: "2026-03-12T12:01:00.000Z",
    payload: {
      chunkId: "chunk-1",
      completedAt: "2026-03-12T12:01:00.000Z",
      language: "en",
      inputArtifacts: [
        {
          artifactId: "media-1",
          artifactKind: "media-chunk",
          relativePath: "chunks/audio/chunk-1.wav",
        },
      ],
      outputArtifacts: [
        {
          artifactId: "transcript-1",
          artifactKind: "transcript",
          relativePath: "transcripts/chunk-1.json",
        },
      ],
      graphState: {
        activeQuestion: {
          questionId: "question-1",
          questionText: "Tell me about a time you resolved a conflict.",
          sourceEventId: "question-event-1",
          sourceChunkId: "chunk-1",
          detectedAt: "2026-03-12T12:01:00.000Z",
          confidence: 0.92,
        },
        liveAnswerEvaluation: {
          status: "waiting-for-answer",
          lastUpdatedAt: "2026-03-12T12:01:00.000Z",
          streakCount: 0,
        },
      },
      providerRoute: {
        routeKind: "local",
        providerId: "local-pipeline-analysis",
        modelId: "onnx-community/distilbert-base-uncased-mnli-ONNX",
        selectedAt: "2026-03-12T12:01:00.000Z",
      },
    },
  });

  assert.equal(
    transcriptReady.payload.graphState?.activeQuestion?.questionText,
    "Tell me about a time you resolved a conflict.",
  );
  assert.equal(
    transcriptReady.payload.providerRoute?.providerId,
    "local-pipeline-analysis",
  );
  assert.equal(
    transcriptReady.payload.graphState?.liveAnswerEvaluation?.status,
    "waiting-for-answer",
  );
});

test("live answer relevance pipeline events validate and accept empty artifacts", () => {
  const requested = createPipelineEventEnvelope({
    eventId: "live-ar-req-1",
    eventType: "live_answer_relevance.requested",
    sessionId: "session-1",
    chunkId: "mic-chunk-9",
    correlationId: "corr-live-1",
    occurredAt: "2026-04-06T12:05:00.000Z",
    payload: {
      inputArtifacts: [],
      outputArtifacts: [],
      requestedAt: "2026-04-06T12:05:00.000Z",
      activeQuestionText: "What was your role?",
      answerWindowText: "I owned the API layer.",
      windowStartedAt: "2026-04-06T12:04:50.000Z",
      windowEndedAt: "2026-04-06T12:05:00.000Z",
      micChunkIds: ["mic-chunk-8", "mic-chunk-9"],
      evaluationCorrelationId: "eval-corr-1",
    },
  });

  assert.equal(requested.eventType, "live_answer_relevance.requested");
  assert.equal(requested.payloadSchemaVersion, 1);

  const ready = createPipelineEventEnvelope({
    eventId: "live-ar-ready-1",
    eventType: "live_answer_relevance.ready",
    sessionId: "session-1",
    chunkId: "mic-chunk-9",
    correlationId: "corr-live-1",
    occurredAt: "2026-04-06T12:05:01.000Z",
    payload: {
      inputArtifacts: [],
      outputArtifacts: [],
      completedAt: "2026-04-06T12:05:01.000Z",
      onTopic: true,
      offTopicPoints: [],
      relevanceScore: 0.88,
      offTopicSignal: 0.12,
      streakCount: 0,
      evaluationCorrelationId: "eval-corr-1",
      usage: { promptTokens: 120, completionTokens: 40, cachedTokens: 80 },
    },
  });

  assert.equal(ready.eventType, "live_answer_relevance.ready");
  assert.equal(ready.payload.onTopic, true);
});
