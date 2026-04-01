import type {
  PipelineArtifactRef,
  PipelineEventEnvelope,
  PipelineEventType,
  PipelineExecutableStageName,
} from "../../../shared";

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

export type AnalysisProvider = {
  executeStage(
    request: PipelineStageExecutionRequest<PipelineExecutableStageName>,
  ): Promise<PipelineStageExecutionResult>;
};
