# Electron Interview Coach Phase 2-3 Execution Plan

## Scope

This document expands the implementation work for:

- Phase 2: Architectural skeleton
- Phase 3: Persistence and session lifecycle

It is derived from `electron-interview-coach.plan.md` and intentionally does not re-cover Phase 1 or later capture and analysis phases.

## Current Status

Current implementation status for the work described in this document:

1. Phase 2: partially done
2. Phase 3: partially done

Completed or scaffolded work already present in the repository:

- shared session lifecycle DTOs, status enums, and request validation in [`/home/chuck/interview-sentiment-analyzer/src/shared/session-lifecycle.ts`](/home/chuck/interview-sentiment-analyzer/src/shared/session-lifecycle.ts)
- domain entities for `session` and `capture` in [`/home/chuck/interview-sentiment-analyzer/src/backend/domain/session/session.ts`](/home/chuck/interview-sentiment-analyzer/src/backend/domain/session/session.ts) and [`/home/chuck/interview-sentiment-analyzer/src/backend/domain/capture/media-chunk.ts`](/home/chuck/interview-sentiment-analyzer/src/backend/domain/capture/media-chunk.ts)
- repository and infrastructure ports in [`/home/chuck/interview-sentiment-analyzer/src/backend/application/ports/session-lifecycle.ts`](/home/chuck/interview-sentiment-analyzer/src/backend/application/ports/session-lifecycle.ts)
- use-case scaffolding for `startSession`, `registerMediaChunk`, and `finalizeSession` in:
  - [`/home/chuck/interview-sentiment-analyzer/src/backend/application/use-cases/start-session.ts`](/home/chuck/interview-sentiment-analyzer/src/backend/application/use-cases/start-session.ts)
  - [`/home/chuck/interview-sentiment-analyzer/src/backend/application/use-cases/register-media-chunk.ts`](/home/chuck/interview-sentiment-analyzer/src/backend/application/use-cases/register-media-chunk.ts)
  - [`/home/chuck/interview-sentiment-analyzer/src/backend/application/use-cases/finalize-session.ts`](/home/chuck/interview-sentiment-analyzer/src/backend/application/use-cases/finalize-session.ts)
- thin controller and IPC registration scaffolding in:
  - [`/home/chuck/interview-sentiment-analyzer/src/backend/interfaces/controllers/session-lifecycle-controller.ts`](/home/chuck/interview-sentiment-analyzer/src/backend/interfaces/controllers/session-lifecycle-controller.ts)
  - [`/home/chuck/interview-sentiment-analyzer/src/backend/infrastructure/ipc/session-lifecycle-channels.ts`](/home/chuck/interview-sentiment-analyzer/src/backend/infrastructure/ipc/session-lifecycle-channels.ts)
  - [`/home/chuck/interview-sentiment-analyzer/src/backend/infrastructure/ipc/register-session-lifecycle-ipc.ts`](/home/chuck/interview-sentiment-analyzer/src/backend/infrastructure/ipc/register-session-lifecycle-ipc.ts)
  - [`/home/chuck/interview-sentiment-analyzer/src/backend/index.ts`](/home/chuck/interview-sentiment-analyzer/src/backend/index.ts)
- deterministic storage layout resolution in [`/home/chuck/interview-sentiment-analyzer/src/backend/infrastructure/storage/session-storage-layout.ts`](/home/chuck/interview-sentiment-analyzer/src/backend/infrastructure/storage/session-storage-layout.ts)
- temporary in-memory persistence in [`/home/chuck/interview-sentiment-analyzer/src/backend/infrastructure/persistence/in-memory-session-lifecycle.ts`](/home/chuck/interview-sentiment-analyzer/src/backend/infrastructure/persistence/in-memory-session-lifecycle.ts)

Remaining work before Phase 2 is complete:

- expose the session lifecycle bridge from preload to the renderer
- register lifecycle IPC handlers from Electron main at runtime
- complete or stub the remaining module boundaries for `analysis`, `coaching`, and `user-profile`
- add provider interfaces for later downstream analysis integration

Remaining work before Phase 3 is complete:

- replace in-memory persistence with SQLite-backed repositories and mappers
- ensure backend runtime wiring includes the current backend code path
- implement durable metadata storage and repository mapping validation
- implement recovery queries and startup recovery coordination
- add validation coverage for repository behavior, lifecycle transitions, and failure paths

## Source Constraints To Preserve

- Keep the request flow: `renderer -> preload bridge -> controller -> use-case/service -> repository/provider -> response`.
- Keep controllers thin and repositories logic-free.
- Keep domain types free of Electron, IPC, SQLite, and filesystem APIs.
- Write chunk files to disk first, then persist chunk references in SQLite.
- Treat SQLite as metadata and state storage, and the filesystem as artifact storage.

## Phase 2 Dependencies

Phase 3 should assume Phase 2 has already produced the following stable seams:

1. `session`, `capture`, `analysis`, `coaching`, and `user-profile` module boundaries.
2. Shared request and response DTOs for session lifecycle actions.
3. Repository interfaces for session and chunk persistence.
4. Provider interfaces for downstream analysis work.
5. Thin IPC controller entrypoints for `startSession`, `registerMediaChunk`, and `finalizeSession`.

If any of the above are missing, complete them before Phase 3 implementation begins.

## Phase 3 Overview

Phase 3 establishes durable local-first session management. The output of this phase is a backend that can:

- create a session with deterministic storage roots
- register chunk metadata only after files exist on disk
- reconstruct in-progress work after an app restart
- finalize a session without losing artifact references

## Persistence Design

### Primary Records

Implement the first durable persistence model around these records:

1. `session`
   - identifiers, timestamps, lifecycle status
   - storage root and derived artifact directories
   - capture capabilities detected at session start
   - summary metadata such as completion and recovery markers
2. `media_chunk`
   - chunk identifier and owning session identifier
   - source type such as microphone, screen-video, screenshot, or system-audio
   - on-disk relative path
   - file timestamps, byte size, checksum if available
   - processing status for downstream work
3. `session_job` or equivalent status record
   - optional queued work tied to a session or chunk
   - retry and last-error metadata
   - timestamps needed for recovery and idempotent replays

### Persistence Tasks

1. Define repository contracts for session reads, session writes, chunk registration, and recovery queries.
2. Define persistence models separately from domain entities so SQLite schema changes do not leak upward.
3. Add mappers for:
   - domain entity to persistence row
   - persistence row to domain entity
   - shared DTO to domain command
4. Keep lifecycle rules out of repository implementations. Repositories should only persist and retrieve data.
5. Reserve explicit fields for idempotency keys or unique constraints on session identifiers and chunk identifiers.
6. Add timestamps for `createdAt`, `updatedAt`, and lifecycle milestones needed for recovery.

### Schema Decisions To Lock Before Coding

Lock these decisions before repository implementation starts:

1. Canonical session status values.
   - Recommended: `pending`, `active`, `finalizing`, `completed`, `failed`
2. Canonical chunk status values.
   - Recommended: `registered`, `queued`, `processed`, `failed`
3. Whether job tracking lives in a separate `session_job` table or as status columns on `media_chunk`.
4. Which paths are stored as relative paths versus absolute paths.
   - Prefer relative paths under the session root so app-data relocation remains possible.
5. Which fields participate in uniqueness constraints.
   - At minimum: `session.id` and `media_chunk.id`

## App-Data Layout

Use a deterministic layout rooted in Electron app-data storage:

```text
<appData>/interview-sentiment-analyzer/
  sessions/
    <sessionId>/
      session.json
      chunks/
        audio/
        screen-video/
        screenshots/
      transcripts/
      summaries/
      temp/
```

`session.json` is optional and should only exist if it provides fast recovery or debugging value beyond SQLite. SQLite remains the source of truth for metadata.

### Layout Tasks

1. Create a storage-path resolver that derives all paths from `sessionId` and `chunkId`.
2. Keep file categories stable even if some are empty for a session.
3. Separate durable outputs from temporary work files.
4. Store only relative artifact paths in SQLite.
5. Ensure directory creation is idempotent so repeated `startSession` calls for the same session do not corrupt storage.
6. Add a clear ownership rule for cleanup of `temp/` artifacts during finalization or recovery.

### Path Rules

1. Session root must be derivable from `sessionId` alone.
2. Chunk file paths must be derivable from `sessionId`, chunk source, and `chunkId`.
3. Derived artifact paths must not depend on renderer state.
4. Filesystem writes must happen through infrastructure helpers, never directly from controllers or domain code.

## Session Lifecycle Implementation

### `startSession`

Implementation tasks:

1. Validate the start request and normalize requested capture capabilities.
2. Generate or accept a session identifier.
3. Resolve the session storage root and create required directories.
4. Persist the initial session record with detected capabilities and status.
5. Return a response containing the session identifier, storage roots needed by backend code, and initial status.

Acceptance conditions:

- session creation is atomic from the caller's perspective
- repeated calls with the same idempotency key do not create duplicate sessions
- directory creation and metadata persistence stay consistent

### `registerMediaChunk`

Implementation tasks:

1. Validate session existence and confirm the target chunk file already exists on disk.
2. Derive the persisted relative path from the storage resolver instead of trusting renderer-provided paths.
3. Persist chunk metadata only after the file existence check succeeds.
4. Record file metadata needed for recovery such as size and created timestamp.
5. Optionally enqueue downstream work after the chunk record has been committed.

Acceptance conditions:

- registration fails if the file is missing
- registration is safe to retry for the same `chunkId`
- no database row points to a non-existent file at the moment of successful registration

### `finalizeSession`

Implementation tasks:

1. Load the active session and confirm it is eligible for finalization.
2. Mark the session as `finalizing` before downstream summary preparation starts.
3. Persist completion metadata and any final artifact paths.
4. Transition the session to `completed` only after final metadata is durable.
5. Leave enough recovery metadata to resume or repair incomplete finalization on restart.

Acceptance conditions:

- finalization is idempotent
- completed sessions keep stable paths to chunks and derived artifacts
- interrupted finalization can be resumed without duplicating completion work

## Crash Recovery And Idempotency

### Recovery Tasks

1. Add repository queries for:
   - active sessions
   - sessions stuck in `finalizing`
   - chunks registered but not yet processed
2. Rebuild in-progress session state from SQLite plus on-disk artifacts during app startup.
3. Detect missing files for registered chunks and surface them as recoverable integrity issues.
4. Decide how orphaned files are handled when a chunk file exists on disk with no corresponding row.
5. Add a recovery coordinator that is triggered from the main-process startup path, not from the renderer.

### Idempotency Rules

1. `startSession` must return the existing session when the same request is replayed intentionally.
2. `registerMediaChunk` must treat duplicate registrations for the same `chunkId` as a no-op or a consistency check failure, never as a second insert.
3. `finalizeSession` must return a stable completed result when called again for an already completed session.

## Validation Checkpoints

### Layering Validation

Complete these checks before Phase 3 is considered done:

1. Domain and application code do not import Electron modules, SQLite bindings, or filesystem APIs.
2. Controllers contain no business rules, path construction logic, or direct persistence calls beyond invoking application services.
3. Repository implementations do not perform lifecycle transitions or validation decisions that belong in use cases.
4. Shared DTO validation happens at the boundary before use-case execution.

### Repository Behavior Validation

Validate repository behavior with focused tests or equivalent automated checks:

1. row-to-domain and domain-to-row mappings are reversible for session and chunk records
2. repository writes preserve relative paths exactly as designed
3. duplicate session or chunk identifiers follow the chosen uniqueness and idempotency rules
4. recovery queries return active, finalizing, and incomplete-processing records correctly

### Session And Chunk State Transition Validation

Validate the lifecycle rules directly at the use-case layer:

1. `startSession` transitions from no record to `pending` or `active` exactly once
2. `registerMediaChunk` cannot succeed for a missing session
3. `registerMediaChunk` cannot succeed before the file exists on disk
4. chunk status does not move backward during normal retries
5. `finalizeSession` only applies to an active or finalizing session
6. repeated `finalizeSession` calls keep the session in a stable terminal state

### Failure-Path Validation

Include explicit checks for:

1. filesystem write succeeds but metadata persistence fails
2. metadata persistence succeeds but downstream queueing fails
3. app restarts while a session is active
4. app restarts while a session is finalizing
5. a registered chunk file has been deleted before recovery runs

## Suggested Implementation Order

1. Lock schema decisions and status enums.
2. Implement storage-path resolution and directory creation helpers.
3. Implement repository interfaces, SQLite models, and mappers.
4. Implement `startSession`.
5. Implement `registerMediaChunk` with the file-first rule.
6. Implement `finalizeSession`.
7. Implement startup recovery and idempotency handling.
8. Add validation coverage for layering, repositories, and state transitions.

## Done Criteria

Phase 3 is complete when:

1. a new session can be created with deterministic local storage
2. chunk metadata is only persisted after the chunk file exists
3. session finalization is durable and repeat-safe
4. restart recovery can discover in-progress sessions and incomplete chunk work
5. automated validation covers repository mapping, layering boundaries, and session/chunk lifecycle rules
