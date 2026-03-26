import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  getSessionTranscriptRelativePath,
  type SessionTranscriptArtifactV1,
} from "../../shared/transcription";
import type { SessionStorageLayoutResolver } from "../application/ports/session-lifecycle";
import { createTranscribeAudioUseCase } from "../application/use-cases/transcribe-audio";

function createTestStorageLayoutResolver(
  appDataRoot: string,
): SessionStorageLayoutResolver {
  return {
    resolveSessionLayout(sessionId: string) {
      const sessionRoot = path.join(appDataRoot, "sessions", sessionId);
      return {
        appDataRoot,
        sessionRoot,
        chunksRoot: path.join(sessionRoot, "chunks"),
        recordingsRoot: path.join(sessionRoot, "recordings"),
        transcriptsRoot: path.join(sessionRoot, "transcripts"),
        summariesRoot: path.join(sessionRoot, "summaries"),
        tempRoot: path.join(sessionRoot, "temp"),
      };
    },
    normalizeRelativeArtifactPath() {
      throw new Error("not used in this test");
    },
    resolveAbsoluteArtifactPath() {
      throw new Error("not used in this test");
    },
  };
}

test("transcribeAudio persists transcript artifact with segments + legacy transcript", async () => {
  const sessionId = "sess-12345678";
  const chunkId = "chunk-abc";
  const source = "microphone";

  const storageLayoutResolver = createTestStorageLayoutResolver("appDataRoot");

  const pcm = new Float32Array([0, 0.1, 0.2]);

  const expectedText = "hello world";
  const expectedSegments = [
    { text: "chunk-1", timestamp: [0, 1.25] as [number, number] },
  ];

  const rawAsrOutput = {
    text: expectedText,
    chunks: expectedSegments,
  };

  let capturedPath: string | undefined;
  let capturedArtifact: SessionTranscriptArtifactV1 | undefined;
  let persistCallCount = 0;

  const useCase = createTranscribeAudioUseCase({
    getPipeline: async (modelId) => {
      assert.equal(modelId, "onnx-community/whisper-tiny.en");
      return async () => rawAsrOutput;
    },
    storageLayoutResolver,
    persistTranscriptToDisk: async (absolutePath, artifact) => {
      persistCallCount += 1;
      capturedPath = absolutePath;
      capturedArtifact = artifact;
    },
  });

  const result = await useCase({
    sessionId,
    chunkId,
    source,
    pcm,
  });

  assert.equal(result.text, expectedText);
  assert.equal(persistCallCount, 1);
  assert.ok(capturedPath);
  assert.ok(capturedArtifact);

  const expectedRelativePath = getSessionTranscriptRelativePath(chunkId);
  const expectedAbsolutePath = path.join(
    path.join("appDataRoot", "sessions", sessionId),
    expectedRelativePath,
  );
  assert.equal(capturedPath, expectedAbsolutePath);

  assert.equal(capturedArtifact?.text, expectedText);
  assert.ok(Object.prototype.hasOwnProperty.call(capturedArtifact, "segments"));
  assert.deepEqual(capturedArtifact?.segments, expectedSegments);

  assert.ok(Object.prototype.hasOwnProperty.call(capturedArtifact, "transcript"));
  assert.equal(capturedArtifact?.transcript, expectedText);
});

test("transcribeAudio persists transcript artifact without segments but with legacy transcript when chunks are empty", async () => {
  const sessionId = "sess-12345678";
  const chunkId = "chunk-abc";
  const source = "microphone";

  const storageLayoutResolver = createTestStorageLayoutResolver("appDataRoot");
  const pcm = new Float32Array([0, 0.1, 0.2]);

  const expectedText = "hello world";
  const rawAsrOutput = { text: expectedText, chunks: [] as unknown[] };

  let capturedArtifact: SessionTranscriptArtifactV1 | undefined;
  let capturedPath: string | undefined;

  const useCase = createTranscribeAudioUseCase({
    getPipeline: async () => {
      return async () => rawAsrOutput;
    },
    storageLayoutResolver,
    persistTranscriptToDisk: async (absolutePath, artifact) => {
      capturedPath = absolutePath;
      capturedArtifact = artifact;
    },
  });

  const result = await useCase({
    sessionId,
    chunkId,
    source,
    pcm,
  });

  assert.equal(result.text, expectedText);
  assert.ok(capturedPath);
  assert.ok(capturedArtifact);

  const expectedRelativePath = getSessionTranscriptRelativePath(chunkId);
  const expectedAbsolutePath = path.join(
    path.join("appDataRoot", "sessions", sessionId),
    expectedRelativePath,
  );
  assert.equal(capturedPath, expectedAbsolutePath);

  assert.equal(capturedArtifact?.text, expectedText);
  assert.ok(!Object.prototype.hasOwnProperty.call(capturedArtifact, "segments"));
  assert.ok(Object.prototype.hasOwnProperty.call(capturedArtifact, "transcript"));
  assert.equal(capturedArtifact?.transcript, expectedText);
});

