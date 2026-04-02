import assert from "node:assert/strict";
import test from "node:test";

import { createTranscribeAudioIpcHandler } from "../interfaces/controllers/transcription-controller";

test("transcribeAudio IPC handler publishes detected question payloads", async () => {
  const published: unknown[] = [];
  const handler = createTranscribeAudioIpcHandler({
    getPipeline: async (modelId) => {
      if (modelId === "onnx-community/moonshine-base-ONNX") {
        return async () => ({
          text: "What was the biggest challenge in that project?",
          chunks: [],
        });
      }

      if (modelId === "onnx-community/distilbert-base-uncased-mnli-ONNX") {
        return async () => ({
          labels: [
            "a spoken interview question",
            "a spoken statement or answer",
          ],
          scores: [0.88, 0.12],
        });
      }

      throw new Error(`Unexpected model ${modelId}`);
    },
    publishQuestionDetected(payload) {
      published.push(payload);
    },
  });

  const result = await handler(undefined, {
    sessionId: "session-123",
    chunkId: "chunk-123",
    source: "desktop-capture",
    pcmSamples: [0, 0.1, 0.2],
  });

  assert.equal(result.text, "What was the biggest challenge in that project?");
  assert.equal(published.length, 1);
  assert.match(
    String((published[0] as { text?: string }).text),
    /biggest challenge/i,
  );
});

test("transcribeAudio IPC handler does not publish non-question transcripts", async () => {
  const published: unknown[] = [];
  const handler = createTranscribeAudioIpcHandler({
    getPipeline: async (modelId) => {
      if (modelId === "onnx-community/moonshine-base-ONNX") {
        return async () => ({
          text: "I worked on the migration with the platform team.",
          chunks: [],
        });
      }

      if (modelId === "onnx-community/distilbert-base-uncased-mnli-ONNX") {
        return async () => ({
          labels: [
            "a spoken interview question",
            "a spoken statement or answer",
          ],
          scores: [0.11, 0.89],
        });
      }

      throw new Error(`Unexpected model ${modelId}`);
    },
    publishQuestionDetected(payload) {
      published.push(payload);
    },
  });

  await handler(undefined, {
    sessionId: "session-123",
    chunkId: "chunk-123",
    source: "desktop-capture",
    pcmSamples: [0, 0.1, 0.2],
  });

  assert.equal(published.length, 0);
});

test("transcribeAudio rolls up short ASR snippets before question detection", async () => {
  const published: unknown[] = [];
  const asrQueue = ["tell us about", "a time you had to be creative"];
  let asrIndex = 0;

  const handler = createTranscribeAudioIpcHandler({
    getPipeline: async (modelId) => {
      if (modelId === "onnx-community/moonshine-base-ONNX") {
        return async () => {
          const text = asrQueue[asrIndex] ?? "";
          asrIndex += 1;
          return { text, chunks: [] };
        };
      }

      if (modelId === "onnx-community/distilbert-base-uncased-mnli-ONNX") {
        return async () => ({
          labels: [
            "a spoken interview question",
            "a spoken statement or answer",
          ],
          scores: [0.88, 0.12],
        });
      }

      throw new Error(`Unexpected model ${modelId}`);
    },
    publishQuestionDetected(payload) {
      published.push(payload);
    },
  });

  await handler(undefined, {
    sessionId: "session-roll",
    chunkId: "chunk-a",
    source: "desktop-capture",
    pcmSamples: [0, 0.1],
  });
  assert.equal(published.length, 0);

  await handler(undefined, {
    sessionId: "session-roll",
    chunkId: "chunk-b",
    source: "desktop-capture",
    pcmSamples: [0, 0.1],
  });
  assert.equal(published.length, 1);
  assert.match(
    String((published[0] as { text?: string }).text),
    /tell us about.*time you had to be creative/i,
  );
});

