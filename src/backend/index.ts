import { randomUUID } from "node:crypto";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import type { App } from "electron";

import type {
  Clock,
  FileSystemAccess,
  IdGenerator,
} from "./application/ports/session-lifecycle";
import { createFinalizeSessionUseCase } from "./application/use-cases/finalize-session";
import { createRegisterMediaChunkUseCase } from "./application/use-cases/register-media-chunk";
import { createStartSessionUseCase } from "./application/use-cases/start-session";
import { createSessionLifecycleController } from "./interfaces/controllers/session-lifecycle-controller";
import { InMemoryMediaChunkRepository, InMemorySessionRepository } from "./infrastructure/persistence/in-memory-session-lifecycle";
import { createSessionStorageLayoutResolver } from "./infrastructure/storage/session-storage-layout";

function createFileSystemAccess(): FileSystemAccess {
  return {
    async ensureDirectory(directoryPath) {
      await mkdir(directoryPath, { recursive: true });
    },
    async pathExists(targetPath) {
      try {
        await access(targetPath);
        return true;
      } catch {
        return false;
      }
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

export function createSessionLifecycleBackend(app: Pick<App, "getPath">) {
  const appDataRoot = path.join(
    app.getPath("appData"),
    "interview-sentiment-analyzer",
  );
  const clock = createClock();
  const fileSystem = createFileSystemAccess();
  const idGenerator = createIdGenerator();
  const sessionRepository = new InMemorySessionRepository();
  const mediaChunkRepository = new InMemoryMediaChunkRepository();
  const storageLayoutResolver = createSessionStorageLayoutResolver(appDataRoot);

  return createSessionLifecycleController({
    startSession: createStartSessionUseCase({
      clock,
      fileSystem,
      idGenerator,
      sessionRepository,
      storageLayoutResolver,
    }),
    registerMediaChunk: createRegisterMediaChunkUseCase({
      clock,
      fileSystem,
      mediaChunkRepository,
      sessionRepository,
      storageLayoutResolver,
    }),
    finalizeSession: createFinalizeSessionUseCase({
      clock,
      sessionRepository,
    }),
  });
}
