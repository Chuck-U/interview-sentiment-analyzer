import type {
  FinalizeSessionRequest,
  FinalizeSessionResponse,
} from "../../../shared/session-lifecycle";
import {
  beginSessionFinalization,
  canFinalizeSession,
  toSessionSnapshot,
} from "../../domain/session/session";
import type {
  PipelineAggregateWriter,
  PipelineEventRepository,
} from "../ports/pipeline";
import {
  collectSessionArtifacts,
  createQueuedStageRunFromEvent,
  createSessionFinalizationRequestedEvent,
  hasSessionFinalizationRequest,
} from "../services/pipeline-events";
import type {
  Clock,
  IdGenerator,
  SessionLifecycleEventPublisher,
  SessionRepository,
} from "../ports/session-lifecycle";

export type FinalizeSessionDependencies = {
  readonly aggregateWriter: PipelineAggregateWriter;
  readonly clock: Clock;
  readonly eventPublisher?: SessionLifecycleEventPublisher;
  readonly idGenerator: IdGenerator;
  readonly pipelineEventRepository: PipelineEventRepository;
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
      dependencies.eventPublisher?.publishSessionFinalized(session);
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
    const sessionEvents =
      await dependencies.pipelineEventRepository.listBySessionId(session.id);
    const existingFinalizationRequest =
      hasSessionFinalizationRequest(sessionEvents);

    if (!existingFinalizationRequest) {
      const finalizationRequestedEvent = createSessionFinalizationRequestedEvent({
        correlationId: session.id,
        eventId: dependencies.idGenerator.createId(),
        inputArtifacts: collectSessionArtifacts(sessionEvents, [
          "context-summary",
          "chunk-analysis",
          "transcript",
        ]),
        occurredAt: finalizedAt,
        requestedBy: "user",
        sessionId: session.id,
      });
      const finalizationStageRun = createQueuedStageRunFromEvent({
        event: finalizationRequestedEvent,
        queuedAt: finalizedAt,
        runId: dependencies.idGenerator.createId(),
      });

      await dependencies.aggregateWriter.saveSessionUpdate({
        session: finalizingSession,
        events: [finalizationRequestedEvent],
        stageRuns: [finalizationStageRun],
      });
    } else if (session.status !== "finalizing") {
      await dependencies.aggregateWriter.saveSessionUpdate({
        session: finalizingSession,
        events: [],
        stageRuns: [],
      });
    }

    dependencies.eventPublisher?.publishSessionChanged(finalizingSession);

    return {
      session: toSessionSnapshot(finalizingSession),
    };
  };
}
