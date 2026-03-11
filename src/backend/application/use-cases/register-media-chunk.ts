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
  FileSystemAccess,
  MediaChunkRepository,
  SessionRepository,
  SessionStorageLayoutResolver,
} from "../ports/session-lifecycle";

export type RegisterMediaChunkDependencies = {
  readonly clock: Clock;
  readonly fileSystem: FileSystemAccess;
  readonly mediaChunkRepository: MediaChunkRepository;
  readonly sessionRepository: SessionRepository;
  readonly storageLayoutResolver: SessionStorageLayoutResolver;
};

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

    const absoluteArtifactPath =
      dependencies.storageLayoutResolver.resolveAbsoluteArtifactPath(
        request.sessionId,
        request.relativePath,
      );
    const fileExists =
      await dependencies.fileSystem.pathExists(absoluteArtifactPath);

    if (!fileExists) {
      throw new Error(
        `Cannot register chunk ${request.chunkId} before the artifact exists on disk`,
      );
    }

    const createdAt = dependencies.clock.now().toISOString();
    const chunk = createMediaChunkEntity({
      id: request.chunkId,
      sessionId: request.sessionId,
      source: request.source,
      relativePath: request.relativePath,
      recordedAt: request.recordedAt,
      byteSize: request.byteSize,
      createdAt,
    });

    await dependencies.mediaChunkRepository.save(chunk);

    return {
      chunk: toMediaChunkSnapshot(chunk),
    };
  };
}
