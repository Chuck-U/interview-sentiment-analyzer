import type {
  PipelineArtifactRef,
  PipelineEventEnvelope,
  PipelineEventType,
  PipelineStageName,
} from "../../../shared";

export type PipelineStageExecutionRequest<
  TStageName extends PipelineStageName = PipelineStageName,
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
  executeStage<TStageName extends PipelineStageName>(
    request: PipelineStageExecutionRequest<TStageName>,
  ): Promise<PipelineStageExecutionResult>;
};
