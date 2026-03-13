import type {
  RegisterMediaChunkRequest,
  RegisterMediaChunkResponse,
} from "../../../shared/session-lifecycle";
import {
  createMediaChunkEntity,
  toMediaChunkSnapshot,
} from "../../domain/capture/media-chunk";
import {
  createChunkRegisteredEvent,
  createQueuedStageRunFromEvent,
  createTranscribeChunkRequestedEvent,
} from "../services/pipeline-events";
import type { PipelineAggregateWriter } from "../ports/pipeline";
import type {
  Clock,
  FileMetadata,
  FileSystemAccess,
  IdGenerator,
  MediaChunkRepository,
  SessionLifecycleEventPublisher,
  SessionRepository,
  SessionStorageLayoutResolver,
} from "../ports/session-lifecycle";

export type RegisterMediaChunkDependencies = {
  readonly aggregateWriter: PipelineAggregateWriter;
  readonly clock: Clock;
  readonly eventPublisher?: SessionLifecycleEventPublisher;
  readonly fileSystem: FileSystemAccess;
  readonly idGenerator: IdGenerator;
  readonly mediaChunkRepository: MediaChunkRepository;
  readonly sessionRepository: SessionRepository;
  readonly storageLayoutResolver: SessionStorageLayoutResolver;
};

function pickCreatedAt(
  metadata: FileMetadata,
  fallbackTimestamp: string,
): string {
  return metadata.createdAt || fallbackTimestamp;
}

export function createRegisterMediaChunkUseCase(
  dependencies: RegisterMediaChunkDependencies,
) {
  return async function registerMediaChunk(
    request: RegisterMediaChunkRequest,
  ): Promise<RegisterMediaChunkResponse> {
    const session = await dependencies.sessionRepository.findById(
      request.sessionId,
    );

    if (!session) {
      throw new Error(
        `Cannot register chunk for missing session ${request.sessionId}`,
      );
    }

    const existingChunk = await dependencies.mediaChunkRepository.findById(
      request.chunkId,
    );

    if (existingChunk) {
      if (existingChunk.sessionId !== request.sessionId) {
        throw new Error(
          `Chunk ${request.chunkId} is already assigned to another session`,
        );
      }

      return {
        chunk: toMediaChunkSnapshot(existingChunk),
      };
    }

    const normalizedRelativePath =
      dependencies.storageLayoutResolver.normalizeRelativeArtifactPath(
        request.source,
        request.relativePath,
      );
    const absoluteArtifactPath =
      dependencies.storageLayoutResolver.resolveAbsoluteArtifactPath(
        request.sessionId,
        normalizedRelativePath,
      );
    const fileExists =
      await dependencies.fileSystem.pathExists(absoluteArtifactPath);

    if (!fileExists) {
      throw new Error(
        `Cannot register chunk ${request.chunkId} before the artifact exists on disk`,
      );
    }

    const metadata = await dependencies.fileSystem.readFileMetadata(
      absoluteArtifactPath,
    );
    const createdAt = pickCreatedAt(
      metadata,
      dependencies.clock.now().toISOString(),
    );
    const chunk = createMediaChunkEntity({
      id: request.chunkId,
      sessionId: request.sessionId,
      source: request.source,
      relativePath: normalizedRelativePath,
      recordedAt: request.recordedAt,
      byteSize: metadata.byteSize,
      createdAt,
    });
    const persistedAt = dependencies.clock.now().toISOString();
    const correlationId = session.id;
    const chunkRegisteredEvent = createChunkRegisteredEvent({
      chunk,
      correlationId,
      eventId: dependencies.idGenerator.createId(),
      occurredAt: persistedAt,
    });
    const transcribeChunkRequestedEvent = createTranscribeChunkRequestedEvent({
      causationId: chunkRegisteredEvent.eventId,
      chunk,
      correlationId,
      eventId: dependencies.idGenerator.createId(),
      occurredAt: persistedAt,
    });
    const transcribeStageRun = createQueuedStageRunFromEvent({
      event: transcribeChunkRequestedEvent,
      queuedAt: persistedAt,
      runId: dependencies.idGenerator.createId(),
    });

    await dependencies.aggregateWriter.saveMediaChunkRegistration({
      chunk,
      events: [chunkRegisteredEvent, transcribeChunkRequestedEvent],
      stageRuns: [transcribeStageRun],
    });
    dependencies.eventPublisher?.publishChunkRegistered(chunk);

    return {
      chunk: toMediaChunkSnapshot(chunk),
    };
  };
}
