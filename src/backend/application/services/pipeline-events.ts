import type {
  PipelineArtifactKind,
  PipelineArtifactRef,
  PipelineEventEnvelope,
  PipelineExecutableStageName,
  PipelineSessionGraphState,
  PipelineStageRunRecord,
} from "../../../shared";
import {
  createPipelineEventEnvelope,
  isPipelineExecutableStageName,
} from "../../../shared";
import type { MediaChunkEntity } from "../../domain/capture/media-chunk";

type PipelineArtifactsPayload = {
  readonly inputArtifacts: readonly PipelineArtifactRef[];
  readonly outputArtifacts: readonly PipelineArtifactRef[];
};

function toArtifactsPayload(
  event: PipelineEventEnvelope,
): PipelineArtifactsPayload {
  return event.payload as PipelineArtifactsPayload;
}

export function createMediaChunkArtifactRef(
  chunk: MediaChunkEntity,
): PipelineArtifactRef<"media-chunk"> {
  return {
    artifactId: chunk.id,
    artifactKind: "media-chunk",
    relativePath: chunk.relativePath,
    byteSize: chunk.byteSize,
    createdAt: chunk.createdAt,
    metadata: {
      recordedAt: chunk.recordedAt,
      source: chunk.source,
    },
  };
}

export function createChunkRegisteredEvent(input: {
  readonly chunk: MediaChunkEntity;
  readonly correlationId: string;
  readonly eventId: string;
  readonly occurredAt: string;
}): PipelineEventEnvelope<"chunk.registered"> {
  return createPipelineEventEnvelope({
    eventId: input.eventId,
    eventType: "chunk.registered",
    sessionId: input.chunk.sessionId,
    chunkId: input.chunk.id,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
    payload: {
      chunkId: input.chunk.id,
      source: input.chunk.source,
      recordedAt: input.chunk.recordedAt,
      registeredAt: input.occurredAt,
      byteSize: input.chunk.byteSize,
      inputArtifacts: [],
      outputArtifacts: [createMediaChunkArtifactRef(input.chunk)],
    },
  });
}

export function createTranscribeChunkRequestedEvent(input: {
  readonly causationId: string;
  readonly chunk: MediaChunkEntity;
  readonly correlationId: string;
  readonly eventId: string;
  readonly occurredAt: string;
}): PipelineEventEnvelope<"transcribe_chunk.requested"> {
  return createPipelineEventEnvelope({
    eventId: input.eventId,
    eventType: "transcribe_chunk.requested",
    sessionId: input.chunk.sessionId,
    chunkId: input.chunk.id,
    causationId: input.causationId,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
    payload: {
      chunkId: input.chunk.id,
      requestedAt: input.occurredAt,
      inputArtifacts: [createMediaChunkArtifactRef(input.chunk)],
      outputArtifacts: [],
    },
  });
}

export function createSessionFinalizationRequestedEvent(input: {
  readonly causationId?: string;
  readonly correlationId: string;
  readonly eventId: string;
  readonly inputArtifacts: readonly PipelineArtifactRef[];
  readonly occurredAt: string;
  readonly requestedBy: "recovery" | "user";
  readonly sessionId: string;
}): PipelineEventEnvelope<"session.finalization.requested"> {
  return createPipelineEventEnvelope({
    eventId: input.eventId,
    eventType: "session.finalization.requested",
    sessionId: input.sessionId,
    causationId: input.causationId,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
    payload: {
      requestedAt: input.occurredAt,
      requestedBy: input.requestedBy,
      inputArtifacts: [...input.inputArtifacts],
      outputArtifacts: [],
    },
  });
}

export function createSessionSummaryRequestedEvent(input: {
  readonly causationId: string;
  readonly correlationId: string;
  readonly eventId: string;
  readonly inputArtifacts: readonly PipelineArtifactRef[];
  readonly occurredAt: string;
  readonly sessionId: string;
}): PipelineEventEnvelope<"session.summary.requested"> {
  return createPipelineEventEnvelope({
    eventId: input.eventId,
    eventType: "session.summary.requested",
    sessionId: input.sessionId,
    causationId: input.causationId,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
    payload: {
      requestedAt: input.occurredAt,
      inputArtifacts: [...input.inputArtifacts],
      outputArtifacts: [],
    },
  });
}

export function createLiveAnswerRelevanceRequestedEvent(input: {
  readonly sessionId: string;
  readonly chunkId: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly occurredAt: string;
  readonly evaluationCorrelationId: string;
  readonly activeQuestionText: string;
  readonly answerWindowText: string;
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
  readonly micChunkIds: readonly string[];
  readonly graphState?: PipelineSessionGraphState;
}): PipelineEventEnvelope<"live_answer_relevance.requested"> {
  return createPipelineEventEnvelope({
    eventId: input.eventId,
    eventType: "live_answer_relevance.requested",
    sessionId: input.sessionId,
    chunkId: input.chunkId,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
    payload: {
      inputArtifacts: [],
      outputArtifacts: [],
      ...(input.graphState !== undefined ? { graphState: input.graphState } : {}),
      requestedAt: input.occurredAt,
      activeQuestionText: input.activeQuestionText,
      answerWindowText: input.answerWindowText,
      windowStartedAt: input.windowStartedAt,
      windowEndedAt: input.windowEndedAt,
      micChunkIds: [...input.micChunkIds],
      evaluationCorrelationId: input.evaluationCorrelationId,
    },
  });
}

export function createLiveAnswerRelevanceReadyEvent(input: {
  readonly sessionId: string;
  readonly chunkId: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly occurredAt: string;
  readonly evaluationCorrelationId: string;
  readonly onTopic: boolean;
  readonly offTopicPoints: readonly string[];
  readonly relevanceScore?: number;
  readonly offTopicSignal?: number;
  readonly streakCount?: number;
  readonly modelId?: string;
  readonly providerRequestId?: string;
  readonly usage?: {
    readonly promptTokens?: number;
    readonly completionTokens?: number;
    readonly cachedTokens?: number;
  };
  readonly graphState?: PipelineSessionGraphState;
}): PipelineEventEnvelope<"live_answer_relevance.ready"> {
  return createPipelineEventEnvelope({
    eventId: input.eventId,
    eventType: "live_answer_relevance.ready",
    sessionId: input.sessionId,
    chunkId: input.chunkId,
    correlationId: input.correlationId,
    occurredAt: input.occurredAt,
    payload: {
      inputArtifacts: [],
      outputArtifacts: [],
      ...(input.graphState !== undefined ? { graphState: input.graphState } : {}),
      completedAt: input.occurredAt,
      onTopic: input.onTopic,
      offTopicPoints: [...input.offTopicPoints],
      evaluationCorrelationId: input.evaluationCorrelationId,
      ...(input.relevanceScore !== undefined ? { relevanceScore: input.relevanceScore } : {}),
      ...(input.offTopicSignal !== undefined ? { offTopicSignal: input.offTopicSignal } : {}),
      ...(input.streakCount !== undefined ? { streakCount: input.streakCount } : {}),
      ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
      ...(input.providerRequestId !== undefined
        ? { providerRequestId: input.providerRequestId }
        : {}),
      ...(input.usage !== undefined ? { usage: input.usage } : {}),
    },
  });
}

export function createQueuedStageRunFromEvent(input: {
  readonly event: PipelineEventEnvelope;
  readonly queuedAt: string;
  readonly runId: string;
}): PipelineStageRunRecord {
  if (!isPipelineExecutableStageName(input.event.stageName ?? input.event.eventType)) {
    throw new Error(
      `Cannot create a stage run from non-executable stage ${input.event.eventType}`,
    );
  }

  const stageName = (input.event.stageName ??
    input.event.eventType) as PipelineExecutableStageName;
  const payload = toArtifactsPayload(input.event);

  return {
    runId: input.runId,
    eventId: input.event.eventId,
    sessionId: input.event.sessionId,
    chunkId: input.event.chunkId,
    stageName,
    status: "queued",
    attempt: 0,
    inputArtifacts: [...payload.inputArtifacts],
    outputArtifacts: [],
    queuedAt: input.queuedAt,
    updatedAt: input.queuedAt,
  };
}

export function collectSessionArtifacts(
  events: readonly PipelineEventEnvelope[],
  allowedKinds: readonly PipelineArtifactKind[],
): readonly PipelineArtifactRef[] {
  const artifactsById = new Map<string, PipelineArtifactRef>();

  for (const event of events) {
    for (const artifact of toArtifactsPayload(event).outputArtifacts) {
      if (allowedKinds.includes(artifact.artifactKind)) {
        artifactsById.set(artifact.artifactId, artifact);
      }
    }
  }

  return [...artifactsById.values()];
}

export function hasSessionFinalizationRequest(
  events: readonly PipelineEventEnvelope[],
): boolean {
  return events.some(
    (event) => event.eventType === "session.finalization.requested",
  );
}
