import type {
  HostedAnalysisAdapter,
  HostedAnalysisStageName,
  HostedAnalysisStageRouter,
} from "../../application/ports/analysis-provider";

type HostedAnalysisStageRouterOptions = {
  readonly defaultAdapter: HostedAnalysisAdapter;
  readonly stageAdapters?: Partial<
    Record<HostedAnalysisStageName, HostedAnalysisAdapter>
  >;
};

export class StaticHostedAnalysisStageRouter
  implements HostedAnalysisStageRouter
{
  private readonly adaptersByStage: ReadonlyMap<
    HostedAnalysisStageName,
    HostedAnalysisAdapter
  >;
  private readonly defaultAdapter: HostedAnalysisAdapter;

  constructor(options: HostedAnalysisStageRouterOptions) {
    this.defaultAdapter = options.defaultAdapter;
    this.adaptersByStage = new Map(
      Object.entries(options.stageAdapters ?? {}) as readonly [
        HostedAnalysisStageName,
        HostedAnalysisAdapter,
      ][],
    );
  }

  getAdapter(stageName: HostedAnalysisStageName): HostedAnalysisAdapter {
    return this.adaptersByStage.get(stageName) ?? this.defaultAdapter;
  }
}
