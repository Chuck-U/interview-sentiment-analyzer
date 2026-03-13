import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  AnalysisProvider,
  PipelineStageExecutionRequest,
  PipelineStageExecutionResult,
} from "../../application/ports/analysis-provider";
import type {
  PipelineArtifactRef,
  PipelineExecutableStageName,
} from "../../../shared";
import { createPipelineEventEnvelope } from "../../../shared";
import type {
  Clock,
  IdGenerator,
  SessionStorageLayoutResolver,
} from "../../application/ports/session-lifecycle";

type LocalPipelineAnalysisProviderDependencies = {
  readonly clock: Clock;
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

async function writeArtifact(input: {
  readonly content: string;
  readonly sessionId: string;
  readonly storageLayoutResolver: SessionStorageLayoutResolver;
  readonly artifact: PipelineArtifactRef;
}): Promise<PipelineArtifactRef> {
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

export class LocalPipelineAnalysisProvider implements AnalysisProvider {
  constructor(
    private readonly dependencies: LocalPipelineAnalysisProviderDependencies,
  ) { }

  async executeStage(
    request: PipelineStageExecutionRequest<PipelineExecutableStageName>,
  ): Promise<PipelineStageExecutionResult> {
    switch (request.stageName) {
      case "transcribe_chunk.requested":
        return this.executeTranscribeChunkStage(
          request as PipelineStageExecutionRequest<"transcribe_chunk.requested">,
        );
      case "derive_signals.requested":
        return this.executeDeriveSignalsStage(
          request as PipelineStageExecutionRequest<"derive_signals.requested">,
        );
      case "analyze_chunk.requested":
        return this.executeAnalyzeChunkStage(
          request as PipelineStageExecutionRequest<"analyze_chunk.requested">,
        );
      case "condense_context.requested":
        return this.executeCondenseContextStage(
          request as PipelineStageExecutionRequest<"condense_context.requested">,
        );
      case "session.finalization.requested":
        return this.executeFinalizeSessionStage(
          request as PipelineStageExecutionRequest<"session.finalization.requested">,
        );
      default:
        return assertNever(request.stageName);
    }
  }

  private async executeTranscribeChunkStage(
    request: PipelineStageExecutionRequest<"transcribe_chunk.requested">,
  ): Promise<PipelineStageExecutionResult> {
    const completedAt = this.dependencies.clock.now().toISOString();
    const chunkId = requireChunkId(request);
    const transcriptArtifact = await writeArtifact({
      content: JSON.stringify(
        {
          chunkId,
          transcript: `Transcript placeholder for ${chunkId}`,
          generatedAt: completedAt,
        },
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
    const deriveSignalsRequestedEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "derive_signals.requested",
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
      emittedEvents: [transcriptReadyEvent, deriveSignalsRequestedEvent],
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
    const analyzeChunkRequestedEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "analyze_chunk.requested",
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
      emittedEvents: [signalsReadyEvent, analyzeChunkRequestedEvent],
    };
  }

  private async executeAnalyzeChunkStage(
    request: PipelineStageExecutionRequest<"analyze_chunk.requested">,
  ): Promise<PipelineStageExecutionResult> {
    const completedAt = this.dependencies.clock.now().toISOString();
    const chunkId = requireChunkId(request);
    const analysisArtifact = await writeArtifact({
      content: JSON.stringify(
        {
          chunkId,
          findings: [
            "Detected answer structure placeholder",
            "Captured pacing and hedging markers",
          ],
          generatedAt: completedAt,
        },
        null,
        2,
      ),
      sessionId: request.event.sessionId,
      storageLayoutResolver: this.dependencies.storageLayoutResolver,
      artifact: {
        artifactId: `analysis-${chunkId}`,
        artifactKind: "chunk-analysis",
        relativePath: `summaries/analysis/${chunkId}.json`,
        mimeType: "application/json",
        createdAt: completedAt,
      },
    });
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
        modelVersion: "node-local-v1",
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
    const summaryArtifact = await writeArtifact({
      content: [
        `# Context Summary ${chunkId}`,
        "",
        `Generated at ${completedAt}`,
        "",
        `Artifacts considered: ${request.inputArtifacts.map((artifact) => artifact.artifactId).join(", ")}`,
      ].join("\n"),
      sessionId: request.event.sessionId,
      storageLayoutResolver: this.dependencies.storageLayoutResolver,
      artifact: {
        artifactId: `context-${chunkId}`,
        artifactKind: "context-summary",
        relativePath: `summaries/context/${chunkId}.md`,
        mimeType: "text/markdown",
        createdAt: completedAt,
      },
    });
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

  private async executeFinalizeSessionStage(
    request: PipelineStageExecutionRequest<"session.finalization.requested">,
  ): Promise<PipelineStageExecutionResult> {
    const completedAt = this.dependencies.clock.now().toISOString();
    const inputContents = await readArtifactContents(
      request.event.sessionId,
      request.inputArtifacts.filter(
        (artifact) => artifact.artifactKind === "context-summary",
      ),
      this.dependencies.storageLayoutResolver,
    );
    const summaryArtifact = await writeArtifact({
      content: [
        "# Session Summary",
        "",
        `Generated at ${completedAt}`,
        "",
        inputContents.filter(Boolean).join("\n\n"),
      ].join("\n"),
      sessionId: request.event.sessionId,
      storageLayoutResolver: this.dependencies.storageLayoutResolver,
      artifact: {
        artifactId: `session-summary-${request.event.sessionId}`,
        artifactKind: "session-summary",
        relativePath: `summaries/session-summary-${request.event.sessionId}.json`,
        mimeType: "application/json",
        createdAt: completedAt,
      },
    });
    const coachingArtifact = await writeArtifact({
      content: [
        "# Coaching Feedback",
        "",
        "Focus on clarity, concise framing, and evidence-backed examples.",
      ].join("\n"),
      sessionId: request.event.sessionId,
      storageLayoutResolver: this.dependencies.storageLayoutResolver,
      artifact: {
        artifactId: `coaching-${request.event.sessionId}`,
        artifactKind: "coaching-feedback",
        relativePath: `summaries/coaching-${request.event.sessionId}.json`,
        mimeType: "application/json",
        createdAt: completedAt,
      },
    });
    const sessionSummaryReadyEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "session.summary.ready",
      sessionId: request.event.sessionId,
      causationId: request.event.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        completedAt,
        summaryFormat: "markdown",
        inputArtifacts: [...request.inputArtifacts],
        outputArtifacts: [summaryArtifact],
      },
    });
    const coachingReadyEvent = createPipelineEventEnvelope({
      eventId: this.dependencies.idGenerator.createId(),
      eventType: "coaching.ready",
      sessionId: request.event.sessionId,
      causationId: sessionSummaryReadyEvent.eventId,
      correlationId: request.event.correlationId,
      occurredAt: completedAt,
      payload: {
        completedAt,
        coachingFormat: "json",
        inputArtifacts: [summaryArtifact],
        outputArtifacts: [coachingArtifact],
      },
    });

    return {
      outputArtifacts: [summaryArtifact, coachingArtifact],
      emittedEvents: [sessionSummaryReadyEvent, coachingReadyEvent],
    };
  }
}
