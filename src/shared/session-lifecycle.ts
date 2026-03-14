export const SESSION_STATUSES = [
  "pending",
  "active",
  "finalizing",
  "completed",
  "failed",
] as const;

export const MEDIA_CHUNK_SOURCES = [
  "microphone",
  "system-audio",
  "screen-video",
  "screenshot",
] as const;

export const MEDIA_CHUNK_STATUSES = [
  "registered",
  "queued",
  "processed",
  "failed",
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type MediaChunkSource = (typeof MEDIA_CHUNK_SOURCES)[number];
export type MediaChunkStatus = (typeof MEDIA_CHUNK_STATUSES)[number];

export type SessionStorageLayout = {
  readonly appDataRoot: string;
  readonly sessionRoot: string;
  readonly chunksRoot: string;
  readonly transcriptsRoot: string;
  readonly summariesRoot: string;
  readonly tempRoot: string;
};

export type SessionSnapshot = {
  readonly id: string;
  readonly status: SessionStatus;
  readonly captureSources: readonly MediaChunkSource[];
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
  readonly idempotencyKey?: string;
  readonly storageLayout: SessionStorageLayout;
};

export type MediaChunkSnapshot = {
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

export type StartSessionRequest = {
  readonly sessionId?: string;
  readonly captureSources: readonly MediaChunkSource[];
  readonly idempotencyKey?: string;
};

export type StartSessionResponse = {
  readonly session: SessionSnapshot;
};

export type RegisterMediaChunkRequest = {
  readonly sessionId: string;
  readonly chunkId: string;
  readonly source: MediaChunkSource;
  readonly relativePath: string;
  readonly recordedAt: string;
  readonly byteSize: number;
};

export type RegisterMediaChunkResponse = {
  readonly chunk: MediaChunkSnapshot;
};

export type FinalizeSessionRequest = {
  readonly sessionId: string;
};

export type FinalizeSessionResponse = {
  readonly session: SessionSnapshot;
};

export type SessionLifecycleRecoveryIssue = {
  readonly code:
    | "missing-chunk-file"
    | "orphaned-artifact"
    | "finalization-interrupted";
  readonly message: string;
  readonly sessionId: string;
  readonly chunkId?: string;
};

export type Unsubscribe = () => void;

export type SessionLifecycleBridge = {
  startSession(request: StartSessionRequest): Promise<StartSessionResponse>;
  registerMediaChunk(
    request: RegisterMediaChunkRequest,
  ): Promise<RegisterMediaChunkResponse>;
  finalizeSession(
    request: FinalizeSessionRequest,
  ): Promise<FinalizeSessionResponse>;
};

export type SessionLifecycleEventsBridge = {
  onSessionChanged(listener: (session: SessionSnapshot) => void): Unsubscribe;
  onChunkRegistered(listener: (chunk: MediaChunkSnapshot) => void): Unsubscribe;
  onSessionFinalized(listener: (session: SessionSnapshot) => void): Unsubscribe;
  onRecoveryIssue(
    listener: (issue: SessionLifecycleRecoveryIssue) => void,
  ): Unsubscribe;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isMediaChunkSource(value: unknown): value is MediaChunkSource {
  return (
    typeof value === "string" &&
    MEDIA_CHUNK_SOURCES.includes(value as MediaChunkSource)
  );
}

function parseOptionalString(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isNonEmptyString(value)) {
    throw new Error(`${fieldName} must be a non-empty string when provided`);
  }

  return value.trim();
}

export function parseStartSessionRequest(input: unknown): StartSessionRequest {
  if (!isRecord(input)) {
    throw new Error("startSession request must be an object");
  }

  const captureSources = input.captureSources;

  if (!Array.isArray(captureSources) || captureSources.length === 0) {
    throw new Error("startSession requires at least one capture source");
  }

  if (!captureSources.every(isMediaChunkSource)) {
    throw new Error(
      "startSession captureSources contains an unsupported source",
    );
  }

  return {
    sessionId: parseOptionalString(input.sessionId, "sessionId"),
    captureSources,
    idempotencyKey: parseOptionalString(input.idempotencyKey, "idempotencyKey"),
  };
}

export function parseRegisterMediaChunkRequest(
  input: unknown,
): RegisterMediaChunkRequest {
  if (!isRecord(input)) {
    throw new Error("registerMediaChunk request must be an object");
  }

  const sessionId = input.sessionId;
  const chunkId = input.chunkId;
  const source = input.source;
  const relativePath = input.relativePath;
  const recordedAt = input.recordedAt;
  const byteSize = input.byteSize;

  if (!isNonEmptyString(sessionId)) {
    throw new Error("registerMediaChunk requires sessionId");
  }

  if (!isNonEmptyString(chunkId)) {
    throw new Error("registerMediaChunk requires chunkId");
  }

  if (!isMediaChunkSource(source)) {
    throw new Error("registerMediaChunk requires a supported source");
  }

  if (!isNonEmptyString(relativePath)) {
    throw new Error("registerMediaChunk requires relativePath");
  }

  if (!isNonEmptyString(recordedAt)) {
    throw new Error("registerMediaChunk requires recordedAt");
  }

  if (typeof byteSize !== "number" || Number.isNaN(byteSize) || byteSize < 0) {
    throw new Error("registerMediaChunk requires a non-negative byteSize");
  }

  return {
    sessionId: sessionId.trim(),
    chunkId: chunkId.trim(),
    source,
    relativePath: relativePath.trim(),
    recordedAt: recordedAt.trim(),
    byteSize,
  };
}

export function parseFinalizeSessionRequest(
  input: unknown,
): FinalizeSessionRequest {
  if (!isRecord(input)) {
    throw new Error("finalizeSession request must be an object");
  }

  const sessionId = input.sessionId;

  if (!isNonEmptyString(sessionId)) {
    throw new Error("finalizeSession requires sessionId");
  }

  return {
    sessionId: sessionId.trim(),
  };
}
