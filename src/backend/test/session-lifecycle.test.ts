import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import assert from "node:assert/strict";

import { BuiltInPipelineOrchestrator } from "../application/services/pipeline-orchestrator";
import type { SessionLifecycleDatabase } from "../infrastructure/persistence/sqlite/sqlite-database";
import { createSessionRecoveryService } from "../application/services/session-recovery";
import type {
  FileMetadata,
  FileSystemAccess,
  SessionLifecycleEventPublisher,
} from "../application/ports/session-lifecycle";
import { createFinalizeSessionUseCase } from "../application/use-cases/finalize-session";
import { createRegisterMediaChunkUseCase } from "../application/use-cases/register-media-chunk";
import { createStartSessionUseCase } from "../application/use-cases/start-session";
import { createMediaChunkEntity } from "../domain/capture/media-chunk";
import { beginSessionFinalization, createSessionEntity } from "../domain/session/session";
import {
  createSqlitePipelineScope,
  SqlitePipelineEventRepository,
  SqlitePipelineStageRunRepository,
} from "../infrastructure/persistence/sqlite/sqlite-pipeline";
import {
  SqliteParticipantBaselineRepository,
  SqliteParticipantPresenceRepository,
  SqliteParticipantRepository,
  SqliteQuestionAnnotationRepository,
} from "../infrastructure/persistence/sqlite/sqlite-participant-modeling";
import {
  SqliteMediaChunkRepository,
  SqliteSessionRepository,
} from "../infrastructure/persistence/sqlite/sqlite-session-lifecycle";
import {
  initializeSessionLifecycleDatabase,
  SESSION_LIFECYCLE_SCHEMA_VERSION,
} from "../infrastructure/persistence/sqlite/sqlite-database";
import { GoogleHostedAnalysisAdapter } from "../infrastructure/providers/google/google-hosted-analysis-adapter";
import { StaticHostedAnalysisStageRouter } from "../infrastructure/providers/hosted-analysis-stage-router";
import { LocalPipelineAnalysisProvider } from "../infrastructure/providers/local-pipeline-analysis";
import { OpenAIHostedAnalysisAdapter } from "../infrastructure/providers/openai/openai-hosted-analysis-adapter";
import { createSessionStorageLayoutResolver } from "../infrastructure/storage/session-storage-layout";
import type { PipelineEventEnvelope } from "../../shared";

type TestContext = {
  readonly appDataRoot: string;
  readonly cleanup: () => Promise<void>;
  readonly database: SessionLifecycleDatabase;
  readonly eventPublisher: SessionLifecycleEventPublisher;
  readonly fileSystem: FileSystemAccess;
  readonly mediaChunkRepository: SqliteMediaChunkRepository;
  readonly participantBaselineRepository: SqliteParticipantBaselineRepository;
  readonly participantPresenceRepository: SqliteParticipantPresenceRepository;
  readonly participantRepository: SqliteParticipantRepository;
  readonly pipelineAggregateWriter: ReturnType<
    typeof createSqlitePipelineScope
  >["aggregateWriter"];
  readonly pipelineEventRepository: SqlitePipelineEventRepository;
  readonly pipelineStageRunRepository: SqlitePipelineStageRunRepository;
  readonly pipelineTransactionManager: ReturnType<
    typeof createSqlitePipelineScope
  >["transactionManager"];
  readonly questionAnnotationRepository: SqliteQuestionAnnotationRepository;
  readonly sqlite: DatabaseSync;
  readonly sessionRepository: SqliteSessionRepository;
  readonly storageLayoutResolver: ReturnType<typeof createSessionStorageLayoutResolver>;
};

async function createTestContext(): Promise<TestContext> {
  const root = await mkdtemp(path.join(tmpdir(), "interview-sentiment-analyzer-"));
  const appDataRoot = path.join(root, "app-data");
  await mkdir(appDataRoot, { recursive: true });
  const sqlite = new DatabaseSync(path.join(appDataRoot, "session-lifecycle.sqlite"));
  const database = initializeSessionLifecycleDatabase(sqlite);
  const storageLayoutResolver = createSessionStorageLayoutResolver(appDataRoot);
  const sessionRepository = new SqliteSessionRepository(
    database,
    storageLayoutResolver,
  );
  const mediaChunkRepository = new SqliteMediaChunkRepository(database);
  const participantRepository = new SqliteParticipantRepository(database);
  const participantPresenceRepository = new SqliteParticipantPresenceRepository(
    database,
  );
  const questionAnnotationRepository = new SqliteQuestionAnnotationRepository(
    database,
  );
  const participantBaselineRepository = new SqliteParticipantBaselineRepository(
    database,
  );
  const pipelineEventRepository = new SqlitePipelineEventRepository(database);
  const pipelineStageRunRepository = new SqlitePipelineStageRunRepository(
    database,
  );
  const pipelineScope = createSqlitePipelineScope(database, {
    mediaChunkRepository,
    participantBaselineRepository,
    participantPresenceRepository,
    participantRepository,
    pipelineEventRepository,
    pipelineStageRunRepository,
    questionAnnotationRepository,
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
        const entries = await import("node:fs/promises").then(({ readdir }) =>
          readdir(directoryPath, { recursive: true, withFileTypes: true }),
        );
        return entries
          .filter((entry) => entry.isFile())
          .map((entry) => path.join(entry.parentPath, entry.name));
      } catch {
        return [];
      }
    },
    async pathExists(targetPath) {
      try {
        await import("node:fs/promises").then(({ access }) => access(targetPath));
        return true;
      } catch {
        return false;
      }
    },
    async readFileMetadata(targetPath): Promise<FileMetadata> {
      const metadata = await import("node:fs/promises").then(({ stat }) =>
        stat(targetPath),
      );

      return {
        byteSize: metadata.size,
        createdAt: metadata.birthtime.toISOString(),
        updatedAt: metadata.mtime.toISOString(),
      };
    },
  };

  return {
    appDataRoot,
    cleanup: async () => {
      sqlite.close();
      await rm(root, { force: true, recursive: true });
    },
    database,
    eventPublisher,
    fileSystem,
    mediaChunkRepository,
    participantBaselineRepository,
    participantPresenceRepository,
    participantRepository,
    pipelineAggregateWriter: pipelineScope.aggregateWriter,
    pipelineEventRepository,
    pipelineStageRunRepository,
    pipelineTransactionManager: pipelineScope.transactionManager,
    questionAnnotationRepository,
    sqlite,
    sessionRepository,
    storageLayoutResolver,
  };
}

const fixedClock = {
  now() {
    return new Date("2026-03-10T12:00:00.000Z");
  },
};

function createFixedIdGenerator() {
  let nextId = 0;

  return {
    createId() {
      nextId += 1;

      return nextId === 1 ? "generated-session-id" : `generated-id-${nextId}`;
    },
  };
}

function createHostedStageRouter() {
  return new StaticHostedAnalysisStageRouter({
    defaultAdapter: new OpenAIHostedAnalysisAdapter(),
    stageAdapters: {
      "condense_context.requested": new GoogleHostedAnalysisAdapter(),
    },
  });
}

test("database bootstrap adopts the legacy schema into versioned migrations", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "interview-sentiment-analyzer-"));
  const appDataRoot = path.join(root, "app-data");
  const databasePath = path.join(appDataRoot, "session-lifecycle.sqlite");

  await mkdir(appDataRoot, { recursive: true });

  const sqlite = new DatabaseSync(databasePath);

  try {
    sqlite.exec(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        capture_sources_json TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        idempotency_key TEXT UNIQUE
      );

      CREATE TABLE media_chunk (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE
      );
    `);
    sqlite
      .prepare(`
        INSERT INTO session (
          id,
          status,
          capture_sources_json,
          started_at,
          updated_at,
          completed_at,
          idempotency_key
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        "legacy-session",
        "active",
        JSON.stringify(["microphone"]),
        "2026-03-10T12:00:00.000Z",
        "2026-03-10T12:00:00.000Z",
        null,
        "legacy-idempotency-key",
      );
    sqlite
      .prepare(`
        INSERT INTO media_chunk (
          id,
          session_id,
          source,
          status,
          relative_path,
          recorded_at,
          byte_size,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        "legacy-chunk",
        "legacy-session",
        "microphone",
        "registered",
        "chunks/audio/legacy.wav",
        "2026-03-10T12:00:01.000Z",
        256,
        "2026-03-10T12:00:02.000Z",
        "2026-03-10T12:00:02.000Z",
      );
    sqlite.close();

    const reopenedSqlite = new DatabaseSync(databasePath);

    try {
      const database = initializeSessionLifecycleDatabase(reopenedSqlite);
      const storageLayoutResolver = createSessionStorageLayoutResolver(appDataRoot);
      const sessionRepository = new SqliteSessionRepository(
        database,
        storageLayoutResolver,
      );
      const mediaChunkRepository = new SqliteMediaChunkRepository(database);
      const migrationVersion = reopenedSqlite
        .prepare(
          "SELECT MAX(version) AS version FROM __session_lifecycle_migrations",
        )
        .get() as { version: number } | undefined;
      const hydratedSession =
        await sessionRepository.findById("legacy-session");
      const hydratedChunk = await mediaChunkRepository.findById("legacy-chunk");

      assert.equal(migrationVersion?.version, SESSION_LIFECYCLE_SCHEMA_VERSION);
      assert.equal(hydratedSession?.id, "legacy-session");
      assert.equal(hydratedChunk?.id, "legacy-chunk");
    } finally {
      reopenedSqlite.close();
    }
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("database bootstrap preserves persisted metadata across restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "interview-sentiment-analyzer-"));
  const appDataRoot = path.join(root, "app-data");
  const databasePath = path.join(appDataRoot, "session-lifecycle.sqlite");

  await mkdir(appDataRoot, { recursive: true });

  const initialSqlite = new DatabaseSync(databasePath);

  try {
    const initialDatabase = initializeSessionLifecycleDatabase(initialSqlite);
    const storageLayoutResolver = createSessionStorageLayoutResolver(appDataRoot);
    const sessionRepository = new SqliteSessionRepository(
      initialDatabase,
      storageLayoutResolver,
    );
    const mediaChunkRepository = new SqliteMediaChunkRepository(initialDatabase);
    const storageLayout = storageLayoutResolver.resolveSessionLayout("session-restart");

    await sessionRepository.save(
      createSessionEntity({
        id: "session-restart",
        captureSources: ["microphone"],
        startedAt: "2026-03-10T12:00:00.000Z",
        updatedAt: "2026-03-10T12:00:00.000Z",
        storageLayout,
      }),
    );
    await mediaChunkRepository.save(
      createMediaChunkEntity({
        id: "chunk-restart",
        sessionId: "session-restart",
        source: "microphone",
        relativePath: "chunks/audio/chunk-restart.wav",
        recordedAt: "2026-03-10T12:00:01.000Z",
        byteSize: 128,
        createdAt: "2026-03-10T12:00:02.000Z",
      }),
    );
  } finally {
    initialSqlite.close();
  }

  const restartedSqlite = new DatabaseSync(databasePath);

  try {
    const restartedDatabase = initializeSessionLifecycleDatabase(restartedSqlite);
    const storageLayoutResolver = createSessionStorageLayoutResolver(appDataRoot);
    const sessionRepository = new SqliteSessionRepository(
      restartedDatabase,
      storageLayoutResolver,
    );
    const mediaChunkRepository = new SqliteMediaChunkRepository(restartedDatabase);
    const restartedSession =
      await sessionRepository.findById("session-restart");
    const restartedChunk = await mediaChunkRepository.findById("chunk-restart");

    assert.equal(restartedSession?.id, "session-restart");
    assert.equal(restartedChunk?.id, "chunk-restart");
  } finally {
    restartedSqlite.close();
    await rm(root, { force: true, recursive: true });
  }
});

test("sqlite repositories preserve session and chunk mappings", async () => {
  const context = await createTestContext();

  try {
    const storageLayout = context.storageLayoutResolver.resolveSessionLayout("session-1");
    const session = createSessionEntity({
      id: "session-1",
      captureSources: ["microphone", "screen-video"],
      startedAt: "2026-03-10T12:00:00.000Z",
      updatedAt: "2026-03-10T12:00:00.000Z",
      storageLayout,
      idempotencyKey: "idem-1",
    });

    await context.sessionRepository.save(session);

    const chunk = createMediaChunkEntity({
      id: "chunk-1",
      sessionId: session.id,
      source: "microphone",
      relativePath: "chunks/audio/chunk-1.wav",
      recordedAt: "2026-03-10T12:00:01.000Z",
      byteSize: 128,
      createdAt: "2026-03-10T12:00:02.000Z",
    });

    await context.mediaChunkRepository.save(chunk);

    const hydratedSession = await context.sessionRepository.findById("session-1");
    const hydratedSessionByIdempotency =
      await context.sessionRepository.findByIdempotencyKey("idem-1");
    const activeSessions = await context.sessionRepository.listByStatuses([
      "active",
    ]);
    const hydratedChunk = await context.mediaChunkRepository.findById("chunk-1");
    const sessionChunks = await context.mediaChunkRepository.listBySessionId(
      "session-1",
    );
    const registeredChunks = await context.mediaChunkRepository.listByStatuses([
      "registered",
    ]);

    assert.ok(hydratedSession);
    assert.equal(hydratedSession.id, session.id);
    assert.equal(hydratedSession.status, session.status);
    assert.deepEqual(hydratedSession.captureSources, session.captureSources);
    assert.deepEqual(hydratedSession.storageLayout, session.storageLayout);
    assert.ok(hydratedSessionByIdempotency);
    assert.equal(hydratedSessionByIdempotency.id, session.id);
    assert.equal(activeSessions.length, 1);
    assert.equal(activeSessions[0]?.id, session.id);
    assert.deepEqual(hydratedChunk, chunk);
    assert.deepEqual(sessionChunks, [chunk]);
    assert.deepEqual(registeredChunks, [chunk]);
  } finally {
    await context.cleanup();
  }
});

test("session lifecycle use cases enforce idempotency and file-first registration", async () => {
  const context = await createTestContext();
  const idGenerator = createFixedIdGenerator();

  try {
    const startSession = createStartSessionUseCase({
      clock: fixedClock,
      eventPublisher: context.eventPublisher,
      fileSystem: context.fileSystem,
      idGenerator,
      sessionRepository: context.sessionRepository,
      storageLayoutResolver: context.storageLayoutResolver,
    });
    const registerMediaChunk = createRegisterMediaChunkUseCase({
      aggregateWriter: context.pipelineAggregateWriter,
      clock: fixedClock,
      eventPublisher: context.eventPublisher,
      fileSystem: context.fileSystem,
      idGenerator,
      mediaChunkRepository: context.mediaChunkRepository,
      sessionRepository: context.sessionRepository,
      storageLayoutResolver: context.storageLayoutResolver,
    });
    const finalizeSession = createFinalizeSessionUseCase({
      aggregateWriter: context.pipelineAggregateWriter,
      clock: fixedClock,
      eventPublisher: context.eventPublisher,
      idGenerator,
      pipelineEventRepository: context.pipelineEventRepository,
      sessionRepository: context.sessionRepository,
    });
    const pipelineOrchestrator = new BuiltInPipelineOrchestrator({
      analysisProvider: new LocalPipelineAnalysisProvider({
        clock: fixedClock,
        hostedStageRouter: createHostedStageRouter(),
        idGenerator,
        storageLayoutResolver: context.storageLayoutResolver,
      }),
      clock: fixedClock,
      eventPublisher: context.eventPublisher,
      idGenerator,
      pipelineEventRepository: context.pipelineEventRepository,
      pipelineStageRunRepository: context.pipelineStageRunRepository,
      sessionRepository: context.sessionRepository,
      transactionManager: context.pipelineTransactionManager,
    });

    const startedSession = await startSession({
      captureSources: ["microphone"],
      idempotencyKey: "idem-2",
    });
    const replayedSession = await startSession({
      captureSources: ["microphone"],
      idempotencyKey: "idem-2",
    });

    assert.equal(startedSession.session.id, "generated-session-id");
    assert.equal(replayedSession.session.id, startedSession.session.id);

    await assert.rejects(
      registerMediaChunk({
        sessionId: startedSession.session.id,
        chunkId: "missing-chunk",
        source: "microphone",
        relativePath: "chunks/audio/missing.wav",
        recordedAt: "2026-03-10T12:00:05.000Z",
        byteSize: 1,
      }),
      /before the artifact exists on disk/,
    );

    const artifactPath = context.storageLayoutResolver.resolveAbsoluteArtifactPath(
      startedSession.session.id,
      "chunks/audio/chunk-1.wav",
    );
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, "audio-payload");

    const registeredChunk = await registerMediaChunk({
      sessionId: startedSession.session.id,
      chunkId: "chunk-1",
      source: "microphone",
      relativePath: "chunks/audio/chunk-1.wav",
      recordedAt: "2026-03-10T12:00:05.000Z",
      byteSize: 1,
    });

    assert.equal(registeredChunk.chunk.byteSize, Buffer.byteLength("audio-payload"));
    await pipelineOrchestrator.runUntilIdle();

    const finalizedSession = await finalizeSession({
      sessionId: startedSession.session.id,
    });
    const replayedFinalization = await finalizeSession({
      sessionId: startedSession.session.id,
    });

    assert.equal(finalizedSession.session.status, "finalizing");
    assert.equal(replayedFinalization.session.status, "finalizing");

    await pipelineOrchestrator.runUntilIdle();

    const completedSession = await context.sessionRepository.findById(
      startedSession.session.id,
    );
    const persistedEvents = await context.pipelineEventRepository.listBySessionId(
      startedSession.session.id,
    );
    const persistedEventTypes = persistedEvents.map((event) => event.eventType);
    const chunkAnalysisReadyEvent = persistedEvents.find(
      (event) => event.eventType === "chunk.analysis.ready",
    ) as PipelineEventEnvelope<"chunk.analysis.ready"> | undefined;
    const contextReadyEvent = persistedEvents.find(
      (event) => event.eventType === "context.ready",
    ) as PipelineEventEnvelope<"context.ready"> | undefined;
    const sessionSummaryReadyEvent = persistedEvents.find(
      (event) => event.eventType === "session.summary.ready",
    ) as PipelineEventEnvelope<"session.summary.ready"> | undefined;
    const coachingReadyEvent = persistedEvents.find(
      (event) => event.eventType === "coaching.ready",
    ) as PipelineEventEnvelope<"coaching.ready"> | undefined;

    assert.equal(completedSession?.status, "completed");
    assert.ok(persistedEventTypes.includes("resolve_participants.requested"));
    assert.ok(persistedEventTypes.includes("participants.ready"));
    assert.ok(persistedEventTypes.includes("annotate_questions.requested"));
    assert.ok(persistedEventTypes.includes("questions.ready"));
    assert.ok(persistedEventTypes.includes("score_interaction.requested"));
    assert.ok(persistedEventTypes.includes("interaction.metrics.ready"));
    assert.ok(persistedEventTypes.includes("update_baselines.requested"));
    assert.ok(persistedEventTypes.includes("baselines.ready"));
    assert.ok(persistedEventTypes.includes("session.finalization.requested"));
    assert.ok(persistedEventTypes.includes("session.summary.requested"));
    assert.ok(persistedEventTypes.includes("session.summary.ready"));
    assert.ok(persistedEventTypes.includes("coaching.requested"));
    assert.ok(persistedEventTypes.includes("coaching.ready"));
    assert.equal(chunkAnalysisReadyEvent?.payload.outputArtifacts[0]?.metadata?.provider, "openai");
    assert.equal(contextReadyEvent?.payload.outputArtifacts[0]?.metadata?.provider, "google");
    assert.equal(
      sessionSummaryReadyEvent?.payload.outputArtifacts[0]?.metadata?.provider,
      "openai",
    );
    assert.equal(coachingReadyEvent?.payload.outputArtifacts[0]?.metadata?.provider, "openai");
    assert.equal(sessionSummaryReadyEvent?.payload.summaryFormat, "json");
    assert.equal(coachingReadyEvent?.payload.coachingFormat, "json");
  } finally {
    await context.cleanup();
  }
});

test("recovery resumes finalizing sessions and reports integrity issues", async () => {
  const context = await createTestContext();
  const idGenerator = createFixedIdGenerator();
  const publishedIssues: string[] = [];
  const finalizedSessions: string[] = [];
  const publishedSessions: string[] = [];
  const eventPublisher: SessionLifecycleEventPublisher = {
    publishChunkRegistered() {},
    publishRecoveryIssue(issue) {
      publishedIssues.push(issue.code);
    },
    publishSessionChanged(session) {
      publishedSessions.push(session.id);
    },
    publishSessionFinalized(session) {
      finalizedSessions.push(session.id);
    },
  };

  try {
    const storageLayout = context.storageLayoutResolver.resolveSessionLayout("session-2");
    await context.fileSystem.ensureDirectory(storageLayout.chunksRoot);
    await context.sessionRepository.save(
      beginSessionFinalization(
        createSessionEntity({
          id: "session-2",
          captureSources: ["microphone"],
          startedAt: "2026-03-10T12:00:00.000Z",
          updatedAt: "2026-03-10T12:00:00.000Z",
          storageLayout,
        }),
        "2026-03-10T12:01:00.000Z",
      ),
    );
    await context.mediaChunkRepository.save(
      createMediaChunkEntity({
        id: "chunk-2",
        sessionId: "session-2",
        source: "microphone",
        relativePath: "chunks/audio/chunk-2.wav",
        recordedAt: "2026-03-10T12:00:10.000Z",
        byteSize: 42,
        createdAt: "2026-03-10T12:00:11.000Z",
      }),
    );
    const orphanedPath = context.storageLayoutResolver.resolveAbsoluteArtifactPath(
      "session-2",
      "chunks/audio/orphaned.wav",
    );
    await mkdir(path.dirname(orphanedPath), { recursive: true });
    await writeFile(orphanedPath, "orphaned");

    const finalizeSession = createFinalizeSessionUseCase({
      aggregateWriter: context.pipelineAggregateWriter,
      clock: fixedClock,
      eventPublisher,
      idGenerator,
      pipelineEventRepository: context.pipelineEventRepository,
      sessionRepository: context.sessionRepository,
    });
    const recoverSessions = createSessionRecoveryService({
      aggregateWriter: context.pipelineAggregateWriter,
      clock: fixedClock,
      eventPublisher,
      fileSystem: context.fileSystem,
      finalizeSession,
      idGenerator,
      mediaChunkRepository: context.mediaChunkRepository,
      pipelineEventRepository: context.pipelineEventRepository,
      sessionRepository: context.sessionRepository,
      storageLayoutResolver: context.storageLayoutResolver,
    });
    const pipelineOrchestrator = new BuiltInPipelineOrchestrator({
      analysisProvider: new LocalPipelineAnalysisProvider({
        clock: fixedClock,
        hostedStageRouter: createHostedStageRouter(),
        idGenerator,
        storageLayoutResolver: context.storageLayoutResolver,
      }),
      clock: fixedClock,
      eventPublisher,
      idGenerator,
      pipelineEventRepository: context.pipelineEventRepository,
      pipelineStageRunRepository: context.pipelineStageRunRepository,
      sessionRepository: context.sessionRepository,
      transactionManager: context.pipelineTransactionManager,
    });

    await recoverSessions();
    await pipelineOrchestrator.recover();
    await pipelineOrchestrator.runUntilIdle();
    await recoverSessions();
    await pipelineOrchestrator.recover();
    await pipelineOrchestrator.runUntilIdle();

    const recoveredSession = await context.sessionRepository.findById("session-2");

    assert.ok(publishedIssues.includes("missing-chunk-file"));
    assert.ok(publishedIssues.includes("orphaned-artifact"));
    assert.ok(publishedIssues.includes("finalization-interrupted"));
    assert.equal(recoveredSession?.status, "completed");
    assert.deepEqual(publishedSessions, ["session-2"]);
    assert.ok(finalizedSessions.length <= 1);
  } finally {
    await context.cleanup();
  }
});
