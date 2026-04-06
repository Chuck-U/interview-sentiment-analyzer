import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeAsrTextSeam,
  mergeConsecutiveAsrTexts,
} from "../guards/merge-asr-transcript-seams";

test("mergeAsrTextSeam joins without overlap", () => {
  assert.equal(
    mergeAsrTextSeam("hello there", "friend"),
    "hello there friend",
  );
});

test("mergeAsrTextSeam removes single-word suffix/prefix overlap", () => {
  assert.equal(
    mergeAsrTextSeam("hello world", "world today"),
    "hello world today",
  );
});

test("mergeAsrTextSeam removes multi-word overlap", () => {
  assert.equal(
    mergeAsrTextSeam("jump to the store", "the store and back"),
    "jump to the store and back",
  );
});

test("mergeAsrTextSeam compares words ignoring edge punctuation", () => {
  assert.equal(
    mergeAsrTextSeam("What happened?", "happened next was odd."),
    "What happened? next was odd.",
  );
});

test("mergeAsrTextSeam collapses full duplicate tail", () => {
  assert.equal(mergeAsrTextSeam("training", "training"), "training");
});

test("mergeConsecutiveAsrTexts folds ordered fragments", () => {
  assert.equal(
    mergeConsecutiveAsrTexts(["one two", "two three", "three four"]),
    "one two three four",
  );
});

test("mergeConsecutiveAsrTexts returns empty for empty input", () => {
  assert.equal(mergeConsecutiveAsrTexts([]), "");
});
