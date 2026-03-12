import type { MediaChunkRepository, SessionRepository } from "../../application/ports/session-lifecycle";
import type { MediaChunkStatus, SessionStatus } from "../../../shared";
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
