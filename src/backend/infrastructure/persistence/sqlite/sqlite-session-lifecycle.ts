import { asc, eq, inArray } from "drizzle-orm";
import type { SQLInputValue } from "node:sqlite";

import type {
  MediaChunkRepository,
  SessionRepository,
  SessionStorageLayoutResolver,
} from "../../../application/ports/session-lifecycle";
import type { MediaChunkStatus, SessionStatus } from "../../../../shared";
import type { MediaChunkEntity } from "../../../domain/capture/media-chunk";
import type { SessionEntity } from "../../../domain/session/session";
import {
  mapMediaChunkEntityToRow,
  mapMediaChunkRowToEntity,
  mapSessionEntityToRow,
  mapSessionRowToEntity,
  type MediaChunkRow,
  type SessionRow,
} from "./session-lifecycle-mappers";
import { mediaChunkTable, sessionTable } from "./schema";
import type { SessionLifecycleDatabase } from "./sqlite-database";

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

export class SqliteSessionRepository implements SessionRepository {
  constructor(
    private readonly database: SessionLifecycleDatabase,
    private readonly storageLayoutResolver: SessionStorageLayoutResolver,
  ) {}

  async findById(sessionId: string): Promise<SessionEntity | null> {
    const query = this.database.drizzle
      .select()
      .from(sessionTable)
      .where(eq(sessionTable.id, sessionId))
      .toSQL();
    const row = executeGet<SessionRow>(this.database, query.sql, query.params);

    if (!row) {
      return null;
    }

    return mapSessionRowToEntity(row, this.storageLayoutResolver);
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<SessionEntity | null> {
    const query = this.database.drizzle
      .select()
      .from(sessionTable)
      .where(eq(sessionTable.idempotencyKey, idempotencyKey))
      .toSQL();
    const row = executeGet<SessionRow>(this.database, query.sql, query.params);

    if (!row) {
      return null;
    }

    return mapSessionRowToEntity(row, this.storageLayoutResolver);
  }

  async listByStatuses(
    statuses: readonly SessionStatus[],
  ): Promise<readonly SessionEntity[]> {
    if (statuses.length === 0) {
      return [];
    }

    const query = this.database.drizzle
      .select()
      .from(sessionTable)
      .where(inArray(sessionTable.status, [...statuses]))
      .orderBy(asc(sessionTable.startedAt))
      .toSQL();
    const rows = executeAll<SessionRow>(this.database, query.sql, query.params);

    return rows.map((row) =>
      mapSessionRowToEntity(row, this.storageLayoutResolver),
    );
  }

  async save(session: SessionEntity): Promise<void> {
    const row = mapSessionEntityToRow(session);

    const query = this.database.drizzle
      .insert(sessionTable)
      .values({
        id: row.id,
        status: row.status,
        captureSourcesJson: row.capture_sources_json,
        startedAt: row.started_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
        idempotencyKey: row.idempotency_key,
      })
      .onConflictDoUpdate({
        target: sessionTable.id,
        set: {
          status: row.status,
          captureSourcesJson: row.capture_sources_json,
          startedAt: row.started_at,
          updatedAt: row.updated_at,
          completedAt: row.completed_at,
          idempotencyKey: row.idempotency_key,
        },
      })
      .toSQL();

    executeRun(this.database, query.sql, query.params);
  }
}

export class SqliteMediaChunkRepository implements MediaChunkRepository {
  constructor(private readonly database: SessionLifecycleDatabase) {}

  async findById(chunkId: string): Promise<MediaChunkEntity | null> {
    const query = this.database.drizzle
      .select()
      .from(mediaChunkTable)
      .where(eq(mediaChunkTable.id, chunkId))
      .toSQL();
    const row = executeGet<MediaChunkRow>(this.database, query.sql, query.params);

    if (!row) {
      return null;
    }

    return mapMediaChunkRowToEntity(row);
  }

  async listBySessionId(
    sessionId: string,
  ): Promise<readonly MediaChunkEntity[]> {
    const query = this.database.drizzle
      .select()
      .from(mediaChunkTable)
      .where(eq(mediaChunkTable.sessionId, sessionId))
      .orderBy(asc(mediaChunkTable.createdAt))
      .toSQL();
    const rows = executeAll<MediaChunkRow>(this.database, query.sql, query.params);

    return rows.map((row) => mapMediaChunkRowToEntity(row));
  }

  async listByStatuses(
    statuses: readonly MediaChunkStatus[],
  ): Promise<readonly MediaChunkEntity[]> {
    if (statuses.length === 0) {
      return [];
    }

    const query = this.database.drizzle
      .select()
      .from(mediaChunkTable)
      .where(inArray(mediaChunkTable.status, [...statuses]))
      .orderBy(asc(mediaChunkTable.createdAt))
      .toSQL();
    const rows = executeAll<MediaChunkRow>(this.database, query.sql, query.params);

    return rows.map((row) => mapMediaChunkRowToEntity(row));
  }

  async save(chunk: MediaChunkEntity): Promise<void> {
    const row = mapMediaChunkEntityToRow(chunk);

    const query = this.database.drizzle
      .insert(mediaChunkTable)
      .values({
        id: row.id,
        sessionId: row.session_id,
        source: row.source,
        status: row.status,
        relativePath: row.relative_path,
        recordedAt: row.recorded_at,
        byteSize: row.byte_size,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
      .onConflictDoUpdate({
        target: mediaChunkTable.id,
        set: {
          sessionId: row.session_id,
          source: row.source,
          status: row.status,
          relativePath: row.relative_path,
          recordedAt: row.recorded_at,
          byteSize: row.byte_size,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      })
      .toSQL();

    executeRun(this.database, query.sql, query.params);
  }
}
