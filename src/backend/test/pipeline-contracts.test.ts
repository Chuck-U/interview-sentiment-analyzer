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
});
