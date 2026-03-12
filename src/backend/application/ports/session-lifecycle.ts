import type {
  MediaChunkSource,
  MediaChunkStatus,
  SessionStatus,
  SessionStorageLayout,
} from "../../../shared/session-lifecycle";
import type { MediaChunkEntity } from "../../domain/capture/media-chunk";
import type { SessionEntity } from "../../domain/session/session";

export type SessionRepository = {
  findById(sessionId: string): Promise<SessionEntity | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<SessionEntity | null>;
  listByStatuses(
    statuses: readonly SessionStatus[],
  ): Promise<readonly SessionEntity[]>;
  save(session: SessionEntity): Promise<void>;
};

export type MediaChunkRepository = {
  findById(chunkId: string): Promise<MediaChunkEntity | null>;
  listBySessionId(sessionId: string): Promise<readonly MediaChunkEntity[]>;
  listByStatuses(
    statuses: readonly MediaChunkStatus[],
  ): Promise<readonly MediaChunkEntity[]>;
  save(chunk: MediaChunkEntity): Promise<void>;
};

export type SessionStorageLayoutResolver = {
  resolveSessionLayout(sessionId: string): SessionStorageLayout;
  normalizeRelativeArtifactPath(
    source: MediaChunkSource,
    relativePath: string,
  ): string;
  resolveAbsoluteArtifactPath(sessionId: string, relativePath: string): string;
};

export type FileMetadata = {
  readonly byteSize: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type FileSystemAccess = {
  ensureDirectory(path: string): Promise<void>;
  listFiles(path: string): Promise<readonly string[]>;
  pathExists(path: string): Promise<boolean>;
  readFileMetadata(path: string): Promise<FileMetadata>;
};

export type Clock = {
  now(): Date;
};

export type IdGenerator = {
  createId(): string;
};

export type SessionLifecycleEventPublisher = {
  publishChunkRegistered(chunk: MediaChunkEntity): void;
  publishRecoveryIssue(issue: {
    readonly code:
      | "missing-chunk-file"
      | "orphaned-artifact"
      | "finalization-interrupted";
    readonly message: string;
    readonly sessionId: string;
    readonly chunkId?: string;
  }): void;
  publishSessionFinalized(session: SessionEntity): void;
  publishSessionChanged(session: SessionEntity): void;
};
