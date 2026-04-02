import assert from "node:assert/strict";
import test from "node:test";

import { createTranscribeAudioIpcHandler } from "../interfaces/controllers/transcription-controller";

test("transcribeAudio IPC handler publishes detected question payloads", async () => {
  const published: unknown[] = [];
  const appendedLogs: Array<{ source: string; text: string; sessionId: string }> = [];
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
    async appendTranscriptLog(input) {
      appendedLogs.push({
        sessionId: input.sessionId,
        source: input.source,
        text: input.text,
      });
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
  assert.deepEqual(appendedLogs, [
    {
      sessionId: "session-123",
      source: "desktop-capture",
      text: "What was the biggest challenge in that project?",
    },
  ]);
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
  const appendedLogs: Array<{ source: string; text: string; sessionId: string }> = [];
  const asrQueue = [
    "tell us about",
    "a time you had to be creative while leading a difficult migration",
  ];
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
    async appendTranscriptLog(input) {
      appendedLogs.push({
        sessionId: input.sessionId,
        source: input.source,
        text: input.text,
      });
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
  assert.deepEqual(appendedLogs, [
    {
      sessionId: "session-roll",
      source: "desktop-capture",
      text:
        "tell us about a time you had to be creative while leading a difficult migration",
    },
  ]);
  assert.match(
    String((published[0] as { text?: string }).text),
    /tell us about.*time you had to be creative/i,
  );
});

test("transcript log append utility maps sources to readable speaker labels", async () => {
  const { mkdtemp, readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { appendSessionTranscriptLog } = await import(
    "../infrastructure/storage/session-transcript-log"
  );
  const { createSessionStorageLayoutResolver } = await import(
    "../infrastructure/storage/session-storage-layout"
  );

  const appDataRoot = await mkdtemp(path.join(tmpdir(), "session-transcript-log-"));
  const storageLayoutResolver = createSessionStorageLayoutResolver(appDataRoot);

  try {
    await appendSessionTranscriptLog({
      storageLayoutResolver,
      sessionId: "session-log",
      source: "desktop-capture",
      text: " Tell me about yourself. ",
      timestamp: "2026-04-02T12:00:00.000Z",
    });
    await appendSessionTranscriptLog({
      storageLayoutResolver,
      sessionId: "session-log",
      source: "microphone",
      text: " I built a compiler. ",
      timestamp: "2026-04-02T12:00:05.000Z",
    });

    const logPath = path.join(appDataRoot, "sessions", "session-log", "transcrpt.log");
    const content = await readFile(logPath, "utf8");

    assert.equal(
      content,
      "2026-04-02T12:00:00.000Z\tinterviewer\tTell me about yourself.\n"
        + "2026-04-02T12:00:05.000Z\tyou\tI built a compiler.\n",
    );
  } finally {
    const { rm } = await import("node:fs/promises");
    await rm(appDataRoot, { recursive: true, force: true });
  }
});

