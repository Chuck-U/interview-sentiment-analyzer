import type { PipelineAggregateWriter, PipelineEventRepository } from "../ports/pipeline";
import type {
  Clock,
  FileSystemAccess,
  IdGenerator,
  MediaChunkRepository,
  SessionLifecycleEventPublisher,
  SessionRepository,
  SessionStorageLayoutResolver,
} from "../ports/session-lifecycle";
import {
  createChunkRegisteredEvent,
  createQueuedStageRunFromEvent,
  createTranscribeChunkRequestedEvent,
} from "./pipeline-events";
import type { FinalizeSessionResponse } from "../../../shared";
import { log } from "@/lib/logger";
export type SessionRecoveryDependencies = {
  readonly aggregateWriter: PipelineAggregateWriter;
  readonly clock: Clock;
  readonly eventPublisher: SessionLifecycleEventPublisher;
  readonly fileSystem: FileSystemAccess;
  readonly finalizeSession: (input: {
    readonly sessionId: string;
  }) => Promise<FinalizeSessionResponse>;
  readonly idGenerator: IdGenerator;
  readonly mediaChunkRepository: MediaChunkRepository;
  readonly pipelineEventRepository: PipelineEventRepository;
  readonly sessionRepository: SessionRepository;
  readonly storageLayoutResolver: SessionStorageLayoutResolver;
};

function toRelativeSessionPath(sessionId: string, absolutePath: string): string {
  const marker = `/sessions/${sessionId}/`;
  const normalizedAbsolutePath = absolutePath.replaceAll("\\", "/");
  const markerIndex = normalizedAbsolutePath.indexOf(marker);

  if (markerIndex === -1) {
    return normalizedAbsolutePath;
  }

  return normalizedAbsolutePath.slice(markerIndex + marker.length);
}

export function createSessionRecoveryService(
  dependencies: SessionRecoveryDependencies,
) {
  return async function recoverSessions(): Promise<void> {
    const recoverableSessions = await dependencies.sessionRepository.listByStatuses(
      ["active", "finalizing"],
    );

    for (const session of recoverableSessions) {
      const chunks = await dependencies.mediaChunkRepository.listBySessionId(
        session.id,
      );
      const sessionEvents = await dependencies.pipelineEventRepository.listBySessionId(
        session.id,
      );
      const registeredPaths = new Set(chunks.map((chunk) => chunk.relativePath));
      const chunkIdsWithRecoveredPipeline = new Set(
        sessionEvents
          .filter((event) => event.eventType === "chunk.registered")
          .map((event) => event.chunkId)
          .filter((chunkId): chunkId is string => chunkId !== undefined),
      );
      let queuedMissingChunkPipeline = false;

      for (const chunk of chunks) {
        const artifactPath =
          dependencies.storageLayoutResolver.resolveAbsoluteArtifactPath(
            session.id,
            chunk.relativePath,
          );
        const exists = await dependencies.fileSystem.pathExists(artifactPath);

        if (!exists) {
          dependencies.eventPublisher.publishRecoveryIssue({
            code: "missing-chunk-file",
            message: `Chunk ${chunk.id} is registered but missing from disk`,
            sessionId: session.id,
            chunkId: chunk.id,
          });
          continue;
        }

        if (!chunkIdsWithRecoveredPipeline.has(chunk.id)) {
          const recoveredAt = dependencies.clock.now().toISOString();
          const correlationId = session.id;
          const chunkRegisteredEvent = createChunkRegisteredEvent({
            chunk,
            correlationId,
            eventId: dependencies.idGenerator.createId(),
            occurredAt: recoveredAt,
          });
          const transcribeChunkRequestedEvent = createTranscribeChunkRequestedEvent(
            {
              causationId: chunkRegisteredEvent.eventId,
              chunk,
              correlationId,
              eventId: dependencies.idGenerator.createId(),
              occurredAt: recoveredAt,
            },
          );
          const transcribeStageRun = createQueuedStageRunFromEvent({
            event: transcribeChunkRequestedEvent,
            queuedAt: recoveredAt,
            runId: dependencies.idGenerator.createId(),
          });

          await dependencies.aggregateWriter.saveMediaChunkRegistration({
            chunk,
            events: [chunkRegisteredEvent, transcribeChunkRequestedEvent],
            stageRuns: [transcribeStageRun],
          });
          queuedMissingChunkPipeline = true;
        }
      }

      const chunkFiles = await dependencies.fileSystem.listFiles(
        session.storageLayout.chunksRoot ?? "",
      );

      if (!chunkFiles) {
        dependencies.eventPublisher.publishRecoveryIssue({
          code: "finalization-interrupted",
          message: `No chunk files found for session ${session.id}`,
          sessionId: session.id,
        });
        log.ger({ type: "error", message: `No chunk files found for session, because I killed them. ${session.id}` });
        throw new Error(`No chunk files found for session ${session.id}`);
      }

      for (const artifactPath of chunkFiles) {
        const relativePath = toRelativeSessionPath(session.id, artifactPath);

        if (!registeredPaths.has(relativePath)) {
          dependencies.eventPublisher.publishRecoveryIssue({
            code: "orphaned-artifact",
            message: `Found chunk artifact on disk with no registered metadata: ${relativePath}`,
            sessionId: session.id,
          });
        }
      }

      if (session.status === "finalizing") {
        dependencies.eventPublisher.publishRecoveryIssue({
          code: "finalization-interrupted",
          message: `Session ${session.id} was interrupted during finalization and will be resumed`,
          sessionId: session.id,
        });
        if (!queuedMissingChunkPipeline) {
          await dependencies.finalizeSession({ sessionId: session.id });
        } else {
          dependencies.eventPublisher.publishSessionChanged(session);
        }
      } else {
        dependencies.eventPublisher.publishSessionChanged(session);
      }
    }
  };
}
