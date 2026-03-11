# Electron Interview Coach: Phase 2-3 Execution Plan

## Purpose

This document translates the Phase 2 and Phase 3 intent from `electron-interview-coach.plan.md` into implementation-ready work for the current repository.

This version covers:

- source-derived constraints that must govern both Phase 2 and Phase 3
- a concrete Phase 2 breakdown for structure, boundaries, and shared contracts

It does not replace the source plan. The source plan remains the architecture and sequencing authority.

## Source-Derived Constraints For Phase 2 And Phase 3

### Architectural Constraints

The backend side of the desktop app must use a domain-driven structure and keep the React renderer UI-focused.

Required responsibility split:

- `controller`: IPC handlers, background task triggers, and request/response mapping only
- `application/service`: orchestration across repositories, validation, providers, and workflow sequencing
- `use-case`: explicit business actions such as `startSession`, `registerMediaChunk`, and `finalizeSession`
- `domain`: entities, value objects, invariants, and policies with no Electron or database concerns
- `persistence`: repositories and mappers only, with no business logic

Required request paths:

- foreground flow: `renderer -> preload bridge -> controller -> use-case/service -> repository/provider -> response`
- background flow: `chunk-created -> worker controller -> use-case -> local model adapters + persistence -> hosted provider -> persistence`

Additional structural constraints:

- hosted APIs are called only from the Node-side worker or pipeline layer, never from the renderer
- raw recordings and chunk files remain local by default
- provider keys remain outside the renderer surface
- retention rules must be explicit and configurable per session

### Data Model Constraints

Phase 2 contracts and Phase 3 persistence must be shaped around the core local-first entities already identified in the source plan:

- `session`: interview metadata, start and end times, platform, job context, capture capabilities
- `user_profile`: coaching preferences, communication style settings, neurodiversity-aware support toggles, retention rules
- `media_chunk`: local artifact references, timestamps, source type, checksum, upload and analysis status
- `transcript_segment`: speaker-attributed text with timing and confidence
- `analysis_chunk`: per-window structured analysis output
- `derived_signal`: local weak signals such as pacing, overlap, and speaking rate
- `session_summary`: rolling and final summary artifacts
- `job`: durable background task state for retries, failure recovery, and pipeline progress

Phase 2 only needs the minimum contracts required to keep Phase 3 unblocked. The first stable surfaces should therefore center on:

- `session`
- `media_chunk`
- `job` status metadata needed for lifecycle orchestration
- `user_profile` retention and coaching preferences where they affect session creation

### Sequencing Constraints

The source plan imposes several ordering rules that Phase 2 must preserve in its interfaces and DTOs:

1. Chunks are written to disk before a DB reference is recorded.
2. SQLite stores metadata and lifecycle state, while the filesystem stores raw and derived artifacts.
3. Session and chunk identifiers must be sufficient to derive deterministic storage paths.
4. Lifecycle use cases are introduced in this order: `startSession`, `registerMediaChunk`, `finalizeSession`.
5. Background analysis stages happen after ingest and must be able to recover from persisted metadata plus on-disk artifacts.

These rules mean Phase 2 cannot define contracts that assume:

- direct renderer access to persistence
- database-first chunk registration
- provider-specific payloads leaking into domain entities
- hidden storage paths that are not derivable from persisted identifiers

### Current Repository Implications

The repository is still on the desktop foundation phase. Current boundaries already present:

- `electron/main` for Electron bootstrap and window lifecycle
- `electron/preload` for the secure renderer bridge
- `src/renderer` for React UI
- `src/shared` for cross-boundary types
- `src/workers` and `src/pipelines` as Node-side execution surfaces

To align the current repo with the source plan, Phase 2 should add a backend package surface without collapsing these entrypoints:

- keep `electron/main` as the Electron bootstrap layer
- keep `electron/preload` as the narrow bridge to renderer-safe APIs
- add `src/backend` for domain, application, interfaces, and infrastructure code
- extend `tsconfig.electron.json` to compile `src/backend/**/*` alongside existing Node-side sources

## Phase 2 Breakdown

### Phase 2 Goal

Create the backend skeleton that lets later persistence, worker orchestration, and capture flows plug in without rewriting public contracts or dependency direction.

### 1. Establish Backend Structure

Create the following baseline layout:

```text
src/backend/
  domain/
    session/
    capture/
    analysis/
    coaching/
    user-profile/
    shared/
  application/
    use-cases/
    services/
    ports/
  interfaces/
    controllers/
    presenters/
  infrastructure/
    persistence/
    providers/
    ipc/
    storage/
```

Repository-level adjustments required in the same step:

- update `tsconfig.electron.json` include globs to compile `src/backend/**/*`
- keep `src/shared` as the home for renderer/preload/backend DTOs and validation schemas
- keep Electron bootstrap code in `electron/main` and call into `src/backend/interfaces/controllers`
- keep preload code in `electron/preload` and expose only validated renderer-safe APIs

Definition of done:

- every new backend file fits one of the layers above
- Electron bootstrap code does not accumulate business logic
- renderer code imports shared DTOs only, not backend internals

### 2. Define First Bounded Modules

Each initial module needs only the minimum Phase 2 surface that Phase 3 lifecycle work depends on.

| Module | Minimum domain surface | Minimum DTO or schema surface | Required port or repository seam | Required use-case entrypoint |
| --- | --- | --- | --- | --- |
| `session` | session identity, status, capture capability snapshot | start/finalize session request and response DTOs | session repository | `startSession`, `finalizeSession` |
| `capture` | chunk identity, capture source, time window, checksum policy | register media chunk request and response DTOs | media chunk repository, artifact storage port | `registerMediaChunk` |
| `analysis` | analysis job status and references only | analysis job status DTOs | analysis job repository, provider port placeholder | none in Phase 2 beyond contracts |
| `coaching` | coaching lens preference and summary reference types | coaching preference DTO fragments | coaching provider placeholder | none in Phase 2 beyond contracts |
| `user-profile` | retention policy and coaching preferences | user profile snapshot DTOs | user profile repository | none in Phase 2 beyond contracts |

Rules for module definition:

- keep Phase 2 entities small and lifecycle-focused
- avoid provider-specific fields in domain types
- keep persistence shape out of domain constructors and invariants
- define status values intentionally so Phase 3 can model recovery and idempotency cleanly

### 3. Add Controller And Orchestration Seams

Introduce controllers as thin adapters for the first lifecycle actions:

- `session-controller` for `startSession` and `finalizeSession`
- `capture-controller` for `registerMediaChunk`
- optional worker-facing controller stubs for chunk-created background events

Introduce use-case stubs:

- `startSession`
- `registerMediaChunk`
- `finalizeSession`

Introduce application ports that use cases depend on instead of concrete infrastructure:

- `SessionRepository`
- `MediaChunkRepository`
- `UserProfileRepository`
- `JobRepository`
- `ArtifactStorage`
- `AnalysisProvider`
- `CoachingProvider`
- `CapabilityDetector`
- `Clock`
- `IdGenerator`

Controller boundary rules:

- validate inbound DTOs before invoking a use case
- map infrastructure errors to transport-safe responses at the controller layer
- do not let controllers coordinate multiple repositories directly

Use-case boundary rules:

- enforce business sequencing such as "artifact exists before chunk registration succeeds"
- coordinate repositories and ports, but do not know about Electron IPC objects
- return explicit result types that shared contracts can serialize cleanly

### 4. Define Shared Contracts

Stabilize the contracts that cross renderer, preload, controllers, and use cases before persistence is wired.

Create shared contract groups under `src/shared`:

- `session/contracts`
- `capture/contracts`
- `analysis/contracts`
- `user-profile/contracts`
- `common/contracts`

Define first stable request and response DTOs:

- `StartSessionRequest`
- `StartSessionResponse`
- `RegisterMediaChunkRequest`
- `RegisterMediaChunkResponse`
- `FinalizeSessionRequest`
- `FinalizeSessionResponse`
- `SessionStatusDto`
- `MediaChunkStatusDto`
- `RetentionPolicyDto`
- `CaptureCapabilityDto`

Validation requirements:

- parse and validate every preload-to-main request with shared schemas
- keep DTOs transport-safe and serializable
- use string literal unions or enums for lifecycle statuses and capture source types
- make optional fields explicit rather than relying on implicit `undefined` behavior

Contract design constraints:

- session creation must capture capability detection results and retention settings
- chunk registration must carry enough metadata to locate the already-written artifact
- finalize session must be able to mark completion without bundling later summary logic

### 5. Document Dependency Direction

Phase 2 should include a short architecture note or README in `src/backend` that makes these rules explicit:

- `domain` depends on nothing outside itself
- `application` depends on `domain` and abstract ports only
- `interfaces` depends on `application` and shared contracts
- `infrastructure` depends on ports and external libraries
- `electron/main` wires controllers and infrastructure together, but does not contain use-case logic
- `electron/preload` exposes a minimal API surface and imports shared contracts only
- `src/renderer` never imports `src/backend`

Specific anti-patterns to reject in review:

- SQLite queries inside controllers
- Electron `ipcMain` handlers invoking repositories directly
- domain entities importing `electron`, `node:fs`, or database packages
- renderer code referencing provider adapters or persistence classes

### 6. Validation Checkpoints For Phase 2

Before Phase 2 is considered complete, verify:

1. The repository contains the backend folder structure and the compiler includes it in the Electron build.
2. The first lifecycle use cases exist as callable stubs behind controllers.
3. Shared DTOs and schemas exist for the first session and chunk flows.
4. Repository and provider interfaces exist for all dependencies the use cases need.
5. `electron/main` remains a composition and bootstrap layer rather than a business-logic layer.
6. The request path `renderer -> preload -> controller -> use-case` can be traced end to end, even if persistence implementations are still placeholders.

## Carry-Forward Constraints Into Phase 3

Phase 3 work should begin only after the Phase 2 contracts above are stable enough to support:

- SQLite-backed repositories with isolated mappers
- deterministic app-data layout for sessions and chunk artifacts
- idempotent lifecycle transitions for `startSession`, `registerMediaChunk`, and `finalizeSession`
- crash recovery from SQLite metadata plus on-disk files

If a Phase 2 decision makes any of those harder, it should be reconsidered before persistence is implemented.
