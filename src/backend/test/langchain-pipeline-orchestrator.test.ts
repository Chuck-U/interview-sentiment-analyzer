import assert from "node:assert/strict";
import test from "node:test";

import type { AnalysisProvider } from "../application/ports/analysis-provider";
import type {
  PipelineEventRepository,
  PipelineStageRunRepository,
  PipelineTransactionManager,
} from "../application/ports/pipeline";
import type { SessionRepository } from "../application/ports/session-lifecycle";
import { LangChainPipelineOrchestrator } from "../application/services/langchain-pipeline-orchestrator";
import {
  createPipelineEventEnvelope,
  normalizePipelineStageRun,
  type PipelineEventEnvelope,
  type PipelineStageRunRecord,
} from "../../shared";

function createSessionRepository(): SessionRepository {
  return {
    async findById() {
      return null;
    },
    async findByIdempotencyKey() {
      return null;
    },
    async listByStatuses() {
      return [];
    },
    async save() {},
  };
}

function createPipelineEventRepository(
  initialEvents: readonly PipelineEventEnvelope[],
): PipelineEventRepository & {
  readonly appendedEvents: PipelineEventEnvelope[];
} {
  const events = [...initialEvents];
  const appendedEvents: PipelineEventEnvelope[] = [];

  return {
    appendedEvents,
    async append(event) {
      events.push(event);
      appendedEvents.push(event);
    },
    async findById(eventId) {
      return events.find((event) => event.eventId === eventId) ?? null;
    },
    async listBySessionId(sessionId) {
      return events.filter((event) => event.sessionId === sessionId);
    },
    async listByEventTypes(sessionId, eventTypes) {
      return events.filter(
        (event) => event.sessionId === sessionId
          && eventTypes.includes(event.eventType),
      );
    },
  };
}

function createPipelineStageRunRepository(
  claimedRun: PipelineStageRunRecord,
): PipelineStageRunRepository & {
  readonly savedRuns: PipelineStageRunRecord[];
} {
  let hasClaimed = false;
  const runs = new Map<string, PipelineStageRunRecord>([[claimedRun.runId, claimedRun]]);
  const savedRuns: PipelineStageRunRecord[] = [];

  return {
    savedRuns,
    async claimNextRunnable() {
      if (hasClaimed) {
        return null;
      }

      hasClaimed = true;
      return claimedRun;
    },
    async findByEventId(eventId) {
      return [...runs.values()].find((run) => run.eventId === eventId) ?? null;
    },
    async findById(runId) {
      return runs.get(runId) ?? null;
    },
    async listByStatuses() {
      return [...runs.values()];
    },
    async save(stageRun) {
      runs.set(stageRun.runId, stageRun);
      savedRuns.push(stageRun);
    },
  };
}

test("langgraph orchestrator rehydrates graph state and stamps emitted events", async () => {
  const priorGraphEvent = createPipelineEventEnvelope({
    eventId: "question-event-1",
    eventType: "transcript.ready",
    sessionId: "session-1",
    chunkId: "chunk-1",
    correlationId: "correlation-1",
    occurredAt: "2026-03-12T12:01:00.000Z",
    payload: {
      chunkId: "chunk-1",
      completedAt: "2026-03-12T12:01:00.000Z",
      language: "en",
      inputArtifacts: [
        {
          artifactId: "media-1",
          artifactKind: "media-chunk",
          relativePath: "chunks/audio/chunk-1.wav",
        },
      ],
      outputArtifacts: [
        {
          artifactId: "transcript-1",
          artifactKind: "transcript",
          relativePath: "transcripts/chunk-1.json",
        },
      ],
      graphState: {
        activeQuestion: {
          questionId: "question-1",
          questionText: "Tell me about a time you resolved a conflict.",
          sourceEventId: "question-event-1",
          sourceChunkId: "chunk-1",
          detectedAt: "2026-03-12T12:01:00.000Z",
          confidence: 0.91,
        },
      },
      providerRoute: {
        routeKind: "local",
        providerId: "local-pipeline-analysis",
        selectedAt: "2026-03-12T12:01:00.000Z",
      },
    },
  });
  const sourceEvent = createPipelineEventEnvelope({
    eventId: "event-2",
    eventType: "resolve_participants.requested",
    sessionId: "session-1",
    chunkId: "chunk-1",
    causationId: priorGraphEvent.eventId,
    correlationId: "correlation-1",
    occurredAt: "2026-03-12T12:02:00.000Z",
    payload: {
      chunkId: "chunk-1",
      requestedAt: "2026-03-12T12:02:00.000Z",
      inputArtifacts: [
        {
          artifactId: "transcript-1",
          artifactKind: "transcript",
          relativePath: "transcripts/chunk-1.json",
        },
      ],
      outputArtifacts: [],
    },
  });
  const claimedRun = normalizePipelineStageRun({
    runId: "run-1",
    eventId: sourceEvent.eventId,
    sessionId: sourceEvent.sessionId,
    chunkId: sourceEvent.chunkId,
    stageName: "resolve_participants.requested",
    status: "running",
    attempt: 1,
    leasedUntil: "2026-03-12T12:03:00.000Z",
    inputArtifacts: [...sourceEvent.payload.inputArtifacts],
    outputArtifacts: [],
    queuedAt: "2026-03-12T12:02:00.000Z",
    startedAt: "2026-03-12T12:02:05.000Z",
    updatedAt: "2026-03-12T12:02:05.000Z",
  });
  const pipelineEventRepository = createPipelineEventRepository([
    priorGraphEvent,
    sourceEvent,
  ]);
  const pipelineStageRunRepository = createPipelineStageRunRepository(claimedRun);
  const sessionRepository = createSessionRepository();
  let receivedRequest: Parameters<AnalysisProvider["executeStage"]>[0] | undefined;

  const analysisProvider: AnalysisProvider = {
    async executeStage(request) {
      receivedRequest = request;
      return {
        outputArtifacts: [
          {
            artifactId: "participants-1",
            artifactKind: "participant-set",
            relativePath: "summaries/participants/chunk-1.json",
          },
        ],
        emittedEvents: [
          createPipelineEventEnvelope({
            eventId: "event-3",
            eventType: "participants.ready",
            sessionId: "session-1",
            chunkId: "chunk-1",
            causationId: request.event.eventId,
            correlationId: request.event.correlationId,
            occurredAt: "2026-03-12T12:02:10.000Z",
            payload: {
              chunkId: "chunk-1",
              completedAt: "2026-03-12T12:02:10.000Z",
              participantCount: 1,
              inputArtifacts: [...request.inputArtifacts],
              outputArtifacts: [
                {
                  artifactId: "participants-1",
                  artifactKind: "participant-set",
                  relativePath: "summaries/participants/chunk-1.json",
                },
              ],
            },
          }),
        ],
        graphState: {
          activeQuestion: request.graphState.activeQuestion,
          liveAnswerEvaluation: {
            status: "buffering",
            activeQuestionText: request.graphState.activeQuestion?.questionText,
            answerWindowText: "I aligned two teammates around a release blocker.",
            streakCount: 0,
            lastUpdatedAt: "2026-03-12T12:02:10.000Z",
          },
        },
      };
    },
  };
  const transactionManager: PipelineTransactionManager = {
    async withTransaction(callback) {
      return callback({
        mediaChunkRepository: {} as never,
        participantBaselineRepository: {} as never,
        participantPresenceRepository: {} as never,
        participantRepository: {} as never,
        pipelineEventRepository,
        pipelineStageRunRepository,
        questionAnnotationRepository: {} as never,
        sessionRepository,
      });
    },
  };
  const orchestrator = new LangChainPipelineOrchestrator({
    analysisProvider,
    clock: { now: () => new Date("2026-03-12T12:02:30.000Z") },
    idGenerator: { createId: () => "generated-id" },
    pipelineEventRepository,
    pipelineStageRunRepository,
    sessionRepository,
    transactionManager,
  });

  await orchestrator.runUntilIdle();

  assert.equal(
    receivedRequest?.graphState.activeQuestion?.questionText,
    "Tell me about a time you resolved a conflict.",
  );
  assert.equal(
    receivedRequest?.providerRoute.providerId,
    "local-pipeline-analysis",
  );
  assert.equal(
    pipelineEventRepository.appendedEvents[0]?.payload.graphState?.liveAnswerEvaluation?.status,
    "buffering",
  );
  assert.equal(
    pipelineEventRepository.appendedEvents[0]?.payload.providerRoute?.providerId,
    "local-pipeline-analysis",
  );
});
