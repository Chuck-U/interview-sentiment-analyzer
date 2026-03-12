import type { MediaChunkEntity } from "../../../domain/capture/media-chunk";
import type { SessionEntity } from "../../../domain/session/session";
import type { SessionStorageLayoutResolver } from "../../../application/ports/session-lifecycle";

export type SessionRow = {
  id: string;
  status: SessionEntity["status"];
  capture_sources_json: string;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  idempotency_key: string | null;
};

export type MediaChunkRow = {
  id: string;
  session_id: string;
  source: MediaChunkEntity["source"];
  status: MediaChunkEntity["status"];
  relative_path: string;
  recorded_at: string;
  byte_size: number;
  created_at: string;
  updated_at: string;
};

function parseCaptureSources(captureSourcesJson: string): SessionEntity["captureSources"] {
  return JSON.parse(captureSourcesJson) as SessionEntity["captureSources"];
}

export function mapSessionEntityToRow(session: SessionEntity): SessionRow {
  return {
    id: session.id,
    status: session.status,
    capture_sources_json: JSON.stringify(session.captureSources),
    started_at: session.startedAt,
    updated_at: session.updatedAt,
    completed_at: session.completedAt ?? null,
    idempotency_key: session.idempotencyKey ?? null,
  };
}

export function mapSessionRowToEntity(
  row: SessionRow,
  storageLayoutResolver: SessionStorageLayoutResolver,
): SessionEntity {
  return {
    id: row.id,
    status: row.status,
    captureSources: parseCaptureSources(row.capture_sources_json),
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    idempotencyKey: row.idempotency_key ?? undefined,
    storageLayout: storageLayoutResolver.resolveSessionLayout(row.id),
  };
}

export function mapMediaChunkEntityToRow(chunk: MediaChunkEntity): MediaChunkRow {
  return {
    id: chunk.id,
    session_id: chunk.sessionId,
    source: chunk.source,
    status: chunk.status,
    relative_path: chunk.relativePath,
    recorded_at: chunk.recordedAt,
    byte_size: chunk.byteSize,
    created_at: chunk.createdAt,
    updated_at: chunk.updatedAt,
  };
}

export function mapMediaChunkRowToEntity(row: MediaChunkRow): MediaChunkEntity {
  return {
    id: row.id,
    sessionId: row.session_id,
    source: row.source,
    status: row.status,
    relativePath: row.relative_path,
    recordedAt: row.recorded_at,
    byteSize: row.byte_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
