import { Annotation, StateGraph } from "@langchain/langgraph";

import type {
  PipelineStageExecutionRequest,
  PipelineStageExecutionResult,
} from "../ports/analysis-provider";
import {
  completeSession,
  type SessionEntity,
} from "../../domain/session/session";
import type {
  PipelineEventEnvelope,
  PipelineEventType,
  PipelineExecutableStageName,
  PipelineStageRunRecord,
} from "../../../shared";

import {
  BuiltInPipelineOrchestrator,
  createFollowUpStageRuns,
  type PipelineOrchestratorDependencies,
  type PipelineExecutionContext,
  resolvePipelineExecutionContext,
  stampPipelineEventsWithExecutionContext,
  toRequestedStageEvent,
} from "./pipeline-orchestrator";

const pipelineExecutionState = Annotation.Root({
  claimedRun: Annotation<PipelineStageRunRecord | undefined>,
  sourceEvent: Annotation<
    PipelineEventEnvelope<PipelineExecutableStageName> | undefined
  >,
  executionContext: Annotation<PipelineExecutionContext | undefined>,
  request: Annotation<
    PipelineStageExecutionRequest<PipelineExecutableStageName> | undefined
  >,
  result: Annotation<PipelineStageExecutionResult<PipelineEventType> | undefined>,
  emittedEvents: Annotation<readonly PipelineEventEnvelope[] | undefined>,
  followUpStageRuns: Annotation<readonly PipelineStageRunRecord[] | undefined>,
  completedRun: Annotation<PipelineStageRunRecord | undefined>,
  finalizedSession: Annotation<SessionEntity | null | undefined>,
});

export class LangChainPipelineOrchestrator extends BuiltInPipelineOrchestrator {
  constructor(dependencies: PipelineOrchestratorDependencies) {
    super(dependencies);
  }

  protected override async executeClaimedRun(
    claimedRun: PipelineStageRunRecord,
  ): Promise<void> {
    const sourceEvent = await this.dependencies.pipelineEventRepository.findById(
      claimedRun.eventId,
    );

    if (!sourceEvent) {
      throw new Error(`Missing source event ${claimedRun.eventId}`);
    }

    let executionContext: PipelineExecutionContext | undefined;

    try {
      executionContext = await resolvePipelineExecutionContext({
        clock: this.dependencies.clock,
        pipelineEventRepository: this.dependencies.pipelineEventRepository,
        sessionId: claimedRun.sessionId,
      });
    } catch (error) {
      await this.handleClaimedRunFailure(claimedRun, sourceEvent, error);
      return;
    }

    const graph = new StateGraph(pipelineExecutionState)
      .addNode("buildRequest", async (state) => {
        const resolvedClaimedRun = state.claimedRun ?? claimedRun;
        const resolvedSourceEvent = state.sourceEvent ?? toRequestedStageEvent(sourceEvent);
        const resolvedExecutionContext = state.executionContext ?? executionContext;

        if (!resolvedExecutionContext) {
          throw new Error("LangChain pipeline execution is missing execution context");
        }

        return {
          request: {
            runId: resolvedClaimedRun.runId,
            stageName: resolvedClaimedRun.stageName,
            event: resolvedSourceEvent,
            inputArtifacts: resolvedClaimedRun.inputArtifacts,
            graphState: resolvedExecutionContext.graphState,
            providerRoute: resolvedExecutionContext.providerRoute,
          },
        };
      })
      .addNode("executeStage", async (state) => {
        if (!state.request) {
          throw new Error("LangChain pipeline execution did not build a request");
        }

        return {
          result: await this.dependencies.analysisProvider.executeStage(state.request),
        };
      })
      .addNode("materializeExecution", async (state) => {
        if (!state.claimedRun || !state.result || !state.executionContext) {
          throw new Error("LangChain pipeline execution is missing run state");
        }

        const completedAt = this.dependencies.clock.now().toISOString();
        const settledExecutionContext: PipelineExecutionContext = {
          graphState: state.result.graphState ?? state.executionContext.graphState,
          providerRoute:
            state.result.providerRoute ?? state.executionContext.providerRoute,
        };
        const emittedEvents = stampPipelineEventsWithExecutionContext(
          state.result.emittedEvents,
          settledExecutionContext,
        );

        return {
          completedRun: {
            ...state.claimedRun,
            status: "completed",
            leasedUntil: undefined,
            outputArtifacts: [...state.result.outputArtifacts],
            completedAt,
            errorCode: undefined,
            errorMessage: undefined,
            updatedAt: completedAt,
          },
          emittedEvents,
          executionContext: settledExecutionContext,
          followUpStageRuns: createFollowUpStageRuns(
            emittedEvents,
            this.dependencies.idGenerator,
            completedAt,
          ),
        };
      })
      .addNode("persistExecution", async (state) => {
        if (
          !state.claimedRun
          || !state.completedRun
          || !state.emittedEvents
          || !state.followUpStageRuns
        ) {
          throw new Error("LangChain pipeline execution is missing persistence state");
        }

        const completedRun = state.completedRun;
        const emittedEvents = state.emittedEvents;
        const followUpStageRuns = state.followUpStageRuns;
        let finalizedSession: SessionEntity | null = null;

        await this.dependencies.transactionManager.withTransaction(async (scope) => {
          await scope.pipelineStageRunRepository.save(completedRun);

          for (const event of emittedEvents) {
            await scope.pipelineEventRepository.append(event);
          }

          for (const stageRun of followUpStageRuns) {
            await scope.pipelineStageRunRepository.save(stageRun);
          }

          if (state.claimedRun?.stageName === "coaching.requested") {
            const session = await scope.sessionRepository.findById(
              state.claimedRun.sessionId,
            );

            if (session) {
              finalizedSession = completeSession(
                session,
                completedRun.completedAt ?? this.dependencies.clock.now().toISOString(),
              );
              await scope.sessionRepository.save(finalizedSession);
            }
          }
        });

        return { finalizedSession };
      })
      .addEdge("__start__", "buildRequest")
      .addEdge("buildRequest", "executeStage")
      .addEdge("executeStage", "materializeExecution")
      .addEdge("materializeExecution", "persistExecution")
      .addEdge("persistExecution", "__end__")
      .compile();

    try {
      const result = await graph.invoke({
        claimedRun,
        executionContext,
        sourceEvent: toRequestedStageEvent(sourceEvent),
      });

      if (result.finalizedSession) {
        this.dependencies.eventPublisher?.publishSessionFinalized(
          result.finalizedSession,
        );
      }
    } catch (error) {
      await this.handleClaimedRunFailure(
        claimedRun,
        sourceEvent,
        error,
        executionContext,
      );
    }
  }
}
