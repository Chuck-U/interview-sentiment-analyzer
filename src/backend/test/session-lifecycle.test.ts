import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import assert from "node:assert/strict";

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
  SqliteMediaChunkRepository,
  SqliteSessionRepository,
} from "../infrastructure/persistence/sqlite/sqlite-session-lifecycle";
import {
  initializeSessionLifecycleDatabase,
  SESSION_LIFECYCLE_SCHEMA_VERSION,
} from "../infrastructure/persistence/sqlite/sqlite-database";
import { createSessionStorageLayoutResolver } from "../infrastructure/storage/session-storage-layout";

type TestContext = {
  readonly appDataRoot: string;
  readonly cleanup: () => Promise<void>;
  readonly database: SessionLifecycleDatabase;
  readonly eventPublisher: SessionLifecycleEventPublisher;
  readonly fileSystem: FileSystemAccess;
  readonly mediaChunkRepository: SqliteMediaChunkRepository;
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

const fixedIdGenerator = {
  createId() {
    return "generated-session-id";
  },
};

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
        .prepare("SELECT version FROM __session_lifecycle_migrations")
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

  try {
    const startSession = createStartSessionUseCase({
      clock: fixedClock,
      eventPublisher: context.eventPublisher,
      fileSystem: context.fileSystem,
      idGenerator: fixedIdGenerator,
      sessionRepository: context.sessionRepository,
      storageLayoutResolver: context.storageLayoutResolver,
    });
    const registerMediaChunk = createRegisterMediaChunkUseCase({
      clock: fixedClock,
      eventPublisher: context.eventPublisher,
      fileSystem: context.fileSystem,
      mediaChunkRepository: context.mediaChunkRepository,
      sessionRepository: context.sessionRepository,
      storageLayoutResolver: context.storageLayoutResolver,
    });
    const finalizeSession = createFinalizeSessionUseCase({
      clock: fixedClock,
      eventPublisher: context.eventPublisher,
      sessionRepository: context.sessionRepository,
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

    const finalizedSession = await finalizeSession({
      sessionId: startedSession.session.id,
    });
    const replayedFinalization = await finalizeSession({
      sessionId: startedSession.session.id,
    });

    assert.equal(finalizedSession.session.status, "completed");
    assert.equal(replayedFinalization.session.status, "completed");
  } finally {
    await context.cleanup();
  }
});

test("recovery resumes finalizing sessions and reports integrity issues", async () => {
  const context = await createTestContext();
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
      clock: fixedClock,
      eventPublisher,
      sessionRepository: context.sessionRepository,
    });
    const recoverSessions = createSessionRecoveryService({
      eventPublisher,
      fileSystem: context.fileSystem,
      finalizeSession,
      mediaChunkRepository: context.mediaChunkRepository,
      sessionRepository: context.sessionRepository,
      storageLayoutResolver: context.storageLayoutResolver,
    });

    await recoverSessions();

    const recoveredSession = await context.sessionRepository.findById("session-2");

    assert.ok(publishedIssues.includes("missing-chunk-file"));
    assert.ok(publishedIssues.includes("orphaned-artifact"));
    assert.ok(publishedIssues.includes("finalization-interrupted"));
    assert.deepEqual(finalizedSessions, ["session-2"]);
    assert.equal(recoveredSession?.status, "completed");
    assert.deepEqual(publishedSessions, ["session-2"]);
  } finally {
    await context.cleanup();
  }
});
