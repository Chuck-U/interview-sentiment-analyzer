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

type GoogleHostedAnalysisAdapterOptions = {
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

export class GoogleHostedAnalysisAdapter implements HostedAnalysisAdapter {
  readonly provider = "google" as const;

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

  constructor(options: GoogleHostedAnalysisAdapterOptions = {}) {
    this.analyzeChunkModel = options.analyzeChunkModel ?? "gemini-2.5-flash";
    this.condenseContextModel = options.condenseContextModel ?? "gemini-2.5-flash";
    this.coachingModel = options.coachingModel ?? "gemini-2.5-flash";
    this.sessionSummaryModel = options.sessionSummaryModel ?? "gemini-2.5-flash";
    this.promptVersions = {
      "analyze_chunk.requested":
        options.promptVersions?.["analyze_chunk.requested"] ??
        "google-analyze-chunk-v1",
      "condense_context.requested":
        options.promptVersions?.["condense_context.requested"] ??
        "google-condense-context-v1",
      "session.summary.requested":
        options.promptVersions?.["session.summary.requested"] ??
        "google-session-summary-v1",
      "coaching.requested":
        options.promptVersions?.["coaching.requested"] ??
        "google-coaching-v1",
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
        estimatedCostUsd: 0.0027,
      }),
      output: createChunkAnalysisOutput({
        providerLabel: "Google",
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
        estimatedCostUsd: 0.0019,
      }),
      output: createContextSummaryOutput({
        providerLabel: "Google",
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
        estimatedCostUsd: 0.0022,
      }),
      output: createSessionSummaryOutput({
        providerLabel: "Google",
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
        estimatedCostUsd: 0.002,
      }),
      output: createCoachingOutput({
        providerLabel: "Google",
        request,
      }),
    };
  }
}
