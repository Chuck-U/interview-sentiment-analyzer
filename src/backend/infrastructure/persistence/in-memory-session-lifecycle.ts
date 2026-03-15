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
  ParticipantBaselineRepository,
  ParticipantPresenceRepository,
  ParticipantRepository,
} from "../../application/ports/participant-repository";
import type { QuestionAnnotationRepository } from "../../application/ports/question-annotation-repository";
import type {
  MediaChunkStatus,
  PipelineEventEnvelope,
  PipelineEventType,
  PipelineStageRunRecord,
  PipelineStageRunStatus,
  SessionStatus,
} from "../../../shared";
import type { MediaChunkEntity } from "../../domain/capture/media-chunk";
import type { ParticipantBaselineEntity } from "../../domain/participant/participant-baseline";
import type { ParticipantEntity, ParticipantRole } from "../../domain/participant/participant";
import type { ParticipantPresenceEntity } from "../../domain/participant/participant-presence";
import type { QuestionAnnotationEntity } from "../../domain/question/question-annotation";
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

export class InMemoryParticipantRepository implements ParticipantRepository {
  private readonly participants = new Map<string, ParticipantEntity>();

  async findById(participantId: string): Promise<ParticipantEntity | null> {
    return this.participants.get(participantId) ?? null;
  }

  async findPrimaryCandidate(sessionId: string): Promise<ParticipantEntity | null> {
    return (
      [...this.participants.values()]
        .filter(
          (participant) =>
            participant.sessionId === sessionId && participant.isPrimaryCandidate,
        )
        .sort((left, right) => right.roleConfidence - left.roleConfidence)[0] ?? null
    );
  }

  async listBySessionId(sessionId: string): Promise<readonly ParticipantEntity[]> {
    return [...this.participants.values()].filter(
      (participant) => participant.sessionId === sessionId,
    );
  }

  async listBySessionIdAndRoles(
    sessionId: string,
    roles: readonly ParticipantRole[],
  ): Promise<readonly ParticipantEntity[]> {
    return [...this.participants.values()].filter(
      (participant) =>
        participant.sessionId === sessionId && roles.includes(participant.role),
    );
  }

  async save(participant: ParticipantEntity): Promise<void> {
    this.participants.set(participant.id, participant);
  }
}

export class InMemoryParticipantPresenceRepository
  implements ParticipantPresenceRepository
{
  private readonly presences = new Map<string, ParticipantPresenceEntity>();

  async listByParticipantId(
    participantId: string,
  ): Promise<readonly ParticipantPresenceEntity[]> {
    return [...this.presences.values()].filter(
      (presence) => presence.participantId === participantId,
    );
  }

  async listBySessionId(
    sessionId: string,
  ): Promise<readonly ParticipantPresenceEntity[]> {
    return [...this.presences.values()].filter(
      (presence) => presence.sessionId === sessionId,
    );
  }

  async save(presence: ParticipantPresenceEntity): Promise<void> {
    this.presences.set(presence.id, presence);
  }
}

export class InMemoryQuestionAnnotationRepository
  implements QuestionAnnotationRepository
{
  private readonly annotations = new Map<string, QuestionAnnotationEntity>();

  async listByChunkId(chunkId: string): Promise<readonly QuestionAnnotationEntity[]> {
    return [...this.annotations.values()].filter(
      (annotation) => annotation.chunkId === chunkId,
    );
  }

  async listBySessionId(
    sessionId: string,
  ): Promise<readonly QuestionAnnotationEntity[]> {
    return [...this.annotations.values()].filter(
      (annotation) => annotation.sessionId === sessionId,
    );
  }

  async save(annotation: QuestionAnnotationEntity): Promise<void> {
    this.annotations.set(annotation.id, annotation);
  }
}

export class InMemoryParticipantBaselineRepository
  implements ParticipantBaselineRepository
{
  private readonly baselines = new Map<string, ParticipantBaselineEntity>();

  async findLatestByParticipantIdAndScope(input: {
    readonly participantId: string;
    readonly scope: ParticipantBaselineEntity["scope"];
  }): Promise<ParticipantBaselineEntity | null> {
    return (
      [...this.baselines.values()]
        .filter(
          (baseline) =>
            baseline.participantId === input.participantId &&
            baseline.scope === input.scope,
        )
        .sort((left, right) => right.windowEndAt.localeCompare(left.windowEndAt))[0] ??
      null
    );
  }

  async listByParticipantId(
    participantId: string,
  ): Promise<readonly ParticipantBaselineEntity[]> {
    return [...this.baselines.values()].filter(
      (baseline) => baseline.participantId === participantId,
    );
  }

  async listBySessionId(
    sessionId: string,
  ): Promise<readonly ParticipantBaselineEntity[]> {
    return [...this.baselines.values()].filter(
      (baseline) => baseline.sessionId === sessionId,
    );
  }

  async save(baseline: ParticipantBaselineEntity): Promise<void> {
    this.baselines.set(baseline.id, baseline);
  }
}

export class InMemoryPipelineTransactionManager implements PipelineTransactionManager {
  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly mediaChunkRepository: MediaChunkRepository,
    private readonly participantRepository: ParticipantRepository,
    private readonly participantPresenceRepository: ParticipantPresenceRepository,
    private readonly questionAnnotationRepository: QuestionAnnotationRepository,
    private readonly participantBaselineRepository: ParticipantBaselineRepository,
    private readonly pipelineEventRepository: PipelineEventRepository,
    private readonly pipelineStageRunRepository: PipelineStageRunRepository,
  ) {}

  async withTransaction<T>(
    callback: (scope: {
      readonly mediaChunkRepository: MediaChunkRepository;
      readonly participantBaselineRepository: ParticipantBaselineRepository;
      readonly participantPresenceRepository: ParticipantPresenceRepository;
      readonly participantRepository: ParticipantRepository;
      readonly pipelineEventRepository: PipelineEventRepository;
      readonly pipelineStageRunRepository: PipelineStageRunRepository;
      readonly questionAnnotationRepository: QuestionAnnotationRepository;
      readonly sessionRepository: SessionRepository;
    }) => Promise<T>,
  ): Promise<T> {
    return callback({
      mediaChunkRepository: this.mediaChunkRepository,
      participantBaselineRepository: this.participantBaselineRepository,
      participantPresenceRepository: this.participantPresenceRepository,
      participantRepository: this.participantRepository,
      pipelineEventRepository: this.pipelineEventRepository,
      pipelineStageRunRepository: this.pipelineStageRunRepository,
      questionAnnotationRepository: this.questionAnnotationRepository,
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
