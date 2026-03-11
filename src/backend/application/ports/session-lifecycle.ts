import type { SessionStorageLayout } from "../../../shared/session-lifecycle";
import type { MediaChunkEntity } from "../../domain/capture/media-chunk";
import type { SessionEntity } from "../../domain/session/session";

export type SessionRepository = {
  findById(sessionId: string): Promise<SessionEntity | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<SessionEntity | null>;
  save(session: SessionEntity): Promise<void>;
};

export type MediaChunkRepository = {
  findById(chunkId: string): Promise<MediaChunkEntity | null>;
  save(chunk: MediaChunkEntity): Promise<void>;
  listBySessionId(sessionId: string): Promise<readonly MediaChunkEntity[]>;
};

export type SessionStorageLayoutResolver = {
  resolveSessionLayout(sessionId: string): SessionStorageLayout;
  resolveAbsoluteArtifactPath(sessionId: string, relativePath: string): string;
};

export type FileSystemAccess = {
  ensureDirectory(path: string): Promise<void>;
  pathExists(path: string): Promise<boolean>;
};

export type Clock = {
  now(): Date;
};

export type IdGenerator = {
  createId(): string;
};
