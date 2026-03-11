import type {
  MediaChunkSource,
  SessionSnapshot,
  SessionStatus,
  SessionStorageLayout,
} from "../../../shared/session-lifecycle";

export type SessionEntity = {
  readonly id: string;
  readonly status: SessionStatus;
  readonly captureSources: readonly MediaChunkSource[];
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
  readonly idempotencyKey?: string;
  readonly storageLayout: SessionStorageLayout;
};

export type CreateSessionEntityInput = {
  readonly id: string;
  readonly captureSources: readonly MediaChunkSource[];
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly storageLayout: SessionStorageLayout;
  readonly idempotencyKey?: string;
};

export function createSessionEntity(
  input: CreateSessionEntityInput,
): SessionEntity {
  return {
    id: input.id,
    status: "active",
    captureSources: input.captureSources,
    startedAt: input.startedAt,
    updatedAt: input.updatedAt,
    idempotencyKey: input.idempotencyKey,
    storageLayout: input.storageLayout,
  };
}

export function beginSessionFinalization(
  session: SessionEntity,
  updatedAt: string,
): SessionEntity {
  if (session.status === "completed") {
    return session;
  }

  return {
    ...session,
    status: "finalizing",
    updatedAt,
  };
}

export function completeSession(
  session: SessionEntity,
  completedAt: string,
): SessionEntity {
  return {
    ...session,
    status: "completed",
    updatedAt: completedAt,
    completedAt,
  };
}

export function canFinalizeSession(session: SessionEntity): boolean {
  return session.status === "active" || session.status === "finalizing";
}

export function toSessionSnapshot(session: SessionEntity): SessionSnapshot {
  return {
    id: session.id,
    status: session.status,
    captureSources: session.captureSources,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt,
    idempotencyKey: session.idempotencyKey,
    storageLayout: session.storageLayout,
  };
}
