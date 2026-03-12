import type {
  RegisterMediaChunkRequest,
  RegisterMediaChunkResponse,
} from "../../../shared/session-lifecycle";
import {
  createMediaChunkEntity,
  toMediaChunkSnapshot,
} from "../../domain/capture/media-chunk";
import type {
  Clock,
  FileMetadata,
  FileSystemAccess,
  MediaChunkRepository,
  SessionLifecycleEventPublisher,
  SessionRepository,
  SessionStorageLayoutResolver,
} from "../ports/session-lifecycle";

export type RegisterMediaChunkDependencies = {
  readonly clock: Clock;
  readonly eventPublisher?: SessionLifecycleEventPublisher;
  readonly fileSystem: FileSystemAccess;
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

    await dependencies.mediaChunkRepository.save(chunk);
    dependencies.eventPublisher?.publishChunkRegistered(chunk);

    return {
      chunk: toMediaChunkSnapshot(chunk),
    };
  };
}
