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
  createSessionSummaryRequestedEvent,
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
      const inputArtifacts = collectSessionArtifacts(sessionEvents, [
        "transcript",
        "participant-set",
        "question-set",
        "interaction-metrics",
        "participant-baseline",
        "chunk-analysis",
        "context-summary",
      ]);
      const finalizationRequestedEvent = createSessionFinalizationRequestedEvent({
        correlationId: session.id,
        eventId: dependencies.idGenerator.createId(),
        inputArtifacts,
        occurredAt: finalizedAt,
        requestedBy: "user",
        sessionId: session.id,
      });
      const sessionSummaryRequestedEvent = createSessionSummaryRequestedEvent({
        causationId: finalizationRequestedEvent.eventId,
        correlationId: session.id,
        eventId: dependencies.idGenerator.createId(),
        inputArtifacts,
        occurredAt: finalizedAt,
        sessionId: session.id,
      });
      const sessionSummaryStageRun = createQueuedStageRunFromEvent({
        event: sessionSummaryRequestedEvent,
        queuedAt: finalizedAt,
        runId: dependencies.idGenerator.createId(),
      });

      await dependencies.aggregateWriter.saveSessionUpdate({
        session: finalizingSession,
        events: [finalizationRequestedEvent, sessionSummaryRequestedEvent],
        stageRuns: [sessionSummaryStageRun],
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
