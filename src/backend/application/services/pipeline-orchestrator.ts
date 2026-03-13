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
  PipelineEventEnvelope,
  PipelineExecutableStageName,
  PipelineStageRunRecord,
} from "../../../shared";
import {
  createPipelineEventEnvelope,
  isPipelineExecutableStageName,
} from "../../../shared";
import { createQueuedStageRunFromEvent } from "./pipeline-events";

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;

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

function addMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(new Date(timestamp).getTime() + milliseconds).toISOString();
}

function toRequestedStageEvent(
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
    },
  });
}

function createFollowUpStageRuns(
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
    private readonly dependencies: PipelineOrchestratorDependencies,
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
      const executionResult = await this.executeStage({
        runId: claimedRun.runId,
        stageName: claimedRun.stageName,
        event: toRequestedStageEvent(sourceEvent),
        inputArtifacts: claimedRun.inputArtifacts,
      });
      const completedAt = this.dependencies.clock.now().toISOString();
      const followUpStageRuns = createFollowUpStageRuns(
        executionResult.emittedEvents,
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

        for (const event of executionResult.emittedEvents) {
          await scope.pipelineEventRepository.append(event);
        }

        for (const stageRun of followUpStageRuns) {
          await scope.pipelineStageRunRepository.save(stageRun);
        }

        if (claimedRun.stageName === "session.finalization.requested") {
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

  private async handleClaimedRunFailure(
    claimedRun: PipelineStageRunRecord,
    sourceEvent: PipelineEventEnvelope,
    error: unknown,
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
