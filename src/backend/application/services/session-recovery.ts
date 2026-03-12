import type {
  FileSystemAccess,
  MediaChunkRepository,
  SessionLifecycleEventPublisher,
  SessionRepository,
  SessionStorageLayoutResolver,
} from "../ports/session-lifecycle";
import type { FinalizeSessionResponse } from "../../../shared";

export type SessionRecoveryDependencies = {
  readonly eventPublisher: SessionLifecycleEventPublisher;
  readonly fileSystem: FileSystemAccess;
  readonly finalizeSession: (input: {
    readonly sessionId: string;
  }) => Promise<FinalizeSessionResponse>;
  readonly mediaChunkRepository: MediaChunkRepository;
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
      const registeredPaths = new Set(chunks.map((chunk) => chunk.relativePath));

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
        }
      }

      const chunkFiles = await dependencies.fileSystem.listFiles(
        session.storageLayout.chunksRoot,
      );

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
        await dependencies.finalizeSession({ sessionId: session.id });
      } else {
        dependencies.eventPublisher.publishSessionChanged(session);
      }
    }
  };
}
