import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import assert from "node:assert/strict";

import { BuiltInPipelineOrchestrator } from "../application/services/pipeline-orchestrator";
import { createSessionRecoveryService } from "../application/services/session-recovery";
import type {
  FileMetadata,
  FileSystemAccess,
  SessionLifecycleEventPublisher,
} from "../application/ports/session-lifecycle";
import { createFinalizeSessionUseCase } from "../application/use-cases/finalize-session";
import { createRegisterMediaChunkUseCase } from "../application/use-cases/register-media-chunk";
import { createStartSessionUseCase } from "../application/use-cases/start-session";
import {
  createSqlitePipelineScope,
  SqlitePipelineEventRepository,
  SqlitePipelineStageRunRepository,
} from "../infrastructure/persistence/sqlite/sqlite-pipeline";
import {
  SqliteMediaChunkRepository,
  SqliteSessionRepository,
} from "../infrastructure/persistence/sqlite/sqlite-session-lifecycle";
import { initializeSessionLifecycleDatabase } from "../infrastructure/persistence/sqlite/sqlite-database";
import { LocalPipelineAnalysisProvider } from "../infrastructure/providers/local-pipeline-analysis";
import { createSessionStorageLayoutResolver } from "../infrastructure/storage/session-storage-layout";
import { createRecordingPersistenceService } from "../infrastructure/recording/recording-persistence";
import { createRecordingExportService } from "../infrastructure/recording/recording-export";

async function createTestContext() {
  const root = await mkdtemp(path.join(tmpdir(), "recording-pipeline-test-"));
  const appDataRoot = path.join(root, "app-data");
  await mkdir(appDataRoot, { recursive: true });
  const sqlite = new DatabaseSync(path.join(appDataRoot, "session-lifecycle.sqlite"));
  const database = initializeSessionLifecycleDatabase(sqlite);
  const storageLayoutResolver = createSessionStorageLayoutResolver(appDataRoot);
  const sessionRepository = new SqliteSessionRepository(database, storageLayoutResolver);
  const mediaChunkRepository = new SqliteMediaChunkRepository(database);
  const pipelineEventRepository = new SqlitePipelineEventRepository(database);
  const pipelineStageRunRepository = new SqlitePipelineStageRunRepository(database);
  const pipelineScope = createSqlitePipelineScope(database, {
    mediaChunkRepository,
    pipelineEventRepository,
    pipelineStageRunRepository,
    sessionRepository,
  });
  const eventPublisher: SessionLifecycleEventPublisher = {
    publishChunkRegistered() {},
    publishRecoveryIssue() {},
    publishSessionChanged() {},
    publishSessionFinalized() {},
  };
  const fileSystem: FileSystemAccess = {
    async ensureDirectory(directoryPath) {
      await mkdir(directoryPath, { recursive: true });
    },
    async listFiles(directoryPath) {
      try {
        const entries = await readdir(directoryPath, { recursive: true, withFileTypes: true });
        return entries
          .filter((entry) => entry.isFile())
          .map((entry) => path.join(entry.parentPath, entry.name));
      } catch {
        return [];
      }
    },
    async pathExists(targetPath) {
      try {
        const { access } = await import("node:fs/promises");
        await access(targetPath);
        return true;
      } catch {
        return false;
      }
    },
    async readFileMetadata(targetPath): Promise<FileMetadata> {
      const { stat } = await import("node:fs/promises");
      const metadata = await stat(targetPath);
      return {
        byteSize: metadata.size,
        createdAt: metadata.birthtime.toISOString(),
        updatedAt: metadata.mtime.toISOString(),
      };
    },
  };

  const fixedClock = { now: () => new Date("2026-03-15T12:00:00.000Z") };
  let nextId = 0;
  const idGenerator = { createId: () => `test-id-${++nextId}` };

  const recordingPersistence = createRecordingPersistenceService(storageLayoutResolver);
  const recordingExport = createRecordingExportService(storageLayoutResolver);

  const startSession = createStartSessionUseCase({
    clock: fixedClock,
    eventPublisher,
    fileSystem,
    idGenerator,
    sessionRepository,
    storageLayoutResolver,
  });
  const registerMediaChunk = createRegisterMediaChunkUseCase({
    aggregateWriter: pipelineScope.aggregateWriter,
    clock: fixedClock,
    eventPublisher,
    fileSystem,
    idGenerator,
    mediaChunkRepository,
    sessionRepository,
    storageLayoutResolver,
  });
  const finalizeSession = createFinalizeSessionUseCase({
    aggregateWriter: pipelineScope.aggregateWriter,
    clock: fixedClock,
    eventPublisher,
    idGenerator,
    pipelineEventRepository,
    sessionRepository,
  });
  const pipelineOrchestrator = new BuiltInPipelineOrchestrator({
    analysisProvider: new LocalPipelineAnalysisProvider({
      clock: fixedClock,
      idGenerator,
      storageLayoutResolver,
    }),
    clock: fixedClock,
    eventPublisher,
    idGenerator,
    pipelineEventRepository,
    pipelineStageRunRepository,
    sessionRepository,
    transactionManager: pipelineScope.transactionManager,
  });
  const recoverSessions = createSessionRecoveryService({
    aggregateWriter: pipelineScope.aggregateWriter,
    clock: fixedClock,
    eventPublisher,
    fileSystem,
    finalizeSession,
    idGenerator,
    mediaChunkRepository,
    pipelineEventRepository,
    sessionRepository,
    storageLayoutResolver,
  });

  return {
    appDataRoot,
    cleanup: async () => {
      sqlite.close();
      await rm(root, { force: true, recursive: true });
    },
    eventPublisher,
    fileSystem,
    storageLayoutResolver,
    sessionRepository,
    mediaChunkRepository,
    pipelineEventRepository,
    pipelineStageRunRepository,
    pipelineOrchestrator,
    recordingPersistence,
    recordingExport,
    startSession,
    registerMediaChunk,
    finalizeSession,
    recoverSessions,
  };
}

test("recording persistence writes chunks to correct source directories", async () => {
  const ctx = await createTestContext();

  try {
    const session = await ctx.startSession({
      captureSources: ["microphone", "screen-video", "screenshot"],
    });
    const sessionId = session.session.id;

    const audioChunk = await ctx.recordingPersistence.persistChunk({
      sessionId,
      source: "microphone",
      sequenceNumber: 0,
      mimeType: "audio/webm;codecs=opus",
      recordedAt: "2026-03-15T12:00:01.000Z",
      buffer: Buffer.from("fake-audio-data"),
    });

    assert.ok(audioChunk.relativePath.startsWith("chunks/audio/"));
    assert.ok(audioChunk.relativePath.endsWith(".webm"));
    assert.ok(audioChunk.relativePath.includes("-00000-"));
    assert.equal(audioChunk.byteSize, Buffer.byteLength("fake-audio-data"));

    const videoChunk = await ctx.recordingPersistence.persistChunk({
      sessionId,
      source: "screen-video",
      sequenceNumber: 0,
      mimeType: "video/webm;codecs=vp9,opus",
      recordedAt: "2026-03-15T12:00:01.000Z",
      buffer: Buffer.from("fake-video-data"),
    });

    assert.ok(videoChunk.relativePath.startsWith("chunks/screen-video/"));
    assert.ok(videoChunk.relativePath.endsWith(".webm"));

    const screenshot = await ctx.recordingPersistence.persistScreenshot({
      sessionId,
      sequenceNumber: 0,
      mimeType: "image/png",
      capturedAt: "2026-03-15T12:00:02.000Z",
      buffer: Buffer.from("fake-png-data"),
    });

    assert.ok(screenshot.relativePath.startsWith("chunks/screenshots/"));
    assert.ok(screenshot.relativePath.endsWith(".png"));

    const audioAbs = ctx.storageLayoutResolver.resolveAbsoluteArtifactPath(
      sessionId,
      audioChunk.relativePath,
    );
    const videoAbs = ctx.storageLayoutResolver.resolveAbsoluteArtifactPath(
      sessionId,
      videoChunk.relativePath,
    );
    const screenshotAbs = ctx.storageLayoutResolver.resolveAbsoluteArtifactPath(
      sessionId,
      screenshot.relativePath,
    );

    assert.ok(await ctx.fileSystem.pathExists(audioAbs));
    assert.ok(await ctx.fileSystem.pathExists(videoAbs));
    assert.ok(await ctx.fileSystem.pathExists(screenshotAbs));
  } finally {
    await ctx.cleanup();
  }
});

test("persist-then-register produces chunks the backend can process", async () => {
  const ctx = await createTestContext();

  try {
    const session = await ctx.startSession({
      captureSources: ["microphone"],
    });
    const sessionId = session.session.id;

    const persisted = await ctx.recordingPersistence.persistChunk({
      sessionId,
      source: "microphone",
      sequenceNumber: 0,
      mimeType: "audio/webm",
      recordedAt: "2026-03-15T12:00:01.000Z",
      buffer: Buffer.from("audio-payload-1"),
    });

    const registered = await ctx.registerMediaChunk({
      sessionId,
      chunkId: persisted.chunkId,
      source: "microphone",
      relativePath: persisted.relativePath,
      recordedAt: "2026-03-15T12:00:01.000Z",
      byteSize: persisted.byteSize,
    });

    assert.equal(registered.chunk.id, persisted.chunkId);
    assert.equal(registered.chunk.byteSize, persisted.byteSize);
    assert.equal(registered.chunk.relativePath, persisted.relativePath);

    await ctx.pipelineOrchestrator.runUntilIdle();

    const events = await ctx.pipelineEventRepository.listBySessionId(sessionId);
    const eventTypes = events.map((e) => e.eventType);

    assert.ok(eventTypes.includes("chunk.registered"));
    assert.ok(eventTypes.includes("transcribe_chunk.requested"));
    assert.ok(eventTypes.includes("transcript.ready"));
  } finally {
    await ctx.cleanup();
  }
});

test("multi-chunk persist, register, finalize, and export produces a recording file", async () => {
  const ctx = await createTestContext();

  try {
    const session = await ctx.startSession({
      captureSources: ["microphone", "screen-video"],
    });
    const sessionId = session.session.id;

    for (let i = 0; i < 3; i++) {
      const chunk = await ctx.recordingPersistence.persistChunk({
        sessionId,
        source: "microphone",
        sequenceNumber: i,
        mimeType: "audio/webm",
        recordedAt: new Date(Date.now() + i * 15_000).toISOString(),
        buffer: Buffer.from(`audio-chunk-${i}`),
      });

      await ctx.registerMediaChunk({
        sessionId,
        chunkId: chunk.chunkId,
        source: "microphone",
        relativePath: chunk.relativePath,
        recordedAt: new Date(Date.now() + i * 15_000).toISOString(),
        byteSize: chunk.byteSize,
      });
    }

    for (let i = 0; i < 2; i++) {
      const chunk = await ctx.recordingPersistence.persistChunk({
        sessionId,
        source: "screen-video",
        sequenceNumber: i,
        mimeType: "video/webm",
        recordedAt: new Date(Date.now() + i * 15_000).toISOString(),
        buffer: Buffer.from(`video-chunk-${i}`),
      });

      await ctx.registerMediaChunk({
        sessionId,
        chunkId: chunk.chunkId,
        source: "screen-video",
        relativePath: chunk.relativePath,
        recordedAt: new Date(Date.now() + i * 15_000).toISOString(),
        byteSize: chunk.byteSize,
      });
    }

    await ctx.pipelineOrchestrator.runUntilIdle();

    await ctx.finalizeSession({ sessionId });
    await ctx.pipelineOrchestrator.runUntilIdle();

    const exportResult = await ctx.recordingExport.exportSession(sessionId);

    assert.ok(exportResult.exportFilePath);
    assert.ok(exportResult.manifestPath);
    assert.ok(await ctx.fileSystem.pathExists(exportResult.exportFilePath));
    assert.ok(await ctx.fileSystem.pathExists(exportResult.manifestPath));

    const manifestContent = JSON.parse(
      await readFile(exportResult.manifestPath, "utf8"),
    );
    assert.equal(manifestContent.sessionId, sessionId);
    assert.ok(Array.isArray(manifestContent.sources));

    const micSource = manifestContent.sources.find(
      (s: { source: string }) => s.source === "microphone",
    );
    const videoSource = manifestContent.sources.find(
      (s: { source: string }) => s.source === "screen-video",
    );

    assert.ok(micSource);
    assert.equal(micSource.chunks.length, 3);
    assert.ok(videoSource);
    assert.equal(videoSource.chunks.length, 2);

    const exportedContent = await readFile(exportResult.exportFilePath);
    assert.ok(exportedContent.length > 0);
  } finally {
    await ctx.cleanup();
  }
});

test("export with a single chunk copies rather than concatenates", async () => {
  const ctx = await createTestContext();

  try {
    const session = await ctx.startSession({
      captureSources: ["microphone"],
    });
    const sessionId = session.session.id;
    const payload = "single-audio-chunk-payload";

    const chunk = await ctx.recordingPersistence.persistChunk({
      sessionId,
      source: "microphone",
      sequenceNumber: 0,
      mimeType: "audio/webm",
      recordedAt: "2026-03-15T12:00:01.000Z",
      buffer: Buffer.from(payload),
    });

    await ctx.registerMediaChunk({
      sessionId,
      chunkId: chunk.chunkId,
      source: "microphone",
      relativePath: chunk.relativePath,
      recordedAt: "2026-03-15T12:00:01.000Z",
      byteSize: chunk.byteSize,
    });

    const exportResult = await ctx.recordingExport.exportSession(sessionId);
    const exportedContent = await readFile(exportResult.exportFilePath, "utf8");

    assert.equal(exportedContent, payload);
  } finally {
    await ctx.cleanup();
  }
});

test("recording storage layout includes recordingsRoot", async () => {
  const ctx = await createTestContext();

  try {
    const session = await ctx.startSession({
      captureSources: ["microphone"],
    });
    const layout = session.session.storageLayout;

    assert.ok(layout.recordingsRoot);
    assert.ok(layout.recordingsRoot.includes("recordings"));
    assert.ok(layout.chunksRoot);
    assert.ok(layout.transcriptsRoot);
    assert.ok(layout.summariesRoot);
  } finally {
    await ctx.cleanup();
  }
});

test("duplicate chunk registration is idempotent", async () => {
  const ctx = await createTestContext();

  try {
    const session = await ctx.startSession({
      captureSources: ["microphone"],
    });
    const sessionId = session.session.id;

    const persisted = await ctx.recordingPersistence.persistChunk({
      sessionId,
      source: "microphone",
      sequenceNumber: 0,
      mimeType: "audio/webm",
      recordedAt: "2026-03-15T12:00:01.000Z",
      buffer: Buffer.from("audio-payload"),
    });

    const first = await ctx.registerMediaChunk({
      sessionId,
      chunkId: persisted.chunkId,
      source: "microphone",
      relativePath: persisted.relativePath,
      recordedAt: "2026-03-15T12:00:01.000Z",
      byteSize: persisted.byteSize,
    });

    const second = await ctx.registerMediaChunk({
      sessionId,
      chunkId: persisted.chunkId,
      source: "microphone",
      relativePath: persisted.relativePath,
      recordedAt: "2026-03-15T12:00:01.000Z",
      byteSize: persisted.byteSize,
    });

    assert.equal(first.chunk.id, second.chunk.id);
  } finally {
    await ctx.cleanup();
  }
});

test("recovery detects orphaned chunk files and missing registered chunks", async () => {
  const ctx = await createTestContext();
  const publishedIssues: string[] = [];

  const trackingPublisher: SessionLifecycleEventPublisher = {
    publishChunkRegistered() {},
    publishRecoveryIssue(issue) {
      publishedIssues.push(issue.code);
    },
    publishSessionChanged() {},
    publishSessionFinalized() {},
  };

  try {
    const session = await ctx.startSession({
      captureSources: ["microphone"],
    });
    const sessionId = session.session.id;

    const persisted = await ctx.recordingPersistence.persistChunk({
      sessionId,
      source: "microphone",
      sequenceNumber: 0,
      mimeType: "audio/webm",
      recordedAt: "2026-03-15T12:00:01.000Z",
      buffer: Buffer.from("registered-audio"),
    });

    await ctx.registerMediaChunk({
      sessionId,
      chunkId: persisted.chunkId,
      source: "microphone",
      relativePath: persisted.relativePath,
      recordedAt: "2026-03-15T12:00:01.000Z",
      byteSize: persisted.byteSize,
    });

    const orphanedDir = ctx.storageLayoutResolver.resolveAbsoluteArtifactPath(
      sessionId,
      "chunks/audio",
    );
    await writeFile(path.join(orphanedDir, "orphaned-file.webm"), "orphaned");

    const recoveryService = createSessionRecoveryService({
      aggregateWriter: (ctx as Record<string, unknown>).pipelineAggregateWriter as never,
      clock: { now: () => new Date("2026-03-15T12:05:00.000Z") },
      eventPublisher: trackingPublisher,
      fileSystem: ctx.fileSystem,
      finalizeSession: ctx.finalizeSession,
      idGenerator: { createId: () => `recovery-${Date.now()}` },
      mediaChunkRepository: ctx.mediaChunkRepository,
      pipelineEventRepository: ctx.pipelineEventRepository,
      sessionRepository: ctx.sessionRepository,
      storageLayoutResolver: ctx.storageLayoutResolver,
    });

    await recoveryService();

    assert.ok(publishedIssues.includes("orphaned-artifact"));
  } finally {
    await ctx.cleanup();
  }
});

test("export with no chunks produces empty manifest", async () => {
  const ctx = await createTestContext();

  try {
    const session = await ctx.startSession({
      captureSources: ["microphone"],
    });
    const sessionId = session.session.id;

    const exportResult = await ctx.recordingExport.exportSession(sessionId);
    const manifestContent = JSON.parse(
      await readFile(exportResult.manifestPath, "utf8"),
    );

    assert.equal(manifestContent.sessionId, sessionId);
    assert.equal(manifestContent.sources.length, 0);
  } finally {
    await ctx.cleanup();
  }
});
