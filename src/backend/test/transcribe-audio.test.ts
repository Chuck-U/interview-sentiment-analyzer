import assert from "node:assert/strict";
import test from "node:test";

import { createTranscribeAudioUseCase } from "../application/use-cases/transcribe-audio";

test("transcribeAudio returns text and segments from ASR pipeline", async () => {
  const sessionId = "sess-12345678";
  const chunkId = "chunk-abc";
  const source = "microphone";

  const pcm = new Float32Array([0, 0.1, 0.2]);

  const expectedText = "hello world";
  const expectedSegments = [
    { text: "chunk-1", timestamp: [0, 1.25] as [number, number] },
  ];

  const rawAsrOutput = {
    text: expectedText,
    chunks: expectedSegments,
  };

  const useCase = createTranscribeAudioUseCase({
    getPipeline: async (modelId) => {
      assert.equal(modelId, "onnx-community/moonshine-base-ONNX");
      return async () => rawAsrOutput;
    },
  });

  const result = await useCase({
    sessionId,
    chunkId,
    source,
    pcm,
  });

  assert.equal(result.text, expectedText);
  assert.equal(result.sessionId, sessionId);
  assert.equal(result.chunkId, chunkId);
  assert.equal(result.source, source);
  assert.ok(result.chunks);
  assert.equal(result.chunks!.length, 1);
});

test("transcribeAudio returns result without chunks when ASR produces empty chunks", async () => {
  const sessionId = "sess-12345678";
  const chunkId = "chunk-abc";
  const source = "microphone";

  const pcm = new Float32Array([0, 0.1, 0.2]);

  const expectedText = "hello world";
  const rawAsrOutput = { text: expectedText, chunks: [] as unknown[] };

  const useCase = createTranscribeAudioUseCase({
    getPipeline: async () => {
      return async () => rawAsrOutput;
    },
  });

  const result = await useCase({
    sessionId,
    chunkId,
    source,
    pcm,
  });

  assert.equal(result.text, expectedText);
  assert.equal(result.sessionId, sessionId);
  assert.equal(result.chunkId, chunkId);
  assert.ok(!result.chunks || result.chunks.length === 0);
});
