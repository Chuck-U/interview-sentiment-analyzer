import type {
  PipelineAggregateWriter,
  PipelineEventRepository,
  PipelineStageRunRepository,
  PipelineTransactionManager,
} from "../../application/ports/pipeline";
import type {
  MediaChunkRepository,
  SessionRepository,
} from "../../application/ports/session-lifecycle";
import type {
  MediaChunkStatus,
  PipelineEventEnvelope,
  PipelineEventType,
  PipelineStageRunRecord,
  PipelineStageRunStatus,
  SessionStatus,
} from "../../../shared";
import type { MediaChunkEntity } from "../../domain/capture/media-chunk";
import type { SessionEntity } from "../../domain/session/session";

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, SessionEntity>();

  private readonly sessionsByIdempotencyKey = new Map<string, SessionEntity>();

  async findById(sessionId: string): Promise<SessionEntity | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<SessionEntity | null> {
    return this.sessionsByIdempotencyKey.get(idempotencyKey) ?? null;
  }

  async listByStatuses(
    statuses: readonly SessionStatus[],
  ): Promise<readonly SessionEntity[]> {
    return [...this.sessions.values()].filter((session) =>
      statuses.includes(session.status),
    );
  }

  async save(session: SessionEntity): Promise<void> {
    this.sessions.set(session.id, session);

    if (session.idempotencyKey) {
      this.sessionsByIdempotencyKey.set(session.idempotencyKey, session);
    }
  }
}

export class InMemoryMediaChunkRepository implements MediaChunkRepository {
  private readonly chunks = new Map<string, MediaChunkEntity>();

  async findById(chunkId: string): Promise<MediaChunkEntity | null> {
    return this.chunks.get(chunkId) ?? null;
  }

  async save(chunk: MediaChunkEntity): Promise<void> {
    this.chunks.set(chunk.id, chunk);
  }

  async listBySessionId(
    sessionId: string,
  ): Promise<readonly MediaChunkEntity[]> {
    return [...this.chunks.values()].filter(
      (chunk) => chunk.sessionId === sessionId,
    );
  }

  async listByStatuses(
    statuses: readonly MediaChunkStatus[],
  ): Promise<readonly MediaChunkEntity[]> {
    return [...this.chunks.values()].filter((chunk) =>
      statuses.includes(chunk.status),
    );
  }
}

export class InMemoryPipelineEventRepository implements PipelineEventRepository {
  private readonly events = new Map<string, PipelineEventEnvelope>();

  async append(event: PipelineEventEnvelope): Promise<void> {
    this.events.set(event.eventId, event);
  }

  async findById(eventId: string): Promise<PipelineEventEnvelope | null> {
    return this.events.get(eventId) ?? null;
  }

  async listBySessionId(
    sessionId: string,
  ): Promise<readonly PipelineEventEnvelope[]> {
    return [...this.events.values()]
      .filter((event) => event.sessionId === sessionId)
      .sort((left, right) =>
        left.occurredAt === right.occurredAt
          ? left.eventId.localeCompare(right.eventId)
          : left.occurredAt.localeCompare(right.occurredAt),
      );
  }

  async listByEventTypes(
    sessionId: string,
    eventTypes: readonly PipelineEventType[],
  ): Promise<readonly PipelineEventEnvelope[]> {
    return (await this.listBySessionId(sessionId)).filter((event) =>
      eventTypes.includes(event.eventType),
    );
  }
}

export class InMemoryPipelineStageRunRepository
  implements PipelineStageRunRepository
{
  private readonly stageRuns = new Map<string, PipelineStageRunRecord>();

  async findById(runId: string): Promise<PipelineStageRunRecord | null> {
    return this.stageRuns.get(runId) ?? null;
  }

  async findByEventId(eventId: string): Promise<PipelineStageRunRecord | null> {
    return (
      [...this.stageRuns.values()].find((stageRun) => stageRun.eventId === eventId) ??
      null
    );
  }

  async listByStatuses(
    statuses: readonly PipelineStageRunStatus[],
  ): Promise<readonly PipelineStageRunRecord[]> {
    return [...this.stageRuns.values()].filter((stageRun) =>
      statuses.includes(stageRun.status),
    );
  }

  async claimNextRunnable(input: {
    readonly now: string;
    readonly leaseUntil: string;
  }): Promise<PipelineStageRunRecord | null> {
    const runnableStageRun =
      [...this.stageRuns.values()]
        .filter(
          (stageRun) =>
            stageRun.status === "queued" ||
            (stageRun.status === "running" &&
              stageRun.leasedUntil !== undefined &&
              stageRun.leasedUntil <= input.now),
        )
        .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt))[0] ??
      null;

    if (!runnableStageRun) {
      return null;
    }

    const claimedStageRun: PipelineStageRunRecord = {
      ...runnableStageRun,
      status: "running",
      attempt: runnableStageRun.attempt + 1,
      leasedUntil: input.leaseUntil,
      startedAt: runnableStageRun.startedAt ?? input.now,
      updatedAt: input.now,
    };

    this.stageRuns.set(claimedStageRun.runId, claimedStageRun);

    return claimedStageRun;
  }

  async save(stageRun: PipelineStageRunRecord): Promise<void> {
    this.stageRuns.set(stageRun.runId, stageRun);
  }
}

export class InMemoryPipelineTransactionManager implements PipelineTransactionManager {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly mediaChunkRepository: MediaChunkRepository,
    private readonly pipelineEventRepository: PipelineEventRepository,
    private readonly pipelineStageRunRepository: PipelineStageRunRepository,
  ) {}

  async withTransaction<T>(
    callback: (scope: {
      readonly mediaChunkRepository: MediaChunkRepository;
      readonly pipelineEventRepository: PipelineEventRepository;
      readonly pipelineStageRunRepository: PipelineStageRunRepository;
      readonly sessionRepository: SessionRepository;
    }) => Promise<T>,
  ): Promise<T> {
    return callback({
      mediaChunkRepository: this.mediaChunkRepository,
      pipelineEventRepository: this.pipelineEventRepository,
      pipelineStageRunRepository: this.pipelineStageRunRepository,
      sessionRepository: this.sessionRepository,
    });
  }
}

export class InMemoryPipelineAggregateWriter implements PipelineAggregateWriter {
  constructor(private readonly transactionManager: PipelineTransactionManager) {}

  async saveMediaChunkRegistration(input: {
    readonly chunk: MediaChunkEntity;
    readonly events: readonly PipelineEventEnvelope[];
    readonly stageRuns: readonly PipelineStageRunRecord[];
  }): Promise<void> {
    await this.transactionManager.withTransaction(async (scope) => {
      await scope.mediaChunkRepository.save(input.chunk);

      for (const event of input.events) {
        await scope.pipelineEventRepository.append(event);
      }

      for (const stageRun of input.stageRuns) {
        await scope.pipelineStageRunRepository.save(stageRun);
      }
    });
  }

  async saveSessionUpdate(input: {
    readonly session: SessionEntity;
    readonly events: readonly PipelineEventEnvelope[];
    readonly stageRuns: readonly PipelineStageRunRecord[];
  }): Promise<void> {
    await this.transactionManager.withTransaction(async (scope) => {
      await scope.sessionRepository.save(input.session);

      for (const event of input.events) {
        await scope.pipelineEventRepository.append(event);
      }

      for (const stageRun of input.stageRuns) {
        await scope.pipelineStageRunRepository.save(stageRun);
      }
    });
  }
}
