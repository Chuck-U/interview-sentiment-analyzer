import type {
  PipelineArtifactRef,
  PipelineEventEnvelope,
  PipelineEventType,
  PipelineExecutableStageName,
} from "../../../shared";

export const HOSTED_ANALYSIS_STAGE_NAMES = [
  "analyze_chunk.requested",
  "condense_context.requested",
  "session.summary.requested",
  "coaching.requested",
] as const;

export type HostedAnalysisStageName = (typeof HOSTED_ANALYSIS_STAGE_NAMES)[number];
export type LocalAnalysisStageName = Exclude<
  PipelineExecutableStageName,
  HostedAnalysisStageName
>;

export type PipelineStageExecutionRequest<
  TStageName extends PipelineExecutableStageName = PipelineExecutableStageName,
> = {
  readonly runId: string;
  readonly stageName: TStageName;
  readonly event: PipelineEventEnvelope<TStageName>;
  readonly inputArtifacts: readonly PipelineArtifactRef[];
};

export type PipelineStageExecutionResult<
  TEventType extends PipelineEventType = PipelineEventType,
> = {
  readonly outputArtifacts: readonly PipelineArtifactRef[];
  readonly emittedEvents: readonly PipelineEventEnvelope<TEventType>[];
};

export type HostedAnalysisProviderName = "google" | "openai" | "anthropic";

export type HostedAnalysisUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
};

export type HostedAnalysisMetadata = {
  readonly provider: HostedAnalysisProviderName;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaVersion: number;
  readonly usage: HostedAnalysisUsage;
  readonly latencyMs: number;
  readonly estimatedCostUsd?: number;
  readonly rawResponseRef?: string;
};

export type HostedAnalysisArtifactInput = {
  readonly artifact: PipelineArtifactRef;
  readonly content: string;
};

export type HostedAnalysisEvidenceRef = {
  readonly artifactId: string;
  readonly quote: string;
  readonly rationale: string;
};

export type HostedAnalysisInsight = {
  readonly title: string;
  readonly summary: string;
  readonly evidence: readonly HostedAnalysisEvidenceRef[];
};

export type HostedChunkAnalysisOutput = {
  readonly schemaVersion: number;
  readonly overview: string;
  readonly strengths: readonly HostedAnalysisInsight[];
  readonly issues: readonly HostedAnalysisInsight[];
  readonly ambiguities: readonly HostedAnalysisInsight[];
  readonly cueMismatches: readonly HostedAnalysisInsight[];
};

export type HostedContextSummaryOutput = {
  readonly schemaVersion: number;
  readonly rollingFacts: readonly string[];
  readonly stablePatterns: readonly string[];
  readonly unresolvedThreads: readonly string[];
  readonly coversThroughChunkId?: string;
};

export type HostedSessionSummaryOutput = {
  readonly schemaVersion: number;
  readonly overview: string;
  readonly interviewArc: readonly string[];
  readonly strengths: readonly string[];
  readonly growthAreas: readonly string[];
  readonly evidence: readonly HostedAnalysisEvidenceRef[];
};

export type HostedCoachingOutput = {
  readonly schemaVersion: number;
  readonly summary: string;
  readonly priorities: readonly string[];
  readonly drills: readonly string[];
  readonly evidence: readonly HostedAnalysisEvidenceRef[];
};

export type HostedAnalysisTaskRequest<
  TStageName extends HostedAnalysisStageName = HostedAnalysisStageName,
> = {
  readonly runId: string;
  readonly stageName: TStageName;
  readonly sessionId: string;
  readonly chunkId?: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly requestedAt: string;
  readonly artifacts: readonly HostedAnalysisArtifactInput[];
};

export type HostedAnalysisTaskResponse<
  TOutput,
  TStageName extends HostedAnalysisStageName = HostedAnalysisStageName,
> = {
  readonly stageName: TStageName;
  readonly metadata: HostedAnalysisMetadata;
  readonly output: TOutput;
};

export type HostedAnalysisAdapter = {
  readonly provider: HostedAnalysisProviderName;
  analyzeChunk(
    request: HostedAnalysisTaskRequest<"analyze_chunk.requested">,
  ): Promise<
    HostedAnalysisTaskResponse<
      HostedChunkAnalysisOutput,
      "analyze_chunk.requested"
    >
  >;
  condenseContext(
    request: HostedAnalysisTaskRequest<"condense_context.requested">,
  ): Promise<
    HostedAnalysisTaskResponse<
      HostedContextSummaryOutput,
      "condense_context.requested"
    >
  >;
  synthesizeSession(
    request: HostedAnalysisTaskRequest<"session.summary.requested">,
  ): Promise<
    HostedAnalysisTaskResponse<
      HostedSessionSummaryOutput,
      "session.summary.requested"
    >
  >;
  generateCoaching(
    request: HostedAnalysisTaskRequest<"coaching.requested">,
  ): Promise<
    HostedAnalysisTaskResponse<HostedCoachingOutput, "coaching.requested">
  >;
};

export type HostedAnalysisStageRouter = {
  getAdapter(stageName: HostedAnalysisStageName): HostedAnalysisAdapter;
};

export type AnalysisProvider = {
  executeStage(
    request: PipelineStageExecutionRequest<PipelineExecutableStageName>,
  ): Promise<PipelineStageExecutionResult>;
};

export function isHostedAnalysisStageName(
  stageName: PipelineExecutableStageName,
): stageName is HostedAnalysisStageName {
  return HOSTED_ANALYSIS_STAGE_NAMES.includes(
    stageName as HostedAnalysisStageName,
  );
}
