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
