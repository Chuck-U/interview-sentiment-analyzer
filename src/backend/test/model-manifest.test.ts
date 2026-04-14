import assert from "node:assert/strict";
import { test } from "@jest/globals";

import {
  ANSWER_RELEVANCE_MODEL_CANDIDATE_IDS,
  ANSWER_RELEVANCE_MODEL_EVALUATIONS,
  ASR_MODEL_CANDIDATE_IDS,
  ASR_MODEL_EVALUATIONS,
  DEFAULT_ANSWER_RELEVANCE_MODEL_ID,
  DEFAULT_TRANSCRIPTION_MODEL_ID,
  MODEL_EVALUATION_MATRIX,
  MODEL_MANIFEST,
} from "../../shared/model-manifest";

test("ASR candidate evaluation covers moonshine, cohere, and ultravox", () => {
  assert.deepEqual(ASR_MODEL_CANDIDATE_IDS, [
    "onnx-community/moonshine-base-ONNX",
    "onnx-community/cohere-transcribe-03-2026-ONNX",
    "onnx-community/ultravox-v0_5-llama-3_2-1b-ONNX",
  ]);

  assert.equal(ASR_MODEL_EVALUATIONS.length, 3);
  assert.equal(MODEL_EVALUATION_MATRIX.length >= ASR_MODEL_EVALUATIONS.length, true);
});

test("default transcription model remains the manifest-ready candidate", () => {
  const defaultModel = ASR_MODEL_EVALUATIONS.find(
    (entry) => entry.id === DEFAULT_TRANSCRIPTION_MODEL_ID,
  );

  assert.ok(defaultModel);
  assert.equal(defaultModel.runtime, "pipeline");
  assert.equal(defaultModel.includedInManifest, true);
  assert.equal(defaultModel.evaluation.compatibility.rating, "strong");

  assert.ok(
    MODEL_MANIFEST.some((entry) => entry.id === DEFAULT_TRANSCRIPTION_MODEL_ID),
  );
});

test("cohere and ultravox stay out of the preload manifest for different reasons", () => {
  const cohere = ASR_MODEL_EVALUATIONS.find((entry) =>
    entry.id === "onnx-community/cohere-transcribe-03-2026-ONNX"
  );
  const ultravox = ASR_MODEL_EVALUATIONS.find((entry) =>
    entry.id === "onnx-community/ultravox-v0_5-llama-3_2-1b-ONNX"
  );

  assert.ok(cohere);
  assert.equal(cohere.includedInManifest, false);
  assert.match(cohere.evaluation.compatibility.summary, /timestamp/i);

  assert.ok(ultravox);
  assert.equal(ultravox.includedInManifest, false);
  assert.equal(ultravox.task, "audio-text-to-text");
  assert.equal(ultravox.runtime, "low-level-api");
  assert.equal(ultravox.evaluation.compatibility.rating, "weak");
});

test("answer relevance candidates prefer BGE small as the manifest-ready default", () => {
  assert.deepEqual(ANSWER_RELEVANCE_MODEL_CANDIDATE_IDS, [
    "Xenova/bge-small-en-v1.5",
    "Xenova/bge-base-en-v1.5",
    "Xenova/all-MiniLM-L6-v2",
    "Supabase/gte-small",
  ]);

  const defaultModel = ANSWER_RELEVANCE_MODEL_EVALUATIONS.find(
    (entry) => entry.id === DEFAULT_ANSWER_RELEVANCE_MODEL_ID,
  );

  assert.ok(defaultModel);
  assert.equal(defaultModel.task, "feature-extraction");
  assert.equal(defaultModel.runtime, "pipeline");
  assert.equal(defaultModel.includedInManifest, true);
  assert.equal(defaultModel.evaluation.compatibility.rating, "strong");
  assert.ok(
    MODEL_MANIFEST.some((entry) => entry.id === DEFAULT_ANSWER_RELEVANCE_MODEL_ID),
  );
  assert.equal(
    MODEL_EVALUATION_MATRIX.some((entry) => entry.id === DEFAULT_ANSWER_RELEVANCE_MODEL_ID),
    true,
  );
});
