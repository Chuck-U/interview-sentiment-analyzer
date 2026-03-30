---
name: ipc-refactor
overview: Refactor `electron/main/index.ts` by extracting IPC handlers into backend use-cases/controllers/guards, adding unit tests first, and then wiring them back in while preserving existing logging points.
todos:
  - id: transcribe-extract-guard
    content: Create a transcription request guard/parser (e.g. `parseTranscribeAudioRequest`) under `src/backend/guards/*` that validates `{sessionId, chunkId, pcmSamples, source}` and returns a strongly typed request or throws with clear error messages. Add unit tests in `src/backend/test/*` before migrating any handler code.
    status: completed
  - id: transcribe-extract-normalize
    content: "Extract Whisper/transformers raw output normalization (current `normalizeAsrOutput` logic from `electron/main/index.ts`) into a pure module with unit tests verifying `chunks[].timestamp` -> `TranscriptChunk.timestamp: [start,end]` mapping and empty-output behavior."
    status: completed
  - id: transcribe-extract-usecase
    content: "Create `transcribeAudio` use-case under `src/backend/application/use-cases/transcribe-audio.ts` that composes: (1) pipeline retrieval (`modelLifecycle.getPipeline`), (2) invoking the pipeline on PCM, (3) normalization, (4) transcript artifact building + persistence under `sessions/<id>/transcripts/<chunkId>.json`. Use dependency injection so pipeline + disk are mocked in tests. Add unit tests for persistence path and artifact field names (including `segments`/`transcript` legacy field)."
    status: completed
  - id: transcribe-extract-controller
    content: Create `src/backend/interfaces/controllers/transcription-controller.ts` that adapts the IPC payload to the use-case (the function you pass to `ipcMain.handle(TRANSCRIPTION_CHANNELS.transcribeAudio, handler)`). Ensure current logging points remain with identical keys/payload fields.
    status: completed
  - id: migrate-transcription-ipc
    content: In `electron/main/index.ts`, replace the inline transcription handler block with the controller factory output. Preserve all existing `log.ger` calls and keep the surrounding storageLayoutResolver wiring intact (or move it if needed, but ensure identical log semantics).
    status: completed
  - id: model-init-and-other-ipc-modules
    content: Extract the remaining largest IPC handler groups from `electron/main/index.ts` into controller factories (MODEL_INIT, WINDOW_REGISTRY, SHORTCUTS, CAPTURE_OPTIONS, AI_PROVIDER, WINDOW_CONTROL). For each extracted non-trivial validation/parsing/normalization, add unit tests first; for pure wiring, keep tests minimal but ensure type safety. Continue until `electron/main/index.ts` is ~600 lines excluding logging.
    status: pending
  - id: todo-1774538213569-rfnbz7xuf
    content: "Scan backend for unused files and pipeline logic and "
    status: pending
isProject: false
---

## Goal

Reduce `electron/main/index.ts` from its current size to ~600 lines by extracting the IPC registration/handler logic into dedicated modules.

## Success Criteria

- `electron/main/index.ts` drops to ~600 lines **excluding logging statements** (logging points remain at the same semantics).
- For each extracted unit of logic (parsers/guards/normalizers/use-cases), add unit tests *before* moving the code.
- After each migration slice, run the existing test suite and `pnpm typecheck` and verify log output for transcription/model-init wiring.

## Approach (incremental)

1. Start with the transcription IPC handler block currently in `electron/main/index.ts` (roughly `1046-1184`):
  - Extract request validation into a guard.
  - Extract Whisper output normalization into a pure function.
  - Extract transcript artifact building + disk persistence into a use-case.
  - Wrap those pieces in a controller that returns the `ipcMain.handle` handler.
2. Add unit tests for each extracted pure function/use-case with mocked model pipelines.
3. Replace the inline handler with the controller.
4. Repeat the same pattern for the next-largest IPC groupings until file size target is met:
  - `MODEL_INIT_CHANNELS.`*
  - `WINDOW_REGISTRY_CHANNELS.`*
  - `SHORTCUTS_IPC_CHANNELS.`*
  - `CAPTURE_OPTIONS_CHANNELS.`*
  - `AI_PROVIDER_CHANNELS.`*
  - `WINDOW_CONTROL_CHANNELS.`*
5. Keep log.ger calls where they currently are (or move them only inside the extracted modules without changing the emitted payload keys), so existing debugging remains valid.

## Mermaid (high level)

```mermaid
flowchart LR
  Renderer[Renderer calls preload bridge]
  Preload[preload/transcriptionBridge]
  IPC[ipcMain.handle in electron/main/index.ts]
  Controller[Transcription controller]
  UseCase[transcribeAudio use-case]
  Pipeline[Transformers.js whisper pipeline]
  Disk[write transcript artifact under sessions/<id>/transcripts/<chunkId>.json]

  Renderer --> Preload --> IPC --> Controller --> UseCase --> Pipeline --> Disk
```



## Implementation Notes

- New guard/normalization helpers should live under `src/backend/guards/*` (continuing the `checks.ts` pattern, but per-topic guard modules for anything non-trivial).
- New business logic should live under `src/backend/application/use-cases/*`.
- New IPC adaptation should live under `src/backend/interfaces/controllers/*` as controller factories that return an `ipcMain.handle`-compatible function.
- Unit tests should live under `src/backend/test/*` and run via the existing `node --test dist-electron/src/backend/test/*.test.js` script (no jest switch).

