import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { access, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { App } from "electron";

import type {
  Clock,
  FileSystemAccess,
  IdGenerator,
  SessionLifecycleEventPublisher,
} from "./application/ports/session-lifecycle";
import { createSessionRecoveryService } from "./application/services/session-recovery";
import { createFinalizeSessionUseCase } from "./application/use-cases/finalize-session";
import { createRegisterMediaChunkUseCase } from "./application/use-cases/register-media-chunk";
import { createStartSessionUseCase } from "./application/use-cases/start-session";
import { toMediaChunkSnapshot } from "./domain/capture/media-chunk";
import { toSessionSnapshot } from "./domain/session/session";
import { createSessionLifecycleController } from "./interfaces/controllers/session-lifecycle-controller";
import {
  SqliteMediaChunkRepository,
  SqliteSessionRepository,
} from "./infrastructure/persistence/sqlite/sqlite-session-lifecycle";
import { initializeSessionLifecycleDatabase } from "./infrastructure/persistence/sqlite/sqlite-database";
import { createSessionStorageLayoutResolver } from "./infrastructure/storage/session-storage-layout";
import type {
  MediaChunkSnapshot,
  SessionLifecycleRecoveryIssue,
  SessionSnapshot,
} from "../shared";

function createFileSystemAccess(): FileSystemAccess {
  async function walkDirectory(directoryPath: string): Promise<readonly string[]> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directoryPath, entry.name);

        if (entry.isDirectory()) {
          return walkDirectory(entryPath);
        }

        if (entry.isFile()) {
          return [entryPath];
        }

        return [];
      }),
    );

    return files.flat();
  }

  return {
    async ensureDirectory(directoryPath) {
      await mkdir(directoryPath, { recursive: true });
    },
    async listFiles(directoryPath) {
      try {
        return await walkDirectory(directoryPath);
      } catch {
        return [];
      }
    },
    async pathExists(targetPath) {
      try {
        await access(targetPath);
        return true;
      } catch {
        return false;
      }
    },
    async readFileMetadata(targetPath) {
      const metadata = await stat(targetPath);

      return {
        byteSize: metadata.size,
        createdAt: metadata.birthtime.toISOString(),
        updatedAt: metadata.mtime.toISOString(),
      };
    },
  };
}

function createClock(): Clock {
  return {
    now() {
      return new Date();
    },
  };
}

function createIdGenerator(): IdGenerator {
  return {
    createId() {
      return randomUUID();
    },
  };
}

export type SessionLifecycleBackendEvents = {
  readonly onChunkRegistered?: (chunk: MediaChunkSnapshot) => void;
  readonly onRecoveryIssue?: (issue: SessionLifecycleRecoveryIssue) => void;
  readonly onSessionChanged?: (session: SessionSnapshot) => void;
  readonly onSessionFinalized?: (session: SessionSnapshot) => void;
};

export type SessionLifecycleBackend = {
  readonly controller: ReturnType<typeof createSessionLifecycleController>;
  recover(): Promise<void>;
};

function createEventPublisher(
  events: SessionLifecycleBackendEvents,
): SessionLifecycleEventPublisher {
  return {
    publishChunkRegistered(chunk) {
      events.onChunkRegistered?.(toMediaChunkSnapshot(chunk));
    },
    publishRecoveryIssue(issue) {
      events.onRecoveryIssue?.(issue);
    },
    publishSessionChanged(session) {
      events.onSessionChanged?.(toSessionSnapshot(session));
    },
    publishSessionFinalized(session) {
      events.onSessionFinalized?.(toSessionSnapshot(session));
    },
  };
}

export function createSessionLifecycleBackend(
  app: Pick<App, "getPath">,
  events: SessionLifecycleBackendEvents = {},
): SessionLifecycleBackend {
  const appDataRoot = path.join(
    app.getPath("appData"),
    "interview-sentiment-analyzer",
  );
  mkdirSync(appDataRoot, { recursive: true });
  const sqlite = new DatabaseSync(
    path.join(appDataRoot, "session-lifecycle.sqlite"),
  );
  const database = initializeSessionLifecycleDatabase(sqlite);
  const clock = createClock();
  const fileSystem = createFileSystemAccess();
  const idGenerator = createIdGenerator();
  const storageLayoutResolver = createSessionStorageLayoutResolver(appDataRoot);
  const eventPublisher = createEventPublisher(events);
  const sessionRepository = new SqliteSessionRepository(
    database,
    storageLayoutResolver,
  );
  const mediaChunkRepository = new SqliteMediaChunkRepository(database);
  const finalizeSession = createFinalizeSessionUseCase({
    clock,
    eventPublisher,
    sessionRepository,
  });
  const controller = createSessionLifecycleController({
    startSession: createStartSessionUseCase({
      clock,
      eventPublisher,
      fileSystem,
      idGenerator,
      sessionRepository,
      storageLayoutResolver,
    }),
    registerMediaChunk: createRegisterMediaChunkUseCase({
      clock,
      eventPublisher,
      fileSystem,
      mediaChunkRepository,
      sessionRepository,
      storageLayoutResolver,
    }),
    finalizeSession,
  });
  const recover = createSessionRecoveryService({
    eventPublisher,
    fileSystem,
    finalizeSession,
    mediaChunkRepository,
    sessionRepository,
    storageLayoutResolver,
  });

  return {
    controller,
    recover,
  };
}
