import { Annotation, StateGraph } from "@langchain/langgraph";

import type {
  PipelineStageExecutionRequest,
  PipelineStageExecutionResult,
} from "../ports/analysis-provider";
import type { PipelineExecutableStageName } from "../../../shared";

import {
  BuiltInPipelineOrchestrator,
  type PipelineOrchestratorDependencies,
} from "./pipeline-orchestrator";

const pipelineExecutionState = Annotation.Root({
  request: Annotation<
    PipelineStageExecutionRequest<PipelineExecutableStageName> | undefined
  >,
  result: Annotation<PipelineStageExecutionResult | undefined>,
});

export class LangChainPipelineOrchestrator extends BuiltInPipelineOrchestrator {
  constructor(dependencies: PipelineOrchestratorDependencies) {
    super(dependencies);
  }

  protected async executeStage(
    request: PipelineStageExecutionRequest<PipelineExecutableStageName>,
  ): Promise<PipelineStageExecutionResult> {
    const graph = new StateGraph(pipelineExecutionState)
      .addNode("executeStage", async (state) => ({
        result: await super.executeStage(state.request ?? request),
      }))
      .addEdge("__start__", "executeStage")
      .addEdge("executeStage", "__end__")
      .compile();
    const result = await graph.invoke({
      request,
    });

    if (!result.result) {
      throw new Error("LangChain pipeline execution completed without a result");
    }

    return result.result;
  }
}
