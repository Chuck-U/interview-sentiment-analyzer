import type {
  StartSessionRequest,
  StartSessionResponse,
} from "../../../shared/session-lifecycle";
import {
  createSessionEntity,
  toSessionSnapshot,
} from "../../domain/session/session";
import type {
  Clock,
  FileSystemAccess,
  IdGenerator,
  SessionRepository,
  SessionStorageLayoutResolver,
} from "../ports/session-lifecycle";

export type StartSessionDependencies = {
  readonly clock: Clock;
  readonly fileSystem: FileSystemAccess;
  readonly idGenerator: IdGenerator;
  readonly sessionRepository: SessionRepository;
  readonly storageLayoutResolver: SessionStorageLayoutResolver;
};

export function createStartSessionUseCase(
  dependencies: StartSessionDependencies,
) {
  return async function startSession(
    request: StartSessionRequest,
  ): Promise<StartSessionResponse> {
    if (request.idempotencyKey) {
      const existingSession =
        await dependencies.sessionRepository.findByIdempotencyKey(
          request.idempotencyKey,
        );

      if (existingSession) {
        return {
          session: toSessionSnapshot(existingSession),
        };
      }
    }

    const sessionId = request.sessionId ?? dependencies.idGenerator.createId();
    const existingSession = await dependencies.sessionRepository.findById(
      sessionId,
    );

    if (existingSession) {
      return {
        session: toSessionSnapshot(existingSession),
      };
    }

    const now = dependencies.clock.now().toISOString();
    const storageLayout =
      dependencies.storageLayoutResolver.resolveSessionLayout(sessionId);

    await dependencies.fileSystem.ensureDirectory(storageLayout.sessionRoot);
    await dependencies.fileSystem.ensureDirectory(storageLayout.chunksRoot);
    await dependencies.fileSystem.ensureDirectory(storageLayout.transcriptsRoot);
    await dependencies.fileSystem.ensureDirectory(storageLayout.summariesRoot);
    await dependencies.fileSystem.ensureDirectory(storageLayout.tempRoot);

    const session = createSessionEntity({
      id: sessionId,
      captureSources: request.captureSources,
      startedAt: now,
      updatedAt: now,
      storageLayout,
      idempotencyKey: request.idempotencyKey,
    });

    await dependencies.sessionRepository.save(session);

    return {
      session: toSessionSnapshot(session),
    };
  };
}
