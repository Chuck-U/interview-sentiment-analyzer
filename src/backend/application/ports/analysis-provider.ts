import type {
  PipelineArtifactRef,
  PipelineEventEnvelope,
  PipelineEventType,
  PipelineExecutableStageName,
  PipelineProviderRoute,
  PipelineSessionGraphState,
} from "../../../shared";

export type PipelineStageExecutionRequest<
  TStageName extends PipelineExecutableStageName = PipelineExecutableStageName,
> = {
  readonly runId: string;
  readonly stageName: TStageName;
  readonly event: PipelineEventEnvelope<TStageName>;
  readonly inputArtifacts: readonly PipelineArtifactRef[];
  readonly graphState: PipelineSessionGraphState;
  readonly providerRoute: PipelineProviderRoute;
};

export type PipelineStageExecutionResult<
  TEventType extends PipelineEventType = PipelineEventType,
> = {
  readonly outputArtifacts: readonly PipelineArtifactRef[];
  readonly emittedEvents: readonly PipelineEventEnvelope<TEventType>[];
  readonly graphState?: PipelineSessionGraphState;
  readonly providerRoute?: PipelineProviderRoute;
};

export type AnalysisProvider = {
  executeStage(
    request: PipelineStageExecutionRequest<PipelineExecutableStageName>,
  ): Promise<PipelineStageExecutionResult>;
};
