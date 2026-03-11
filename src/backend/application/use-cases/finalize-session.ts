import type {
  FinalizeSessionRequest,
  FinalizeSessionResponse,
} from "../../../shared/session-lifecycle";
import {
  beginSessionFinalization,
  canFinalizeSession,
  completeSession,
  toSessionSnapshot,
} from "../../domain/session/session";
import type {
  Clock,
  SessionRepository,
} from "../ports/session-lifecycle";

export type FinalizeSessionDependencies = {
  readonly clock: Clock;
  readonly sessionRepository: SessionRepository;
};

export function createFinalizeSessionUseCase(
  dependencies: FinalizeSessionDependencies,
) {
  return async function finalizeSession(
    request: FinalizeSessionRequest,
  ): Promise<FinalizeSessionResponse> {
    const session = await dependencies.sessionRepository.findById(
      request.sessionId,
    );

    if (!session) {
      throw new Error(`Cannot finalize missing session ${request.sessionId}`);
    }

    if (session.status === "completed") {
      return {
        session: toSessionSnapshot(session),
      };
    }

    if (!canFinalizeSession(session)) {
      throw new Error(
        `Session ${request.sessionId} is not eligible for finalization from status ${session.status}`,
      );
    }

    const finalizedAt = dependencies.clock.now().toISOString();
    const finalizingSession = beginSessionFinalization(session, finalizedAt);

    await dependencies.sessionRepository.save(finalizingSession);

    const completedSession = completeSession(finalizingSession, finalizedAt);

    await dependencies.sessionRepository.save(completedSession);

    return {
      session: toSessionSnapshot(completedSession),
    };
  };
}
