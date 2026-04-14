import assert from "node:assert/strict";
import { test } from "@jest/globals";

import { LiveAnswerIntervalBuffer } from "../application/services/live-answer-interval-buffer";

test("live answer interval buffer groups chunks by recorded time and accepts delayed chunks before finalizing", () => {
  const buffer = new LiveAnswerIntervalBuffer({
    intervalMs: 10_000,
    allowedLatenessIntervals: 1,
  });

  buffer.reset("2026-04-06T12:00:00.000Z");

  assert.deepEqual(
    buffer.append({
      chunkId: "chunk-1",
      recordedAt: "2026-04-06T12:00:01.000Z",
      text: "I led the migration",
    }).readyIntervals,
    [],
  );
  assert.deepEqual(
    buffer.append({
      chunkId: "chunk-2",
      recordedAt: "2026-04-06T12:00:06.000Z",
      text: "across two services",
    }).readyIntervals,
    [],
  );
  assert.deepEqual(
    buffer.append({
      chunkId: "chunk-late",
      recordedAt: "2026-04-06T12:00:08.000Z",
      text: "and coordinated QA",
    }).readyIntervals,
    [],
  );

  const readyIntervals = buffer.append({
    chunkId: "chunk-3",
    recordedAt: "2026-04-06T12:00:22.000Z",
    text: "This belongs to a later answer window.",
  }).readyIntervals;

  assert.equal(readyIntervals.length, 1);
  assert.deepEqual(readyIntervals[0]?.chunkIds, [
    "chunk-1",
    "chunk-2",
    "chunk-late",
  ]);
  assert.equal(
    readyIntervals[0]?.text,
    "I led the migration across two services and coordinated QA",
  );
  assert.equal(
    readyIntervals[0]?.windowStartedAt,
    "2026-04-06T12:00:00.000Z",
  );
  assert.equal(
    readyIntervals[0]?.windowEndedAt,
    "2026-04-06T12:00:10.000Z",
  );
});

test("live answer interval buffer flushes the remaining windows in order", () => {
  const buffer = new LiveAnswerIntervalBuffer({ intervalMs: 10_000 });

  buffer.reset("2026-04-06T12:00:00.000Z");
  buffer.append({
    chunkId: "chunk-1",
    recordedAt: "2026-04-06T12:00:02.000Z",
    text: "First answer window.",
  });
  buffer.append({
    chunkId: "chunk-2",
    recordedAt: "2026-04-06T12:00:12.000Z",
    text: "Second answer window.",
  });

  const flushed = buffer.flushAll();

  assert.equal(flushed.length, 2);
  assert.equal(flushed[0]?.text, "First answer window.");
  assert.equal(flushed[1]?.text, "Second answer window.");
});
