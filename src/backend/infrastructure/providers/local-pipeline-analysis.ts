import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  AnalysisProvider,
  HostedAnalysisArtifactInput,
  HostedAnalysisMetadata,
  HostedAnalysisStageName,
  HostedAnalysisStageRouter,
  HostedAnalysisTaskRequest,
  HostedChunkAnalysisOutput,
  HostedCoachingOutput,
  HostedContextSummaryOutput,
  HostedSessionSummaryOutput,
  PipelineStageExecutionRequest,
  PipelineStageExecutionResult,
} from "../../application/ports/analysis-provider";
import type {
  PipelineArtifactKind,
  PipelineArtifactRef,
  PipelineExecutableStageName,
} from "../../../shared";
import { createPipelineEventEnvelope } from "../../../shared";
import type {
  Clock,
  IdGenerator,
  SessionStorageLayoutResolver,
} from "../../application/ports/session-lifecycle";
import { buildSessionTranscriptArtifact } from "../../../shared/transcription";

type LocalPipelineAnalysisProviderDependencies = {
  readonly clock: Clock;
  readonly hostedStageRouter: HostedAnalysisStageRouter;
  readonly idGenerator: IdGenerator;
  readonly storageLayoutResolver: SessionStorageLayoutResolver;
};

function assertNever(value: never): never {
  throw new Error(`Unhandled pipeline stage: ${String(value)}`);
}

function requireChunkId(
  request: PipelineStageExecutionRequest<PipelineExecutableStageName>,
): string {
  if (!request.event.chunkId) {
    throw new Error(`${request.stageName} requires a chunkId`);
  }

  return request.event.chunkId;
}

async function writeArtifact<TArtifactKind extends PipelineArtifactKind>(input: {
  readonly content: string;
  readonly sessionId: string;
  readonly storageLayoutResolver: SessionStorageLayoutResolver;
  readonly artifact: PipelineArtifactRef<TArtifactKind>;
}): Promise<PipelineArtifactRef<TArtifactKind>> {
  const absolutePath = input.storageLayoutResolver.resolveAbsoluteArtifactPath(
    input.sessionId,
    input.artifact.relativePath,
  );
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.content, "utf8");

  return input.artifact;
}

async function readArtifactContents(
  sessionId: string,
  artifacts: readonly PipelineArtifactRef[],
  storageLayoutResolver: SessionStorageLayoutResolver,
): Promise<readonly string[]> {
  return Promise.all(
    artifacts.map(async (artifact) => {
      const absolutePath = storageLayoutResolver.resolveAbsoluteArtifactPath(
        sessionId,
        artifact.relativePath,
      );

      try {
        return await readFile(absolutePath, "utf8");
      } catch {
        return "";
      }
    }),
  );
}

async function readArtifactInputs(
  sessionId: string,
  artifacts: readonly PipelineArtifactRef[],
  storageLayoutResolver: SessionStorageLayoutResolver,
): Promise<readonly HostedAnalysisArtifactInput[]> {
  const contents = await readArtifactContents(
    sessionId,
    artifacts,
    storageLayoutResolver,
  );

  return artifacts.map((artifact, index) => ({
    artifact,
    content: contents[index] ?? "",
  }));
}

function createHostedModelVersion(metadata: HostedAnalysisMetadata): string {
  return `${metadata.provider}:${metadata.model}`;
}

function createHostedArtifactContent<TOutput>(input: {
  readonly completedAt: string;
  readonly metadata: HostedAnalysisMetadata;
  readonly output: TOutput;
  readonly stageName: HostedAnalysisStageName;
}): string {
  return JSON.stringify(
    {
      stageName: input.stageName,
      completedAt: input.completedAt,
      metadata: input.metadata,
      output: input.output,
    },
    null,
    2,
  );
}

export class LocalPipelineAnalysisProvider implements AnalysisProvider {
  constructor(
    private readonly dependencies: LocalPipelineAnalysisProviderDependencies,
  ) {}

  async executeStage(
    request: PipelineStageExecutionRequest<PipelineExecutableStageName>,
  ): Promise<PipelineStageExecutionResult> {
    switch (request.stageName) {
      case "transcribe_chunk.requested":
        return this.executeTranscribeChunkStage(
          request as PipelineStageExecutionRequest<"transcribe_chunk.requested">,
        );
      case "resolve_participants.requested":
        return this.executeResolveParticipantsStage(
          request as PipelineStageExecutionRequest<"resolve_participants.requested">,
        );
      case "derive_signals.requested":
        return this.executeDeriveSignalsStage(
          request as PipelineStageExecutionRequest<"derive_signals.requested">,
        );
      case "annotate_questions.requested":
        return this.executeAnnotateQuestionsStage(
          request as PipelineStageExecutionRequest<"annotate_questions.requested">,
        );
      case "score_interaction.requested":
        return this.executeScoreInteractionStage(
          request as PipelineStageExecutionRequest<"score_interaction.requested">,
        );
      case "update_baselines.requested":
        return this.executeUpdateBaselinesStage(
          request as PipelineStageExecutionRequest<"update_baselines.requested">,
        );
      case "analyze_chunk.requested":
        return this.executeAnalyzeChunkStage(
          request as PipelineStageExecutionRequest<"analyze_chunk.requested">,
        );
      case "condense_context.requested":
        return this.executeCondenseContextStage(
          request as PipelineStageExecutionRequest<"condense_context.requested">,
        );
      case "session.summary.requested":
        return this.executeSessionSummaryStage(
          request as PipelineStageExecutionRequest<"session.summary.requested">,
        );
      case "coaching.requested":
        return this.executeCoachingStage(
          request as PipelineStageExecutionRequest<"coaching.requested">,
        );
      default:
        return assertNever(request.stageName);
    }
  }

  private async createHostedTaskRequest<
    TStageName extends HostedAnalysisStageName,
  >(
    request: PipelineStageExecutionRequest<TStageName>,
  ): Promise<HostedAnalysisTaskRequest<TStageName>> {
    const artifacts = await readArtifactInputs(
      request.event.sessionId,
      request.inputArtifacts,
      this.dependencies.storageLayoutResolver,
    );

    return {
      runId: request.runId,
      stageName: request.stageName,
      sessionId: request.event.sessionId,
      chunkId: request.event.chunkId,
      eventId: request.event.eventId,
      correlationId: request.event.correlationId,
      requestedAt: request.event.occurredAt,
      artifacts,
    };
  }

  private async executeHostedAnalyzeChunk(
    request: PipelineStageExecutionRequest<"analyze_chunk.requested">,
    completedAt: string,
  ): Promise<{
    readonly artifact: PipelineArtifactRef<"chunk-analysis">;
    readonly metadata: HostedAnalysisMetadata;
    readonly output: HostedChunkAnalysisOutput;
  }> {
    const chunkId = requireChunkId(request);
    const adapter = this.dependencies.hostedStageRouter.getAdapter(request.stageName);
    const hostedRequest = await this.createHostedTaskRequest(request);
    const response = await adapter.analyzeChunk(hostedRequest);
    const artifact = await writeArtifact({
      content: createHostedArtifactContent({
        stageName: request.stageName,
        completedAt,
        metadata: response.metadata,
        output: response.output,
      }),
      sessionId: request.event.sessionId,
      storageLayoutResolver: this.dependencies.storageLayoutResolver,
      artifact: {
        artifactId: `analysis-${chunkId}`,
        artifactKind: "chunk-analysis",
        relativePath: `summaries/analysis/${chunkId}.json`,
        mimeType: "application/json",
        createdAt: completedAt,
        metadata: {
          provider: response.metadata.provider,
          model: response.metadata.model,
          promptVersion: response.metadata.promptVersion,
        },
      },
    });

    return {
      artifact,
      metadata: response.metadata,
      output: response.output,
    };
  }

  private async executeHostedCondenseContext(
    request: PipelineStageExecutionRequest<"condense_context.requested">,
    completedAt: string,
  ): Promise<{
    readonly artifact: PipelineArtifactRef<"context-summary">;
    readonly metadata: HostedAnalysisMetadata;
    readonly output: HostedContextSummaryOutput;
  }> {
    const chunkId = requireChunkId(request);
    const adapter = this.dependencies.hostedStageRouter.getAdapter(request.stageName);
    const hostedRequest = await this.createHostedTaskRequest(request);
    const response = await adapter.condenseContext(hostedRequest);
    const artifact = await writeArtifact({
      content: createHostedArtifactContent({
        stageName: request.stageName,
        completedAt,
        metadata: response.metadata,
        output: response.output,
      }),
      sessionId: request.event.sessionId,
      storageLayoutResolver: this.dependencies.storageLayoutResolver,
      artifact: {
        artifactId: `context-${chunkId}`,
        artifactKind: "context-summary",
        relativePath: `summaries/context/${chunkId}.json`,
        mimeType: "application/json",
        createdAt: completedAt,
        metadata: {
          provider: response.metadata.provider,
          model: response.metadata.model,
          promptVersion: response.metadata.promptVersion,
        },
      },
    });

    return {
      artifact,
      metadata: response.metadata,
      output: response.output,
    };
  }

  private async executeHostedSessionSummary(
    request: PipelineStageExecutionRequest<"session.summary.requested">,
    completedAt: string,
  ): Promise<{
    readonly artifact: PipelineArtifactRef<"session-summary">;
    readonly metadata: HostedAnalysisMetadata;
    readonly output: HostedSessionSummaryOutput;
  }> {
    const adapter = this.dependencies.hostedStageRouter.getAdapter(request.stageName);
    const hostedRequest = await this.createHostedTaskRequest(request);
    const response = await adapter.synthesizeSession(hostedRequest);
    const artifact = await writeArtifact({
      content: createHostedArtifactContent({
        stageName: request.stageName,
        completedAt,
        metadata: response.metadata,
        output: response.output,
      }),
      sessionId: request.event.sessionId,
      storageLayoutResolver: this.dependencies.storageLayoutResolver,
      artifact: {
        artifactId: `session-summary-${request.event.sessionId}`,
        artifactKind: "session-summary",
        relativePath: `summaries/session-summary-${request.event.sessionId}.json`,
        mimeType: "application/json",
        createdAt: completedAt,
        metadata: {
          provider: response.metadata.provider,
          model: response.metadata.model,
          promptVersion: response.metadata.promptVersion,
        },
      },
    });

    return {
      artifact,
      metadata: response.metadata,
      output: response.output,
    };
  }

  private async executeHostedCoaching(
    request: PipelineStageExecutionRequest<"coaching.requested">,
    completedAt: string,
  ): Promise<{
    readonly artifact: PipelineArtifactRef<"coaching-feedback">;
    readonly metadata: HostedAnalysisMetadata;
    readonly output: HostedCoachingOutput;
  }> {
    const adapter = this.dependencies.hostedStageRouter.getAdapter(request.stageName);
    const hostedRequest = await this.createHostedTaskRequest(request);
    const response = await adapter.generateCoaching(hostedRequest);
    const artifact = await writeArtifact({
      content: createHostedArtifactContent({
        stageName: request.stageName,
        completedAt,
        metadata: response.metadata,
        output: response.output,
      }),
      sessionId: request.event.sessionId,
      storageLayoutResolver: this.dependencies.storageLayoutResolver,
      artifact: {
        artifactId: `coaching-${request.event.sessionId}`,
        artifactKind: "coaching-feedback",
        relativePath: `summaries/coaching-${request.event.sessionId}.json`,
        mimeType: "application/json",
        createdAt: completedAt,
        metadata: {
          provider: response.metadata.provider,
          model: response.metadata.model,
          promptVersion: response.metadata.promptVersion,
        },
      },
    });

    return {
      artifact,
      metadata: response.metadata,
      output: response.output,
    };
  }

  private async executeTranscribeChunkStage(
    request: PipelineStageExecutionRequest<"transcribe_chunk.requested">,
  ): Promise<PipelineStageExecutionResult> {
    const completedAt = this.dependencies.clock.now().toISOString();
    const chunkId = requireChunkId(request);
    const transcriptArtifact = await writeArtifact({
      content: JSON.stringify(
        buildSessionTranscriptArtifact({
          chunkId,
          sessionId: request.event.sessionId,
          source: "microphone",
          text: `Transcript placeholder for ${chunkId}`,
          completedAt,
          includeLegacyTranscriptField: true,
        }),
        null,
        2,
      ),
      sessionId: request.event.sessionId,
      storageLayoutResolver: this.dependencies.storageLayoutResolver,
      artifact: {
        artifactId: `transcript-${chunkId}`,
        artifactKind: "transcript",
        relativePath: `transcripts/${chunkId}.json`,
        mimeType: "application/json",
        createdAt: completedAt,
      },
    });
    const transcriptReadyEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "transcript.ready",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: request.event.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        completedAt,
        language: "en",
        inputArtifacts: [...request.inputArtifacts],
        outputArtifacts: [transcriptArtifact],
      },
    });
    const resolveParticipantsRequestedEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "resolve_participants.requested",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: transcriptReadyEvent.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        requestedAt: completedAt,
        inputArtifacts: [transcriptArtifact],
        outputArtifacts: [],
      },
    });

    return {
      outputArtifacts: [transcriptArtifact],
      emittedEvents: [transcriptReadyEvent, resolveParticipantsRequestedEvent],
    };
  }

  private async executeResolveParticipantsStage(
    request: PipelineStageExecutionRequest<"resolve_participants.requested">,
  ): Promise<PipelineStageExecutionResult> {
    const completedAt = this.dependencies.clock.now().toISOString();
    const chunkId = requireChunkId(request);
    const participantArtifact = await writeArtifact({
      content: JSON.stringify(
        {
          chunkId,
          participants: [
            {
              participantId: "speaker-a",
              role: "candidate",
              confidence: 0.75,
            },
          ],
          generatedAt: completedAt,
        },
        null,
        2,
      ),
      sessionId: request.event.sessionId,
      storageLayoutResolver: this.dependencies.storageLayoutResolver,
      artifact: {
        artifactId: `participants-${chunkId}`,
        artifactKind: "participant-set",
        relativePath: `summaries/participants/${chunkId}.json`,
        mimeType: "application/json",
        createdAt: completedAt,
      },
    });
    const participantsReadyEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "participants.ready",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: request.event.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        completedAt,
        participantCount: 1,
        inputArtifacts: [...request.inputArtifacts],
        outputArtifacts: [participantArtifact],
      },
    });
    const deriveSignalsRequestedEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "derive_signals.requested",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: participantsReadyEvent.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        requestedAt: completedAt,
        inputArtifacts: [...request.inputArtifacts, participantArtifact],
        outputArtifacts: [],
      },
    });

    return {
      outputArtifacts: [participantArtifact],
      emittedEvents: [participantsReadyEvent, deriveSignalsRequestedEvent],
    };
  }

  private async executeDeriveSignalsStage(
    request: PipelineStageExecutionRequest<"derive_signals.requested">,
  ): Promise<PipelineStageExecutionResult> {
    const completedAt = this.dependencies.clock.now().toISOString();
    const chunkId = requireChunkId(request);
    const signalArtifact = await writeArtifact({
      content: JSON.stringify(
        {
          chunkId,
          categories: ["clarity", "hedging", "pacing"],
          generatedAt: completedAt,
        },
        null,
        2,
      ),
      sessionId: request.event.sessionId,
      storageLayoutResolver: this.dependencies.storageLayoutResolver,
      artifact: {
        artifactId: `signals-${chunkId}`,
        artifactKind: "signal-set",
        relativePath: `summaries/signals/${chunkId}.json`,
        mimeType: "application/json",
        createdAt: completedAt,
      },
    });
    const signalsReadyEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "signals.ready",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: request.event.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        completedAt,
        signalCategories: ["clarity", "hedging", "pacing"],
        inputArtifacts: [...request.inputArtifacts],
        outputArtifacts: [signalArtifact],
      },
    });
    const annotateQuestionsRequestedEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "annotate_questions.requested",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: signalsReadyEvent.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        requestedAt: completedAt,
        inputArtifacts: [...request.inputArtifacts, signalArtifact],
        outputArtifacts: [],
      },
    });

    return {
      outputArtifacts: [signalArtifact],
      emittedEvents: [signalsReadyEvent, annotateQuestionsRequestedEvent],
    };
  }

  private async executeAnnotateQuestionsStage(
    request: PipelineStageExecutionRequest<"annotate_questions.requested">,
  ): Promise<PipelineStageExecutionResult> {
    const completedAt = this.dependencies.clock.now().toISOString();
    const chunkId = requireChunkId(request);
    const questionArtifact = await writeArtifact({
      content: JSON.stringify(
        {
          chunkId,
          questions: [
            {
              questionId: `question-${chunkId}`,
              questionType: "behavioral",
              expectedAnswerShape: "star",
            },
          ],
          generatedAt: completedAt,
        },
        null,
        2,
      ),
      sessionId: request.event.sessionId,
      storageLayoutResolver: this.dependencies.storageLayoutResolver,
      artifact: {
        artifactId: `questions-${chunkId}`,
        artifactKind: "question-set",
        relativePath: `summaries/questions/${chunkId}.json`,
        mimeType: "application/json",
        createdAt: completedAt,
      },
    });
    const questionsReadyEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "questions.ready",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: request.event.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        completedAt,
        questionCount: 1,
        inputArtifacts: [...request.inputArtifacts],
        outputArtifacts: [questionArtifact],
      },
    });
    const scoreInteractionRequestedEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "score_interaction.requested",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: questionsReadyEvent.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        requestedAt: completedAt,
        inputArtifacts: [...request.inputArtifacts, questionArtifact],
        outputArtifacts: [],
      },
    });

    return {
      outputArtifacts: [questionArtifact],
      emittedEvents: [questionsReadyEvent, scoreInteractionRequestedEvent],
    };
  }

  private async executeScoreInteractionStage(
    request: PipelineStageExecutionRequest<"score_interaction.requested">,
  ): Promise<PipelineStageExecutionResult> {
    const completedAt = this.dependencies.clock.now().toISOString();
    const chunkId = requireChunkId(request);
    const interactionArtifact = await writeArtifact({
      content: JSON.stringify(
        {
          chunkId,
          metricFamilies: ["ambiguity", "pacing", "cue-mismatch"],
          generatedAt: completedAt,
        },
        null,
        2,
      ),
      sessionId: request.event.sessionId,
      storageLayoutResolver: this.dependencies.storageLayoutResolver,
      artifact: {
        artifactId: `interaction-${chunkId}`,
        artifactKind: "interaction-metrics",
        relativePath: `summaries/interaction/${chunkId}.json`,
        mimeType: "application/json",
        createdAt: completedAt,
      },
    });
    const interactionMetricsReadyEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "interaction.metrics.ready",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: request.event.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        completedAt,
        metricFamilies: ["ambiguity", "pacing", "cue-mismatch"],
        inputArtifacts: [...request.inputArtifacts],
        outputArtifacts: [interactionArtifact],
      },
    });
    const updateBaselinesRequestedEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "update_baselines.requested",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: interactionMetricsReadyEvent.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        requestedAt: completedAt,
        inputArtifacts: [...request.inputArtifacts, interactionArtifact],
        outputArtifacts: [],
      },
    });

    return {
      outputArtifacts: [interactionArtifact],
      emittedEvents: [interactionMetricsReadyEvent, updateBaselinesRequestedEvent],
    };
  }

  private async executeUpdateBaselinesStage(
    request: PipelineStageExecutionRequest<"update_baselines.requested">,
  ): Promise<PipelineStageExecutionResult> {
    const completedAt = this.dependencies.clock.now().toISOString();
    const chunkId = requireChunkId(request);
    const baselineArtifact = await writeArtifact({
      content: JSON.stringify(
        {
          chunkId,
          scope: "rolling-session",
          generatedAt: completedAt,
        },
        null,
        2,
      ),
      sessionId: request.event.sessionId,
      storageLayoutResolver: this.dependencies.storageLayoutResolver,
      artifact: {
        artifactId: `baseline-${chunkId}`,
        artifactKind: "participant-baseline",
        relativePath: `summaries/baselines/${chunkId}.json`,
        mimeType: "application/json",
        createdAt: completedAt,
      },
    });
    const baselinesReadyEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "baselines.ready",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: request.event.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        completedAt,
        baselineScope: "rolling-session",
        inputArtifacts: [...request.inputArtifacts],
        outputArtifacts: [baselineArtifact],
      },
    });
    const analyzeChunkRequestedEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "analyze_chunk.requested",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: baselinesReadyEvent.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        requestedAt: completedAt,
        inputArtifacts: [...request.inputArtifacts, baselineArtifact],
        outputArtifacts: [],
      },
    });

    return {
      outputArtifacts: [baselineArtifact],
      emittedEvents: [baselinesReadyEvent, analyzeChunkRequestedEvent],
    };
  }

  private async executeAnalyzeChunkStage(
    request: PipelineStageExecutionRequest<"analyze_chunk.requested">,
  ): Promise<PipelineStageExecutionResult> {
    const completedAt = this.dependencies.clock.now().toISOString();
    const chunkId = requireChunkId(request);
    const hostedResult = await this.executeHostedAnalyzeChunk(request, completedAt);
    const analysisArtifact = hostedResult.artifact;
    const chunkAnalysisReadyEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "chunk.analysis.ready",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: request.event.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        completedAt,
        modelVersion: createHostedModelVersion(hostedResult.metadata),
        inputArtifacts: [...request.inputArtifacts],
        outputArtifacts: [analysisArtifact],
      },
    });
    const condenseContextRequestedEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "condense_context.requested",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: chunkAnalysisReadyEvent.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        requestedAt: completedAt,
        condensationWindow: "rolling",
        inputArtifacts: [...request.inputArtifacts, analysisArtifact],
        outputArtifacts: [],
      },
    });

    return {
      outputArtifacts: [analysisArtifact],
      emittedEvents: [chunkAnalysisReadyEvent, condenseContextRequestedEvent],
    };
  }

  private async executeCondenseContextStage(
    request: PipelineStageExecutionRequest<"condense_context.requested">,
  ): Promise<PipelineStageExecutionResult> {
    const completedAt = this.dependencies.clock.now().toISOString();
    const chunkId = requireChunkId(request);
    const hostedResult = await this.executeHostedCondenseContext(
      request,
      completedAt,
    );
    const summaryArtifact = hostedResult.artifact;
    const contextReadyEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "context.ready",
      sessionId: request.event.sessionId,
      chunkId,
      causationId: request.event.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        chunkId,
        completedAt,
        coversThroughChunkId: chunkId,
        inputArtifacts: [...request.inputArtifacts],
        outputArtifacts: [summaryArtifact],
      },
    });

    return {
      outputArtifacts: [summaryArtifact],
      emittedEvents: [contextReadyEvent],
    };
  }

  private async executeSessionSummaryStage(
    request: PipelineStageExecutionRequest<"session.summary.requested">,
  ): Promise<PipelineStageExecutionResult> {
    const completedAt = this.dependencies.clock.now().toISOString();
    const hostedResult = await this.executeHostedSessionSummary(
      request,
      completedAt,
    );
    const summaryArtifact = hostedResult.artifact;
    const sessionSummaryReadyEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "session.summary.ready",
      sessionId: request.event.sessionId,
      causationId: request.event.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        completedAt,
        summaryFormat: "json",
        inputArtifacts: [...request.inputArtifacts],
        outputArtifacts: [summaryArtifact],
      },
    });
    const coachingRequestedEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "coaching.requested",
      sessionId: request.event.sessionId,
      causationId: sessionSummaryReadyEvent.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        requestedAt: completedAt,
        inputArtifacts: [summaryArtifact],
        outputArtifacts: [],
      },
    });

    return {
      outputArtifacts: [summaryArtifact],
      emittedEvents: [sessionSummaryReadyEvent, coachingRequestedEvent],
    };
  }

  private async executeCoachingStage(
    request: PipelineStageExecutionRequest<"coaching.requested">,
  ): Promise<PipelineStageExecutionResult> {
    const completedAt = this.dependencies.clock.now().toISOString();
    const hostedResult = await this.executeHostedCoaching(request, completedAt);
    const coachingArtifact = hostedResult.artifact;
    const coachingReadyEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "coaching.ready",
      sessionId: request.event.sessionId,
      causationId: request.event.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        completedAt,
        coachingFormat: "json",
        inputArtifacts: [...request.inputArtifacts],
        outputArtifacts: [coachingArtifact],
      },
    });

    return {
      outputArtifacts: [coachingArtifact],
      emittedEvents: [coachingReadyEvent],
    };
  }
}
