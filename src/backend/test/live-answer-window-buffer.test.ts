import assert from "node:assert/strict";
import test from "node:test";

import { LiveAnswerWindowBuffer } from "../application/services/live-answer-window-buffer";

test("LiveAnswerWindowBuffer closes the window after 4s of consecutive silence", () => {
  const b = new LiveAnswerWindowBuffer();
  const { readyWindows: w1 } = b.append({
    chunkId: "c1",
    recordedAt: "2026-04-06T12:00:00.000Z",
    text: "Hello there",
    pcmDurationMs: 500,
    pcmRms: 0.02,
  });
  assert.equal(w1.length, 0);

  const { readyWindows: w2 } = b.append({
    chunkId: "c2",
    recordedAt: "2026-04-06T12:00:00.500Z",
    text: "",
    pcmDurationMs: 2000,
    pcmRms: 0.001,
  });
  assert.equal(w2.length, 0);

  const { readyWindows: w3 } = b.append({
    chunkId: "c3",
    recordedAt: "2026-04-06T12:00:02.500Z",
    text: "",
    pcmDurationMs: 2000,
    pcmRms: 0.001,
  });
  assert.equal(w3.length, 1);
  assert.equal(w3[0]?.text, "Hello there");
  assert.deepEqual(w3[0]?.chunkIds, ["c1", "c2", "c3"]);
});

test("LiveAnswerWindowBuffer closes the window at the 30s wall-clock cap", () => {
  const b = new LiveAnswerWindowBuffer();
  b.append({
    chunkId: "a",
    recordedAt: "2026-04-06T12:00:00.000Z",
    text: "Start",
    pcmDurationMs: 1000,
    pcmRms: 0.02,
  });
  const { readyWindows } = b.append({
    chunkId: "b",
    recordedAt: "2026-04-06T12:00:31.000Z",
    text: "End",
    pcmDurationMs: 1000,
    pcmRms: 0.02,
  });
  assert.equal(readyWindows.length, 1);
  assert.ok(readyWindows[0]?.text.includes("Start"));
  assert.ok(readyWindows[0]?.text.includes("End"));
});

test("LiveAnswerWindowBuffer flushAll returns merged text when open", () => {
  const b = new LiveAnswerWindowBuffer();
  b.append({
    chunkId: "x",
    recordedAt: "2026-04-06T12:00:00.000Z",
    text: "Alpha",
    pcmDurationMs: 1000,
    pcmRms: 0.02,
  });
  b.append({
    chunkId: "y",
    recordedAt: "2026-04-06T12:00:01.000Z",
    text: "Beta",
    pcmDurationMs: 1000,
    pcmRms: 0.02,
  });
  const flushed = b.flushAll();
  assert.equal(flushed.length, 1);
  assert.ok(flushed[0]?.text.includes("Alpha"));
  assert.ok(flushed[0]?.text.includes("Beta"));
});
