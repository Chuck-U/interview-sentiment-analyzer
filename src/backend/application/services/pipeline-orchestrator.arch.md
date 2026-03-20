## Pipeline and session lifecycle data flow

This diagram shows how the Electron UI, session lifecycle use cases, SQLite persistence, filesystem artifacts, the pipeline orchestrator, and the analysis provider fit together.

```mermaid
flowchart LR
    subgraph UI["Electron Renderer / UI"]
      A[User starts/records<br/>interview session]
      B[User stops recording<br/>and requests coaching]
    end

    subgraph Backend["Electron Main / Backend"]
      subgraph SessionLifecycle
        C[SessionLifecycleController]
        D[Use cases:<br/>startSession,<br/>registerMediaChunk,<br/>finalizeSession]
        E[SqliteSessionRepository]
        F[SqliteMediaChunkRepository]
      end

      subgraph PipelineCore
        G[SqlitePipelineEventRepository]
        H[SqlitePipelineStageRunRepository]
        I[BuiltIn / LangChain<br/>PipelineOrchestrator]
      end

      subgraph Storage
        J[Session Storage Layout<br/>(filesystem artifacts)]
      end

      subgraph AnalysisProviderLayer
        K[LocalPipelineAnalysisProvider]

        subgraph LocalStages["Local, non-hosted stages"]
          K1[transcribe_chunk]
          K2[resolve_participants]
          K3[derive_signals]
          K4[annotate_questions]
          K5[score_interaction]
          K6[update_baselines]
        end

        subgraph HostedStages["Hosted stages (provider-agnostic)"]
          K7[analyze_chunk]
          K8[condense_context]
          K9[session.summary]
          K10[coaching]
        end

        subgraph HostedRouting["Hosted adapter layer"]
          R[StaticHostedAnalysisStageRouter]

          subgraph OpenAI["OpenAIHostedAnalysisAdapter"]
            O1[analyzeChunk]
            O2[condenseContext]
            O3[synthesizeSession]
            O4[generateCoaching]
          end

          subgraph Google["GoogleHostedAnalysisAdapter"]
            G1[analyzeChunk]
            G2[condenseContext]
            G3[synthesizeSession]
            G4[generateCoaching]
          end
        end
      end

      subgraph Persistence
        L[Sqlite DB<br/>(pipeline + sessions)]
      end
    end

    %% UI -> backend
    A --> C
    B --> C

    %% Controller -> use cases
    C --> D

    %% Use cases -> DB + filesystem
    D --> E
    D --> F
    D --> G
    D --> J

    %% Orchestrator drives pipeline
    G <--> L
    H <--> L
    E <--> L
    F <--> L

    D --> I
    I --> H
    I --> G

    %% Orchestrator -> AnalysisProvider
    I --> K

    %% Local provider uses artifacts + storage
    K --> J
    K --> G

    %% Split between local and hosted stages
    K --> K1
    K --> K2
    K --> K3
    K --> K4
    K --> K5
    K --> K6
    K --> K7
    K --> K8
    K --> K9
    K --> K10

    %% Hosted stages route via router
    K7 --> R
    K8 --> R
    K9 --> R
    K10 --> R

    %% Router chooses provider
    R --> OpenAI
    R --> Google

    %% Adapters call models (conceptual)
    OpenAI -->|LLM call + response| K
    Google -->|LLM call + response| K

    %% Hosted outputs + metadata to artifacts and events
    K --> J
    K --> G

    %% Final coaching back to UI
    D --> C --> UI
```

