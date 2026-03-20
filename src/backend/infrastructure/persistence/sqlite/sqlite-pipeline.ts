import type { SQLInputValue } from "node:sqlite";

import type {
  PipelineAggregateWriter,
  PipelineEventRepository,
  PipelineStageRunRepository,
  PipelineTransactionManager,
  PipelineTransactionScope,
} from "../../../application/ports/pipeline";
import type {
  MediaChunkRepository,
  SessionRepository,
} from "../../../application/ports/session-lifecycle";
import type {
  ParticipantBaselineRepository,
  ParticipantPresenceRepository,
  ParticipantRepository,
} from "../../../application/ports/participant-repository";
import type { QuestionAnnotationRepository } from "../../../application/ports/question-annotation-repository";
import type {
  PipelineEventEnvelope,
  PipelineEventType,
  PipelineStageRunRecord,
  PipelineStageRunStatus,
} from "../../../../shared";
import {
  createPipelineEventEnvelope,
  normalizePipelineStageRun,
} from "../../../../shared";
import type { MediaChunkEntity } from "../../../domain/capture/media-chunk";
import type { SessionEntity } from "../../../domain/session/session";

import type { SessionLifecycleDatabase } from "./sqlite-database";

type PipelineEventRow = {
  readonly causation_id: string | null;
  readonly chunk_id: string | null;
  readonly correlation_id: string;
  readonly event_id: string;
  readonly event_type: PipelineEventType;
  readonly occurred_at: string;
  readonly payload_json: string;
  readonly payload_schema_version: number;
  readonly schema_version: number;
  readonly session_id: string;
  readonly stage_name: PipelineEventEnvelope["stageName"] | null;
};

type PipelineStageRunRow = {
  readonly attempt: number;
  readonly chunk_id: string | null;
  readonly completed_at: string | null;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly event_id: string;
  readonly input_artifacts_json: string;
  readonly leased_until: string | null;
  readonly output_artifacts_json: string;
  readonly queued_at: string;
  readonly run_id: string;
  readonly session_id: string;
  readonly stage_name: PipelineStageRunRecord["stageName"];
  readonly started_at: string | null;
  readonly status: PipelineStageRunStatus;
  readonly updated_at: string;
};

function executeGet<T>(
  database: SessionLifecycleDatabase,
  statementSql: string,
  params: readonly unknown[],
): T | undefined {
  return database.sqlite
    .prepare(statementSql)
    .get(...(params as SQLInputValue[])) as T | undefined;
}

function executeAll<T>(
  database: SessionLifecycleDatabase,
  statementSql: string,
  params: readonly unknown[],
): T[] {
  return database.sqlite
    .prepare(statementSql)
    .all(...(params as SQLInputValue[])) as T[];
}

function executeRun(
  database: SessionLifecycleDatabase,
  statementSql: string,
  params: readonly unknown[],
): void {
  database.sqlite.prepare(statementSql).run(...(params as SQLInputValue[]));
}

function mapPipelineEventRowToEnvelope(
  row: PipelineEventRow,
): PipelineEventEnvelope {
  return createPipelineEventEnvelope({
    eventId: row.event_id,
    eventType: row.event_type,
    sessionId: row.session_id,
    chunkId: row.chunk_id ?? undefined,
    stageName: row.stage_name ?? undefined,
    causationId: row.causation_id ?? undefined,
    correlationId: row.correlation_id,
    occurredAt: row.occurred_at,
    payload: JSON.parse(row.payload_json) as PipelineEventEnvelope["payload"],
  });
}

function mapPipelineStageRunRowToRecord(
  row: PipelineStageRunRow,
): PipelineStageRunRecord {
  return normalizePipelineStageRun({
    runId: row.run_id,
    eventId: row.event_id,
    sessionId: row.session_id,
    chunkId: row.chunk_id ?? undefined,
    stageName: row.stage_name,
    status: row.status,
    attempt: row.attempt,
    leasedUntil: row.leased_until ?? undefined,
    inputArtifacts: JSON.parse(row.input_artifacts_json) as PipelineStageRunRecord["inputArtifacts"],
    outputArtifacts: JSON.parse(row.output_artifacts_json) as PipelineStageRunRecord["outputArtifacts"],
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    queuedAt: row.queued_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    updatedAt: row.updated_at,
  });
}

export class SqlitePipelineEventRepository implements PipelineEventRepository {
  constructor(private readonly database: SessionLifecycleDatabase) {}

  async append(event: PipelineEventEnvelope): Promise<void> {
    executeRun(
      this.database,
      `
        INSERT INTO pipeline_event (
          event_id,
          event_type,
          schema_version,
          session_id,
          chunk_id,
          stage_name,
          causation_id,
          correlation_id,
          occurred_at,
          payload_json,
          payload_schema_version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        event.eventId,
        event.eventType,
        event.schemaVersion,
        event.sessionId,
        event.chunkId ?? null,
        event.stageName ?? null,
        event.causationId ?? null,
        event.correlationId,
        event.occurredAt,
        JSON.stringify(event.payload),
        event.payloadSchemaVersion,
      ],
    );
  }

  async findById(eventId: string): Promise<PipelineEventEnvelope | null> {
    const row = executeGet<PipelineEventRow>(
      this.database,
      `
        SELECT
          event_id,
          event_type,
          schema_version,
          session_id,
          chunk_id,
          stage_name,
          causation_id,
          correlation_id,
          occurred_at,
          payload_json,
          payload_schema_version
        FROM pipeline_event
        WHERE event_id = ?
      `,
      [eventId],
    );

    return row ? mapPipelineEventRowToEnvelope(row) : null;
  }

  async listBySessionId(
    sessionId: string,
  ): Promise<readonly PipelineEventEnvelope[]> {
    const rows = executeAll<PipelineEventRow>(
      this.database,
      `
        SELECT
          event_id,
          event_type,
          schema_version,
          session_id,
          chunk_id,
          stage_name,
          causation_id,
          correlation_id,
          occurred_at,
          payload_json,
          payload_schema_version
        FROM pipeline_event
        WHERE session_id = ?
        ORDER BY occurred_at ASC, event_id ASC
      `,
      [sessionId],
    );

    return rows.map((row) => mapPipelineEventRowToEnvelope(row));
  }

  async listByEventTypes(
    sessionId: string,
    eventTypes: readonly PipelineEventType[],
  ): Promise<readonly PipelineEventEnvelope[]> {
    if (eventTypes.length === 0) {
      return [];
    }

    const placeholders = eventTypes.map(() => "?").join(", ");
    const rows = executeAll<PipelineEventRow>(
      this.database,
      `
        SELECT
          event_id,
          event_type,
          schema_version,
          session_id,
          chunk_id,
          stage_name,
          causation_id,
          correlation_id,
          occurred_at,
          payload_json,
          payload_schema_version
        FROM pipeline_event
        WHERE session_id = ?
          AND event_type IN (${placeholders})
        ORDER BY occurred_at ASC, event_id ASC
      `,
      [sessionId, ...eventTypes],
    );

    return rows.map((row) => mapPipelineEventRowToEnvelope(row));
  }
}

export class SqlitePipelineStageRunRepository implements PipelineStageRunRepository {
  constructor(private readonly database: SessionLifecycleDatabase) {}

  async findById(runId: string): Promise<PipelineStageRunRecord | null> {
    const row = executeGet<PipelineStageRunRow>(
      this.database,
      `
        SELECT
          run_id,
          event_id,
          session_id,
          chunk_id,
          stage_name,
          status,
          attempt,
          leased_until,
          input_artifacts_json,
          output_artifacts_json,
          error_code,
          error_message,
          queued_at,
          started_at,
          completed_at,
          updated_at
        FROM pipeline_stage_run
        WHERE run_id = ?
      `,
      [runId],
    );

    return row ? mapPipelineStageRunRowToRecord(row) : null;
  }

  async findByEventId(eventId: string): Promise<PipelineStageRunRecord | null> {
    const row = executeGet<PipelineStageRunRow>(
      this.database,
      `
        SELECT
          run_id,
          event_id,
          session_id,
          chunk_id,
          stage_name,
          status,
          attempt,
          leased_until,
          input_artifacts_json,
          output_artifacts_json,
          error_code,
          error_message,
          queued_at,
          started_at,
          completed_at,
          updated_at
        FROM pipeline_stage_run
        WHERE event_id = ?
      `,
      [eventId],
    );

    return row ? mapPipelineStageRunRowToRecord(row) : null;
  }

  async listByStatuses(
    statuses: readonly PipelineStageRunStatus[],
  ): Promise<readonly PipelineStageRunRecord[]> {
    if (statuses.length === 0) {
      return [];
    }

    const placeholders = statuses.map(() => "?").join(", ");
    const rows = executeAll<PipelineStageRunRow>(
      this.database,
      `
        SELECT
          run_id,
          event_id,
          session_id,
          chunk_id,
          stage_name,
          status,
          attempt,
          leased_until,
          input_artifacts_json,
          output_artifacts_json,
          error_code,
          error_message,
          queued_at,
          started_at,
          completed_at,
          updated_at
        FROM pipeline_stage_run
        WHERE status IN (${placeholders})
        ORDER BY queued_at ASC, run_id ASC
      `,
      [...statuses],
    );

    return rows.map((row) => mapPipelineStageRunRowToRecord(row));
  }

  async claimNextRunnable(input: {
    readonly now: string;
    readonly leaseUntil: string;
  }): Promise<PipelineStageRunRecord | null> {
    this.database.sqlite.exec("BEGIN IMMEDIATE TRANSACTION");

    try {
      const row = executeGet<PipelineStageRunRow>(
        this.database,
        `
          SELECT
            run_id,
            event_id,
            session_id,
            chunk_id,
            stage_name,
            status,
            attempt,
            leased_until,
            input_artifacts_json,
            output_artifacts_json,
            error_code,
            error_message,
            queued_at,
            started_at,
            completed_at,
            updated_at
          FROM pipeline_stage_run
          WHERE status = 'queued'
             OR (status = 'running' AND leased_until IS NOT NULL AND leased_until <= ?)
          ORDER BY queued_at ASC, run_id ASC
          LIMIT 1
        `,
        [input.now],
      );

      if (!row) {
        this.database.sqlite.exec("COMMIT");
        return null;
      }

      const claimedRun = mapPipelineStageRunRowToRecord(row);
      const updatedRun = normalizePipelineStageRun({
        ...claimedRun,
        status: "running",
        attempt: claimedRun.attempt + 1,
        leasedUntil: input.leaseUntil,
        startedAt: claimedRun.startedAt ?? input.now,
        updatedAt: input.now,
      });

      await this.save(updatedRun);
      this.database.sqlite.exec("COMMIT");

      return updatedRun;
    } catch (error) {
      this.database.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  async save(stageRun: PipelineStageRunRecord): Promise<void> {
    executeRun(
      this.database,
      `
        INSERT INTO pipeline_stage_run (
          run_id,
          event_id,
          session_id,
          chunk_id,
          stage_name,
          status,
          attempt,
          leased_until,
          input_artifacts_json,
          output_artifacts_json,
          error_code,
          error_message,
          queued_at,
          started_at,
          completed_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET
          event_id = excluded.event_id,
          session_id = excluded.session_id,
          chunk_id = excluded.chunk_id,
          stage_name = excluded.stage_name,
          status = excluded.status,
          attempt = excluded.attempt,
          leased_until = excluded.leased_until,
          input_artifacts_json = excluded.input_artifacts_json,
          output_artifacts_json = excluded.output_artifacts_json,
          error_code = excluded.error_code,
          error_message = excluded.error_message,
          queued_at = excluded.queued_at,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          updated_at = excluded.updated_at
      `,
      [
        stageRun.runId,
        stageRun.eventId,
        stageRun.sessionId,
        stageRun.chunkId ?? null,
        stageRun.stageName,
        stageRun.status,
        stageRun.attempt,
        stageRun.leasedUntil ?? null,
        JSON.stringify(stageRun.inputArtifacts),
        JSON.stringify(stageRun.outputArtifacts),
        stageRun.errorCode ?? null,
        stageRun.errorMessage ?? null,
        stageRun.queuedAt,
        stageRun.startedAt ?? null,
        stageRun.completedAt ?? null,
        stageRun.updatedAt,
      ],
    );
  }
}

export class SqlitePipelineTransactionManager implements PipelineTransactionManager {
  constructor(
    private readonly database: SessionLifecycleDatabase,
    private readonly scope: PipelineTransactionScope,
  ) {}

  async withTransaction<T>(
    callback: (scope: PipelineTransactionScope) => Promise<T>,
  ): Promise<T> {
    this.database.sqlite.exec("BEGIN IMMEDIATE TRANSACTION");

    try {
      const result = await callback(this.scope);
      this.database.sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

export class SqlitePipelineAggregateWriter implements PipelineAggregateWriter {
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

export type SqlitePipelineScope = {
  readonly mediaChunkRepository: MediaChunkRepository;
  readonly participantBaselineRepository: ParticipantBaselineRepository;
  readonly participantPresenceRepository: ParticipantPresenceRepository;
  readonly participantRepository: ParticipantRepository;
  readonly pipelineEventRepository: PipelineEventRepository;
  readonly pipelineStageRunRepository: PipelineStageRunRepository;
  readonly questionAnnotationRepository: QuestionAnnotationRepository;
  readonly sessionRepository: SessionRepository;
};

export function createSqlitePipelineScope(
  database: SessionLifecycleDatabase,
  scope: SqlitePipelineScope,
): {
  readonly aggregateWriter: SqlitePipelineAggregateWriter;
  readonly transactionManager: SqlitePipelineTransactionManager;
} {
  const transactionManager = new SqlitePipelineTransactionManager(
    database,
    scope,
  );

  return {
    aggregateWriter: new SqlitePipelineAggregateWriter(transactionManager),
    transactionManager,
  };
}
