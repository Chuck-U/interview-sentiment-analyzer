import assert from "node:assert/strict";
import test from "node:test";

import { LiveQuestionTranscriptBuffer } from "../application/services/live-question-transcript-buffer";

test("LiveQuestionTranscriptBuffer defers until sentence end", () => {
  const b = new LiveQuestionTranscriptBuffer();
  b.pushSample("tell us about");
  assert.equal(b.shouldEvaluate(), false);
  b.pushSample("a time you had to be creative?");
  assert.equal(b.shouldEvaluate(), true);
  assert.match(b.getCombinedText(), /tell us about.*creative/i);
});

test("LiveQuestionTranscriptBuffer evaluates after max samples", () => {
  const b = new LiveQuestionTranscriptBuffer({ maxSamples: 3 });
  b.pushSample("a");
  b.pushSample("b");
  assert.equal(b.shouldEvaluate(), false);
  b.pushSample("c");
  assert.equal(b.shouldEvaluate(), true);
});

test("LiveQuestionTranscriptBuffer evaluates two fragments when combined is long enough", () => {
  const b = new LiveQuestionTranscriptBuffer();
  b.pushSample("tell us about");
  assert.equal(b.shouldEvaluate(), false);
  b.pushSample("a time you had to be creative in production");
  assert.equal(b.shouldEvaluate(), true);
  assert.equal(
    b.getCombinedText(),
    "tell us about a time you had to be creative in production",
  );
});

test("clear resets buffer", () => {
  const b = new LiveQuestionTranscriptBuffer();
  b.pushSample("hello");
  b.clear();
  assert.equal(b.getSampleCount(), 0);
  assert.equal(b.getCombinedText(), "");
});

test("LiveQuestionTranscriptBuffer seam-dedupes overlapping consecutive snippets", () => {
  const b = new LiveQuestionTranscriptBuffer();
  b.pushSample("we need more");
  b.pushSample("more context here");
  assert.equal(b.getCombinedText(), "we need more context here");
});
