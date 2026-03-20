import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { access, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { App } from "electron";

import { LangChainPipelineOrchestrator } from "./application/services/langchain-pipeline-orchestrator";
import { BuiltInPipelineOrchestrator } from "./application/services/pipeline-orchestrator";
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
  createSqlitePipelineScope,
  SqlitePipelineEventRepository,
  SqlitePipelineStageRunRepository,
} from "./infrastructure/persistence/sqlite/sqlite-pipeline";
import {
  SqliteParticipantBaselineRepository,
  SqliteParticipantPresenceRepository,
  SqliteParticipantRepository,
  SqliteQuestionAnnotationRepository,
} from "./infrastructure/persistence/sqlite/sqlite-participant-modeling";
import {
  SqliteMediaChunkRepository,
  SqliteSessionRepository,
} from "./infrastructure/persistence/sqlite/sqlite-session-lifecycle";
import { initializeSessionLifecycleDatabase } from "./infrastructure/persistence/sqlite/sqlite-database";
import { GoogleHostedAnalysisAdapter } from "./infrastructure/providers/google/google-hosted-analysis-adapter";
import { StaticHostedAnalysisStageRouter } from "./infrastructure/providers/hosted-analysis-stage-router";
import { LocalPipelineAnalysisProvider } from "./infrastructure/providers/local-pipeline-analysis";
import { OpenAIHostedAnalysisAdapter } from "./infrastructure/providers/openai/openai-hosted-analysis-adapter";
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

export type SessionLifecycleBackendOptions = {
  readonly orchestrationMode?: "built-in" | "langchain";
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
  options: SessionLifecycleBackendOptions = {},
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
  const openAiHostedAnalysisAdapter = new OpenAIHostedAnalysisAdapter();
  const googleHostedAnalysisAdapter = new GoogleHostedAnalysisAdapter();
  const hostedStageRouter = new StaticHostedAnalysisStageRouter({
    defaultAdapter: openAiHostedAnalysisAdapter,
    stageAdapters: {
      "condense_context.requested": googleHostedAnalysisAdapter,
    },
  });
  const analysisProvider = new LocalPipelineAnalysisProvider({
    clock,
    hostedStageRouter,
    idGenerator,
    storageLayoutResolver,
  });
  const pipelineOrchestrator =
    options.orchestrationMode === "langchain"
      ? new LangChainPipelineOrchestrator({
          analysisProvider,
          clock,
          eventPublisher,
          idGenerator,
          pipelineEventRepository,
          pipelineStageRunRepository,
          sessionRepository,
          transactionManager: pipelineScope.transactionManager,
        })
      : new BuiltInPipelineOrchestrator({
          analysisProvider,
          clock,
          eventPublisher,
          idGenerator,
          pipelineEventRepository,
          pipelineStageRunRepository,
          sessionRepository,
          transactionManager: pipelineScope.transactionManager,
        });
  const finalizeSession = createFinalizeSessionUseCase({
    aggregateWriter: pipelineScope.aggregateWriter,
    clock,
    eventPublisher,
    idGenerator,
    pipelineEventRepository,
    sessionRepository,
  });
  const startSession = createStartSessionUseCase({
    clock,
    eventPublisher,
    fileSystem,
    idGenerator,
    sessionRepository,
    storageLayoutResolver,
  });
  const registerMediaChunk = createRegisterMediaChunkUseCase({
    aggregateWriter: pipelineScope.aggregateWriter,
    clock,
    eventPublisher,
    fileSystem,
    idGenerator,
    mediaChunkRepository,
    sessionRepository,
    storageLayoutResolver,
  });
  function triggerPipelineRun(): void {
    void pipelineOrchestrator.runUntilIdle().catch((error: unknown) => {
      console.error("Pipeline orchestrator failed", error);
    });
  }
  const controller = createSessionLifecycleController({
    startSession,
    async registerMediaChunk(input) {
      const response = await registerMediaChunk(input);
      triggerPipelineRun();
      return response;
    },
    async finalizeSession(input) {
      const response = await finalizeSession(input);
      triggerPipelineRun();
      return response;
    },
  });
  const recover = createSessionRecoveryService({
    aggregateWriter: pipelineScope.aggregateWriter,
    clock,
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
    controller,
    async recover() {
      await recover();
      await pipelineOrchestrator.recover();
      await pipelineOrchestrator.runUntilIdle();
      await recover();
      await pipelineOrchestrator.recover();
      await pipelineOrchestrator.runUntilIdle();
    },
  };
}
