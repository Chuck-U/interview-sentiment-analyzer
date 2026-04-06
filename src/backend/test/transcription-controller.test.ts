import assert from "node:assert/strict";
import test from "node:test";

import {
  QUESTION_CLASSIFIER_LABELS,
} from "../application/use-cases/detect-live-question";
import { LiveQuestionMemory } from "../application/services/live-question-memory";
import {
  createTranscribeAudioIpcHandler,
  createLiveQuestionDetectionHook,
} from "../interfaces/controllers/transcription-controller";

const MN_LI_KEYS = Object.keys(QUESTION_CLASSIFIER_LABELS) as Array<
  keyof typeof QUESTION_CLASSIFIER_LABELS
>;
const MN_LI_LABEL_ORDER = MN_LI_KEYS.map((key) => QUESTION_CLASSIFIER_LABELS[key]);

function mnliMockRaw(
  scoresByKey: Partial<
    Record<keyof typeof QUESTION_CLASSIFIER_LABELS, number>
  >,
): { labels: string[]; scores: number[] } {
  const scores = MN_LI_KEYS.map((k) => scoresByKey[k] ?? 0);
  return { labels: [...MN_LI_LABEL_ORDER], scores };
}

function mockGetPipeline(
  asrFn: () => { text: string; chunks: unknown[] },
  mnliFn: () => unknown,
) {
  return async (modelId: string) => {
    if (modelId === "onnx-community/moonshine-base-ONNX") return async () => asrFn();
    if (modelId === "onnx-community/distilbert-base-uncased-mnli-ONNX") return async () => mnliFn();
    throw new Error(`Unexpected model ${modelId}`);
  };
}

test("transcribeAudio IPC handler publishes detected question payloads", async () => {
  const published: unknown[] = [];
  const appendedLogs: Array<{ source: string; text: string; sessionId: string }> = [];
  const getPipeline = mockGetPipeline(
    () => ({ text: "What was the biggest challenge in that project?", chunks: [] }),
    () => mnliMockRaw({ question: 0.88, nonQuestion: 0.12 }),
  );

  const handler = createTranscribeAudioIpcHandler({
    getPipeline,
    postTranscriptionHooks: [
      createLiveQuestionDetectionHook({
        getPipeline,
        async appendTranscriptLog(input) {
          appendedLogs.push({ sessionId: input.sessionId, source: input.source, text: input.text });
        },
        publishQuestionDetected(payload) {
          published.push(payload);
        },
      }),
    ],
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
  const getPipeline = mockGetPipeline(
    () => ({ text: "I worked on the migration with the platform team.", chunks: [] }),
    () => mnliMockRaw({ question: 0.11, nonQuestion: 0.89 }),
  );

  const handler = createTranscribeAudioIpcHandler({
    getPipeline,
    postTranscriptionHooks: [
      createLiveQuestionDetectionHook({
        getPipeline,
        publishQuestionDetected(payload) {
          published.push(payload);
        },
      }),
    ],
  });

  await handler(undefined, {
    sessionId: "session-123",
    chunkId: "chunk-123",
    source: "desktop-capture",
    pcmSamples: [0, 0.1, 0.2],
  });

  assert.equal(published.length, 0);
});

test("transcribeAudio IPC handler stores only published questions above the confidence threshold", async () => {
  const questionMemory = new LiveQuestionMemory();
  const published: unknown[] = [];
  const asrQueue = [
    "Can you describe the toughest production issue you owned?",
    "Can you describe the toughest production issue you owned?",
  ];
  const mnliQueue = [
    mnliMockRaw({ question: 0.7, nonQuestion: 0.8 }),
    mnliMockRaw({ question: 0.9, nonQuestion: 0.1 }),
  ];
  let asrIndex = 0;
  let mnliIndex = 0;

  const getPipeline = mockGetPipeline(
    () => {
      const text = asrQueue[asrIndex] ?? "";
      asrIndex += 1;
      return { text, chunks: [] };
    },
    () => {
      const raw = mnliQueue[mnliIndex];
      mnliIndex += 1;
      return raw;
    },
  );

  const handler = createTranscribeAudioIpcHandler({
    getPipeline,
    postTranscriptionHooks: [
      createLiveQuestionDetectionHook({
        getPipeline,
        minimumQuestionConfidence: 0.5,
        questionMemory,
        publishQuestionDetected(payload) {
          published.push(payload);
        },
      }),
    ],
  });

  await handler(undefined, {
    sessionId: "session-threshold",
    chunkId: "chunk-low",
    source: "desktop-capture",
    pcmSamples: [0, 0.1, 0.2],
  });

  assert.equal(published.length, 0);
  assert.equal(questionMemory.getLatestQuestion("session-threshold"), null);

  await handler(undefined, {
    sessionId: "session-threshold",
    chunkId: "chunk-high",
    source: "desktop-capture",
    pcmSamples: [0, 0.1, 0.2],
  });

  assert.equal(published.length, 1);
  assert.equal(
    questionMemory.getLatestQuestion("session-threshold"),
    published[0],
  );
});

test("transcribeAudio rolls up short ASR snippets before question detection", async () => {
  const published: unknown[] = [];
  const appendedLogs: Array<{ source: string; text: string; sessionId: string }> = [];
  const asrQueue = [
    "tell us about",
    "a time you had to be creative while leading a difficult migration",
  ];
  let asrIndex = 0;

  const getPipeline = mockGetPipeline(
    () => {
      const text = asrQueue[asrIndex] ?? "";
      asrIndex += 1;
      return { text, chunks: [] };
    },
    () => mnliMockRaw({ question: 0.88, nonQuestion: 0.12 }),
  );

  const handler = createTranscribeAudioIpcHandler({
    getPipeline,
    postTranscriptionHooks: [
      createLiveQuestionDetectionHook({
        getPipeline,
        async appendTranscriptLog(input) {
          appendedLogs.push({ sessionId: input.sessionId, source: input.source, text: input.text });
        },
        publishQuestionDetected(payload) {
          published.push(payload);
        },
      }),
    ],
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

test("transcribeAudio handler works without any hooks (microphone-only use case)", async () => {
  const getPipeline = mockGetPipeline(
    () => ({ text: "I built a distributed cache layer.", chunks: [] }),
    () => { throw new Error("classifier should not be called"); },
  );

  const handler = createTranscribeAudioIpcHandler({ getPipeline });

  const result = await handler(undefined, {
    sessionId: "session-mic",
    chunkId: "chunk-mic-1",
    source: "microphone",
    pcmSamples: [0, 0.05, -0.1],
  });

  assert.equal(result.text, "I built a distributed cache layer.");
  assert.equal(result.source, "microphone");
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
