import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAsrOutput } from "../guards/normalize-asr-output";

test("normalizeAsrOutput maps chunks[].timestamp -> TranscriptChunk.timestamp", () => {
  const raw = {
    text: "hello world",
    chunks: [
      { text: "chunk-1", timestamp: [0, 1.25] },
      { text: "chunk-2", timestamp: [1.25, 2.5] },
    ],
  };

  const result = normalizeAsrOutput(raw);
  assert.equal(result.text, "hello world");
  assert.ok(result.chunks);
  assert.deepEqual(result.chunks, [
    { text: "chunk-1", timestamp: [0, 1.25] },
    { text: "chunk-2", timestamp: [1.25, 2.5] },
  ]);
});

test("normalizeAsrOutput returns no chunks when chunks is an empty array", () => {
  const raw = { text: "anything", chunks: [] };
  const result = normalizeAsrOutput(raw);
  assert.equal(result.text, "anything");
  assert.equal(result.chunks, undefined);
});

test("normalizeAsrOutput returns no chunks when every chunk has invalid timestamp", () => {
  const raw = {
    text: "anything",
    chunks: [
      { text: "bad-1", timestamp: [0] },
      { text: "bad-2", timestamp: "not-an-array" },
      { text: "bad-3" },
      // Non-object items are ignored.
      null,
    ],
  };

  const result = normalizeAsrOutput(raw);
  assert.equal(result.text, "anything");
  assert.equal(result.chunks, undefined);
});

test("normalizeAsrOutput returns empty text for non-object raw input", () => {
  const result = normalizeAsrOutput(null);
  assert.equal(result.text, "");
  assert.equal(result.chunks, undefined);
});

