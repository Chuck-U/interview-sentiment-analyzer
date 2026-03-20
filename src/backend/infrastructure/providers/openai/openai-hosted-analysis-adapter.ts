import type {
  HostedAnalysisAdapter,
  HostedAnalysisTaskRequest,
  HostedAnalysisTaskResponse,
  HostedChunkAnalysisOutput,
  HostedCoachingOutput,
  HostedContextSummaryOutput,
  HostedSessionSummaryOutput,
} from "../../../application/ports/analysis-provider";
import {
  createChunkAnalysisOutput,
  createCoachingOutput,
  createContextSummaryOutput,
  createHostedAnalysisMetadata,
  createSessionSummaryOutput,
} from "../hosted-analysis-adapter-helpers";

type OpenAIHostedAnalysisAdapterOptions = {
  readonly analyzeChunkModel?: string;
  readonly condenseContextModel?: string;
  readonly coachingModel?: string;
  readonly promptVersions?: Partial<
    Record<
      | "analyze_chunk.requested"
      | "condense_context.requested"
      | "session.summary.requested"
      | "coaching.requested",
      string
    >
  >;
  readonly sessionSummaryModel?: string;
};

export class OpenAIHostedAnalysisAdapter implements HostedAnalysisAdapter {
  readonly provider = "openai" as const;

  private readonly analyzeChunkModel: string;
  private readonly condenseContextModel: string;
  private readonly coachingModel: string;
  private readonly promptVersions: Record<
    | "analyze_chunk.requested"
    | "condense_context.requested"
    | "session.summary.requested"
    | "coaching.requested",
    string
  >;
  private readonly sessionSummaryModel: string;

  constructor(options: OpenAIHostedAnalysisAdapterOptions = {}) {
    this.analyzeChunkModel = options.analyzeChunkModel ?? "gpt-5-mini";
    this.condenseContextModel = options.condenseContextModel ?? "gpt-5-mini";
    this.coachingModel = options.coachingModel ?? "gpt-5-mini";
    this.sessionSummaryModel = options.sessionSummaryModel ?? "gpt-5-mini";
    this.promptVersions = {
      "analyze_chunk.requested":
        options.promptVersions?.["analyze_chunk.requested"] ??
        "openai-analyze-chunk-v1",
      "condense_context.requested":
        options.promptVersions?.["condense_context.requested"] ??
        "openai-condense-context-v1",
      "session.summary.requested":
        options.promptVersions?.["session.summary.requested"] ??
        "openai-session-summary-v1",
      "coaching.requested":
        options.promptVersions?.["coaching.requested"] ??
        "openai-coaching-v1",
    };
  }

  async analyzeChunk(
    request: HostedAnalysisTaskRequest<"analyze_chunk.requested">,
  ): Promise<
    HostedAnalysisTaskResponse<HostedChunkAnalysisOutput, "analyze_chunk.requested">
  > {
    return {
      stageName: request.stageName,
      metadata: createHostedAnalysisMetadata({
        provider: this.provider,
        model: this.analyzeChunkModel,
        promptVersion: this.promptVersions["analyze_chunk.requested"],
        schemaVersion: 1,
        request,
        estimatedCostUsd: 0.0034,
      }),
      output: createChunkAnalysisOutput({
        providerLabel: "OpenAI",
        request,
      }),
    };
  }

  async condenseContext(
    request: HostedAnalysisTaskRequest<"condense_context.requested">,
  ): Promise<
    HostedAnalysisTaskResponse<
      HostedContextSummaryOutput,
      "condense_context.requested"
    >
  > {
    return {
      stageName: request.stageName,
      metadata: createHostedAnalysisMetadata({
        provider: this.provider,
        model: this.condenseContextModel,
        promptVersion: this.promptVersions["condense_context.requested"],
        schemaVersion: 1,
        request,
        estimatedCostUsd: 0.0021,
      }),
      output: createContextSummaryOutput({
        providerLabel: "OpenAI",
        request,
      }),
    };
  }

  async synthesizeSession(
    request: HostedAnalysisTaskRequest<"session.summary.requested">,
  ): Promise<
    HostedAnalysisTaskResponse<
      HostedSessionSummaryOutput,
      "session.summary.requested"
    >
  > {
    return {
      stageName: request.stageName,
      metadata: createHostedAnalysisMetadata({
        provider: this.provider,
        model: this.sessionSummaryModel,
        promptVersion: this.promptVersions["session.summary.requested"],
        schemaVersion: 1,
        request,
        estimatedCostUsd: 0.0028,
      }),
      output: createSessionSummaryOutput({
        providerLabel: "OpenAI",
        request,
      }),
    };
  }

  async generateCoaching(
    request: HostedAnalysisTaskRequest<"coaching.requested">,
  ): Promise<
    HostedAnalysisTaskResponse<HostedCoachingOutput, "coaching.requested">
  > {
    return {
      stageName: request.stageName,
      metadata: createHostedAnalysisMetadata({
        provider: this.provider,
        model: this.coachingModel,
        promptVersion: this.promptVersions["coaching.requested"],
        schemaVersion: 1,
        request,
        estimatedCostUsd: 0.0024,
      }),
      output: createCoachingOutput({
        providerLabel: "OpenAI",
        request,
      }),
    };
  }
}
