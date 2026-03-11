import type {
  MediaChunkSnapshot,
  MediaChunkSource,
  MediaChunkStatus,
} from "../../../shared/session-lifecycle";

export type MediaChunkEntity = {
  readonly id: string;
  readonly sessionId: string;
  readonly source: MediaChunkSource;
  readonly status: MediaChunkStatus;
  readonly relativePath: string;
  readonly recordedAt: string;
  readonly byteSize: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateMediaChunkEntityInput = {
  readonly id: string;
  readonly sessionId: string;
  readonly source: MediaChunkSource;
  readonly relativePath: string;
  readonly recordedAt: string;
  readonly byteSize: number;
  readonly createdAt: string;
};

export function createMediaChunkEntity(
  input: CreateMediaChunkEntityInput,
): MediaChunkEntity {
  return {
    id: input.id,
    sessionId: input.sessionId,
    source: input.source,
    status: "registered",
    relativePath: input.relativePath,
    recordedAt: input.recordedAt,
    byteSize: input.byteSize,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function toMediaChunkSnapshot(
  chunk: MediaChunkEntity,
): MediaChunkSnapshot {
  return {
    id: chunk.id,
    sessionId: chunk.sessionId,
    source: chunk.source,
    status: chunk.status,
    relativePath: chunk.relativePath,
    recordedAt: chunk.recordedAt,
    byteSize: chunk.byteSize,
    createdAt: chunk.createdAt,
    updatedAt: chunk.updatedAt,
  };
}
