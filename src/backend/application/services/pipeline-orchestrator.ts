import type {
  AnalysisProvider,
  PipelineStageExecutionRequest,
  PipelineStageExecutionResult,
} from "../ports/analysis-provider";
import type {
  PipelineEventRepository,
  PipelineStageRunRepository,
  PipelineTransactionManager,
} from "../ports/pipeline";
import type {
  Clock,
  IdGenerator,
  SessionLifecycleEventPublisher,
  SessionRepository,
} from "../ports/session-lifecycle";
import {
  completeSession,
  type SessionEntity,
} from "../../domain/session/session";
import type {
  PipelineArtifactRef,
  PipelineEventEnvelope,
  PipelineEventType,
  PipelineExecutableStageName,
  PipelinePayload,
  PipelineProviderRoute,
  PipelineSessionGraphState,
  PipelineStageRunRecord,
} from "../../../shared";
import {
  createPipelineEventEnvelope,
  isPipelineExecutableStageName,
} from "../../../shared";
import { createQueuedStageRunFromEvent } from "./pipeline-events";

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;

type PipelinePayloadWithExecutionMetadata = {
  readonly inputArtifacts: readonly PipelineArtifactRef[];
  readonly outputArtifacts: readonly PipelineArtifactRef[];
  readonly graphState?: PipelineSessionGraphState;
  readonly providerRoute?: PipelineProviderRoute;
};

export type PipelineOrchestrator = {
  recover(): Promise<void>;
  runUntilIdle(): Promise<void>;
};

export type PipelineOrchestratorDependencies = {
  readonly analysisProvider: AnalysisProvider;
  readonly clock: Clock;
  readonly eventPublisher?: SessionLifecycleEventPublisher;
  readonly idGenerator: IdGenerator;
  readonly maxAttempts?: number;
  readonly pipelineEventRepository: PipelineEventRepository;
  readonly pipelineStageRunRepository: PipelineStageRunRepository;
  readonly sessionRepository: SessionRepository;
  readonly transactionManager: PipelineTransactionManager;
};

export type PipelineExecutionContext = {
  readonly graphState: PipelineSessionGraphState;
  readonly providerRoute: PipelineProviderRoute;
};

function addMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(new Date(timestamp).getTime() + milliseconds).toISOString();
}

function copyGraphState(
  graphState: PipelineSessionGraphState | undefined,
): PipelineSessionGraphState {
  return {
    ...(graphState ?? {}),
    activeQuestion: graphState?.activeQuestion
      ? { ...graphState.activeQuestion }
      : undefined,
    liveAnswerEvaluation: graphState?.liveAnswerEvaluation
      ? { ...graphState.liveAnswerEvaluation }
      : undefined,
    metadata: graphState?.metadata ? { ...graphState.metadata } : undefined,
  };
}

function toPayloadWithExecutionMetadata<TEventType extends PipelineEventType>(
  event: PipelineEventEnvelope<TEventType>,
): PipelinePayload<TEventType> & PipelinePayloadWithExecutionMetadata {
  return event.payload as PipelinePayload<TEventType> &
    PipelinePayloadWithExecutionMetadata;
}

export function createDefaultPipelineProviderRoute(
  clock: Clock,
): PipelineProviderRoute {
  return {
    routeKind: "local",
    providerId: "local-pipeline-analysis",
    selectedAt: clock.now().toISOString(),
  };
}

export function resolveLatestPipelineGraphState(
  events: readonly PipelineEventEnvelope[],
): PipelineSessionGraphState {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const graphState = toPayloadWithExecutionMetadata(events[index]).graphState;

    if (graphState) {
      return copyGraphState(graphState);
    }
  }

  return {};
}

export function resolveLatestPipelineProviderRoute(
  events: readonly PipelineEventEnvelope[],
  clock: Clock,
): PipelineProviderRoute {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const providerRoute = toPayloadWithExecutionMetadata(events[index]).providerRoute;

    if (providerRoute) {
      return {
        ...providerRoute,
        metadata: providerRoute.metadata ? { ...providerRoute.metadata } : undefined,
      };
    }
  }

  return createDefaultPipelineProviderRoute(clock);
}

export async function resolvePipelineExecutionContext(input: {
  readonly clock: Clock;
  readonly pipelineEventRepository: PipelineEventRepository;
  readonly sessionId: string;
}): Promise<PipelineExecutionContext> {
  const sessionEvents = await input.pipelineEventRepository.listBySessionId(
    input.sessionId,
  );

  return {
    graphState: resolveLatestPipelineGraphState(sessionEvents),
    providerRoute: resolveLatestPipelineProviderRoute(sessionEvents, input.clock),
  };
}

export function stampPipelineEventWithExecutionContext<
  TEventType extends PipelineEventType,
>(
  event: PipelineEventEnvelope<TEventType>,
  context: PipelineExecutionContext,
): PipelineEventEnvelope<TEventType> {
  const payload = toPayloadWithExecutionMetadata(event);

  return createPipelineEventEnvelope({
    eventId: event.eventId,
    eventType: event.eventType,
    sessionId: event.sessionId,
    chunkId: event.chunkId,
    stageName: event.stageName,
    causationId: event.causationId,
    correlationId: event.correlationId,
    occurredAt: event.occurredAt,
    payload: {
      ...payload,
      graphState: copyGraphState(payload.graphState ?? context.graphState),
      providerRoute: payload.providerRoute ?? context.providerRoute,
    } as PipelinePayload<TEventType>,
  });
}

export function stampPipelineEventsWithExecutionContext(
  events: readonly PipelineEventEnvelope[],
  context: PipelineExecutionContext,
): readonly PipelineEventEnvelope[] {
  return events.map((event) =>
    stampPipelineEventWithExecutionContext(event, context),
  );
}

export function toRequestedStageEvent(
  event: PipelineEventEnvelope,
): PipelineEventEnvelope<PipelineExecutableStageName> {
  if (!isPipelineExecutableStageName(event.eventType)) {
    throw new Error(`Cannot execute non-requested pipeline event ${event.eventType}`);
  }

  return event as PipelineEventEnvelope<PipelineExecutableStageName>;
}

function createFailureEvent(input: {
  readonly error: Error;
  readonly eventId: string;
  readonly occurredAt: string;
  readonly run: PipelineStageRunRecord;
  readonly sourceEvent: PipelineEventEnvelope;
  readonly executionContext?: PipelineExecutionContext;
}): PipelineEventEnvelope<"pipeline.failed"> {
  return createPipelineEventEnvelope({
    eventId: input.eventId,
    eventType: "pipeline.failed",
    sessionId: input.run.sessionId,
    chunkId: input.run.chunkId,
    causationId: input.sourceEvent.eventId,
    correlationId: input.sourceEvent.correlationId,
    occurredAt: input.occurredAt,
    payload: {
      failedAt: input.occurredAt,
      failedStageName: input.run.stageName,
      errorCode: input.error.name || "PipelineStageError",
      errorMessage: input.error.message || "Pipeline stage execution failed",
      attempt: input.run.attempt,
      inputArtifacts: [...input.run.inputArtifacts],
      outputArtifacts: [],
      graphState: input.executionContext?.graphState,
      providerRoute: input.executionContext?.providerRoute,
    },
  });
}

export function createFollowUpStageRuns(
  events: readonly PipelineEventEnvelope[],
  idGenerator: IdGenerator,
  queuedAt: string,
): readonly PipelineStageRunRecord[] {
  return events
    .filter((event) => isPipelineExecutableStageName(event.eventType))
    .map((event) =>
      createQueuedStageRunFromEvent({
        event,
        queuedAt,
        runId: idGenerator.createId(),
      }),
    );
}

export class BuiltInPipelineOrchestrator implements PipelineOrchestrator {
  private readonly maxAttempts: number;

  constructor(
    protected readonly dependencies: PipelineOrchestratorDependencies,
  ) {
    this.maxAttempts = dependencies.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  async recover(): Promise<void> {
    const now = this.dependencies.clock.now().toISOString();
    const stageRuns = await this.dependencies.pipelineStageRunRepository.listByStatuses(
      ["failed", "running"],
    );

    for (const stageRun of stageRuns) {
      if (
        stageRun.status === "running" &&
        stageRun.leasedUntil !== undefined &&
        stageRun.leasedUntil <= now
      ) {
        await this.dependencies.pipelineStageRunRepository.save({
          ...stageRun,
          status: "queued",
          leasedUntil: undefined,
          updatedAt: now,
        });
      }

      if (stageRun.status === "failed" && stageRun.attempt < this.maxAttempts) {
        await this.dependencies.pipelineStageRunRepository.save({
          ...stageRun,
          status: "queued",
          leasedUntil: undefined,
          updatedAt: now,
        });
      }
    }
  }

  async runUntilIdle(): Promise<void> {
    for (;;) {
      const claimedRun = await this.claimNextRunnableStage();

      if (!claimedRun) {
        return;
      }

      await this.executeClaimedRun(claimedRun);
    }
  }

  protected async executeClaimedRun(
    claimedRun: PipelineStageRunRecord,
  ): Promise<void> {
    const sourceEvent = await this.dependencies.pipelineEventRepository.findById(
      claimedRun.eventId,
    );

    if (!sourceEvent) {
      throw new Error(`Missing source event ${claimedRun.eventId}`);
    }

    try {
      const executionContext = await resolvePipelineExecutionContext({
        clock: this.dependencies.clock,
        pipelineEventRepository: this.dependencies.pipelineEventRepository,
        sessionId: claimedRun.sessionId,
      });
      const executionResult = await this.executeStage({
        runId: claimedRun.runId,
        stageName: claimedRun.stageName,
        event: toRequestedStageEvent(sourceEvent),
        inputArtifacts: claimedRun.inputArtifacts,
        graphState: executionContext.graphState,
        providerRoute: executionContext.providerRoute,
      });
      const completedAt = this.dependencies.clock.now().toISOString();
      const settledExecutionContext: PipelineExecutionContext = {
        graphState: copyGraphState(
          executionResult.graphState ?? executionContext.graphState,
        ),
        providerRoute: executionResult.providerRoute ?? executionContext.providerRoute,
      };
      const emittedEvents = stampPipelineEventsWithExecutionContext(
        executionResult.emittedEvents,
        settledExecutionContext,
      );
      const followUpStageRuns = createFollowUpStageRuns(
        emittedEvents,
        this.dependencies.idGenerator,
        completedAt,
      );
      let finalizedSession: SessionEntity | null = null;
      const completedRun: PipelineStageRunRecord = {
        ...claimedRun,
        status: "completed",
        leasedUntil: undefined,
        outputArtifacts: [...executionResult.outputArtifacts],
        completedAt,
        errorCode: undefined,
        errorMessage: undefined,
        updatedAt: completedAt,
      };

      await this.dependencies.transactionManager.withTransaction(async (scope) => {
        await scope.pipelineStageRunRepository.save(completedRun);

        for (const event of emittedEvents) {
          await scope.pipelineEventRepository.append(event);
        }

        for (const stageRun of followUpStageRuns) {
          await scope.pipelineStageRunRepository.save(stageRun);
        }

        if (claimedRun.stageName === "coaching.requested") {
          const session = await scope.sessionRepository.findById(claimedRun.sessionId);

          if (session) {
            finalizedSession = completeSession(session, completedAt);
            await scope.sessionRepository.save(finalizedSession);
          }
        }
      });

      if (finalizedSession) {
        this.dependencies.eventPublisher?.publishSessionFinalized(finalizedSession);
      }
    } catch (error) {
      await this.handleClaimedRunFailure(claimedRun, sourceEvent, error);
    }
  }

  protected executeStage(
    request: PipelineStageExecutionRequest<PipelineExecutableStageName>,
  ): Promise<PipelineStageExecutionResult> {
    return this.dependencies.analysisProvider.executeStage(request);
  }

  private async claimNextRunnableStage(): Promise<PipelineStageRunRecord | null> {
    const now = this.dependencies.clock.now().toISOString();

    return this.dependencies.pipelineStageRunRepository.claimNextRunnable({
      now,
      leaseUntil: addMilliseconds(now, DEFAULT_LEASE_MS),
    });
  }

  protected async handleClaimedRunFailure(
    claimedRun: PipelineStageRunRecord,
    sourceEvent: PipelineEventEnvelope,
    error: unknown,
    executionContext?: PipelineExecutionContext,
  ): Promise<void> {
    const stageError =
      error instanceof Error ? error : new Error(String(error ?? "Unknown error"));
    const failedAt = this.dependencies.clock.now().toISOString();
    const nextStatus = claimedRun.attempt >= this.maxAttempts ? "dead-letter" : "failed";
    const failureEvent = createFailureEvent({
      error: stageError,
      eventId: this.dependencies.idGenerator.createId(),
      occurredAt: failedAt,
      run: claimedRun,
      sourceEvent,
      executionContext,
    });

    await this.dependencies.transactionManager.withTransaction(async (scope) => {
      await scope.pipelineStageRunRepository.save({
        ...claimedRun,
        status: nextStatus,
        leasedUntil: undefined,
        errorCode: stageError.name || "PipelineStageError",
        errorMessage: stageError.message,
        updatedAt: failedAt,
      });
      await scope.pipelineEventRepository.append(failureEvent);
    });
  }
}
