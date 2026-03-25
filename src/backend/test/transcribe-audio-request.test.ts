import assert from "node:assert/strict";
import test from "node:test";

import { parseTranscribeAudioRequest } from "../guards/transcribe-audio-request";
import type { TranscriptionRequest } from "../../shared/transcription";

test("parseTranscribeAudioRequest accepts a valid request", () => {
  const input = {
    sessionId: "  sess-123  ",
    chunkId: "chunk-abc",
    pcmSamples: [1, NaN, Infinity, -Infinity, 2, "x", undefined, null],
    source: "microphone",
  } as const;

  const result = parseTranscribeAudioRequest(input);
  const expected: TranscriptionRequest = {
    sessionId: "  sess-123  ",
    chunkId: "chunk-abc",
    pcmSamples: [1, 0, 0, 0, 2, 0, 0, 0],
    source: "microphone",
  };

  assert.deepEqual(result, expected);
});

test("parseTranscribeAudioRequest rejects non-object payloads", () => {
  // Matches the IPC handler: it rejects `typeof input !== "object"` and `null`,
  // but does not special-case arrays.
  const inputs: unknown[] = [null, undefined, 123, "hello", true];

  for (const input of inputs) {
    assert.throws(
      () => parseTranscribeAudioRequest(input),
      (err) => err instanceof Error && err.message === "transcribeAudio request must be an object",
    );
  }
});

test("parseTranscribeAudioRequest rejects array payloads as invalid shape", () => {
  assert.throws(
    () => parseTranscribeAudioRequest(["a"]),
    (err) =>
      err instanceof Error &&
      err.message === "transcribeAudio requires sessionId",
  );
});

test("parseTranscribeAudioRequest requires sessionId", () => {
  assert.throws(
    () =>
      parseTranscribeAudioRequest({
        chunkId: "chunk-abc",
        pcmSamples: [0],
        source: "microphone",
      }),
    (err) =>
      err instanceof Error && err.message === "transcribeAudio requires sessionId",
  );

  assert.throws(
    () =>
      parseTranscribeAudioRequest({
        sessionId: "   ",
        chunkId: "chunk-abc",
        pcmSamples: [0],
        source: "microphone",
      }),
    (err) =>
      err instanceof Error && err.message === "transcribeAudio requires sessionId",
  );
});

test("parseTranscribeAudioRequest requires chunkId", () => {
  assert.throws(
    () =>
      parseTranscribeAudioRequest({
        sessionId: "sess-123",
        pcmSamples: [0],
        source: "microphone",
      }),
    (err) =>
      err instanceof Error && err.message === "transcribeAudio requires chunkId",
  );

  assert.throws(
    () =>
      parseTranscribeAudioRequest({
        sessionId: "sess-123",
        chunkId: "",
        pcmSamples: [0],
        source: "microphone",
      }),
    (err) =>
      err instanceof Error && err.message === "transcribeAudio requires chunkId",
  );
});

test("parseTranscribeAudioRequest requires pcmSamples array", () => {
  assert.throws(
    () =>
      parseTranscribeAudioRequest({
        sessionId: "sess-123",
        chunkId: "chunk-abc",
        pcmSamples: null,
        source: "microphone",
      }),
    (err) =>
      err instanceof Error &&
      err.message === "transcribeAudio requires pcmSamples array",
  );

  assert.throws(
    () =>
      parseTranscribeAudioRequest({
        sessionId: "sess-123",
        chunkId: "chunk-abc",
        pcmSamples: "not-an-array",
        source: "microphone",
      }),
    (err) =>
      err instanceof Error &&
      err.message === "transcribeAudio requires pcmSamples array",
  );
});

test("parseTranscribeAudioRequest rejects unsupported audio source", () => {
  assert.throws(
    () =>
      parseTranscribeAudioRequest({
        sessionId: "sess-123",
        chunkId: "chunk-abc",
        pcmSamples: [0],
        source: "not-a-source",
      }),
    (err) =>
      err instanceof Error &&
      err.message === "transcribeAudio requires a supported audio source",
  );
});

