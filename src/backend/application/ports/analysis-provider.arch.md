## Hosted analysis provider contracts and routing

This diagram focuses on how `PipelineOrchestrator` delegates to `AnalysisProvider`, how hosted stages are routed through provider-agnostic adapters, and how normalized metadata and structured outputs are written back into pipeline artifacts and events.

```mermaid
flowchart LR
    subgraph Pipeline["Pipeline Execution (per chunk/session)"]
      Evt[*.requested event<br/>(e.g. analyze_chunk.requested)]
      Run[PipelineStageRunRecord]
      Orc[PipelineOrchestrator]
      Prov[LocalPipelineAnalysisProvider]
    end

    subgraph Artifacts["Artifacts + Events"]
      InArt[inputArtifacts<br/>(JSON/markdown)]
      OutArt[outputArtifacts<br/>(JSON with hosted output)]
      EvtReady[*.ready event<br/>(e.g. chunk.analysis.ready)]
    end

    subgraph HostedLayer["Hosted adapter layer"]
      R[HostedAnalysisStageRouter]

      subgraph OpenAI["OpenAIHostedAnalysisAdapter (default)"]
        OA1[analyzeChunk]
        OA2[condenseContext]
        OA3[synthesizeSession]
        OA4[generateCoaching]
      end

      subgraph Google["GoogleHostedAnalysisAdapter (for condense_context)"]
        GA1[analyzeChunk]
        GA2[condenseContext]
        GA3[synthesizeSession]
        GA4[generateCoaching]
      end
    end

    subgraph OutputShape["Normalized hosted output (per artifact)"]
      Meta[HostedAnalysisMetadata:<br/>provider, model,<br/>promptVersion, schemaVersion,<br/>usage, latencyMs,<br/>estimatedCostUsd?, rawResponseRef?]
      Struct[Structured JSON payload:<br/>ChunkAnalysis / ContextSummary /<br/>SessionSummary / Coaching]
      Stored["Filesystem JSON artifact<br/>(artifactKind: chunk-analysis / context-summary /<br/>session-summary / coaching-feedback)"]
    end

    %% Orchestrator flow
    Evt --> Run --> Orc --> Prov

    %% Provider receives request + artifacts
    Prov --> InArt

    %% Hosted stage path
    Prov -->|hosted stage (analyze_chunk, condense_context, session.summary, coaching)| R

    %% Router chooses provider
    R -->|default| OpenAI
    R -->|"condense_context.requested"| Google

    %% Adapters perform hosted task
    OpenAI -->|HostedAnalysisTaskResponse<br/>{metadata, output}| Prov
    Google -->|HostedAnalysisTaskResponse<br/>{metadata, output}| Prov

    %% Provider wraps hosted output into artifact
    Prov --> Meta
    Prov --> Struct
    Meta --> Stored
    Struct --> Stored

    %% Artifact + metadata surface in events
    Stored --> OutArt --> EvtReady
```

