import type {
  PipelineEventEnvelope,
  PipelineEventType,
  PipelineStageRunRecord,
  PipelineStageRunStatus,
} from "../../../shared";
import type { MediaChunkEntity } from "../../domain/capture/media-chunk";
import type { SessionEntity } from "../../domain/session/session";

import type {
  MediaChunkRepository,
  SessionRepository,
} from "./session-lifecycle";
import type {
  ParticipantBaselineRepository,
  ParticipantPresenceRepository,
  ParticipantRepository,
} from "./participant-repository";
import type { QuestionAnnotationRepository } from "./question-annotation-repository";

export type PipelineEventRepository = {
  append(event: PipelineEventEnvelope): Promise<void>;
  findById(eventId: string): Promise<PipelineEventEnvelope | null>;
  listBySessionId(sessionId: string): Promise<readonly PipelineEventEnvelope[]>;
  listByEventTypes(
    sessionId: string,
    eventTypes: readonly PipelineEventType[],
  ): Promise<readonly PipelineEventEnvelope[]>;
};

export type PipelineStageRunRepository = {
  findById(runId: string): Promise<PipelineStageRunRecord | null>;
  findByEventId(eventId: string): Promise<PipelineStageRunRecord | null>;
  listByStatuses(
    statuses: readonly PipelineStageRunStatus[],
  ): Promise<readonly PipelineStageRunRecord[]>;
  claimNextRunnable(input: {
    readonly now: string;
    readonly leaseUntil: string;
  }): Promise<PipelineStageRunRecord | null>;
  save(stageRun: PipelineStageRunRecord): Promise<void>;
};

export type PipelineTransactionScope = {
  readonly mediaChunkRepository: MediaChunkRepository;
  readonly participantBaselineRepository: ParticipantBaselineRepository;
  readonly participantPresenceRepository: ParticipantPresenceRepository;
  readonly participantRepository: ParticipantRepository;
  readonly pipelineEventRepository: PipelineEventRepository;
  readonly pipelineStageRunRepository: PipelineStageRunRepository;
  readonly questionAnnotationRepository: QuestionAnnotationRepository;
  readonly sessionRepository: SessionRepository;
};

export type PipelineTransactionManager = {
  withTransaction<T>(
    callback: (scope: PipelineTransactionScope) => Promise<T>,
  ): Promise<T>;
};

export type PipelineAggregateWriter = {
  saveMediaChunkRegistration(input: {
    readonly chunk: MediaChunkEntity;
    readonly events: readonly PipelineEventEnvelope[];
    readonly stageRuns: readonly PipelineStageRunRecord[];
  }): Promise<void>;
  saveSessionUpdate(input: {
    readonly session: SessionEntity;
    readonly events: readonly PipelineEventEnvelope[];
    readonly stageRuns: readonly PipelineStageRunRecord[];
  }): Promise<void>;
};
