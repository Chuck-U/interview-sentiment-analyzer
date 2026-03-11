Electron Interview Coach Architecture

Recommendation

Use `Electron + React + TypeScript + electron-builder` rather than Next.js for v1. The app is desktop-native first, and the hardest problems are overlay windows, capture permissions, local media handling, and secure background processing rather than web routing or SSR.

Current repo is effectively a blank slate, with only [/home/chuck/interview-sentiment-analyzer/package.json](/home/chuck/interview-sentiment-analyzer/package.json) in place.

Closest Existing Tools

Near matches found during research:





Verve AI desktop app: transparent overlay, click-through mode, hotkey screen capture, hide from dock/taskbar.



Glimp: interview copilot with overlay, live audio capture, screen analysis, and post-call analytics.



AssistBee: invisible overlay, low-latency transcription, screen analysis, and cross-platform meeting support.

These are close on overlay and real-time assistance, but they appear optimized for live answer generation. Your product can differentiate by centering persistent local evidence capture, structured interview analysis, and end-of-session coaching.

Proposed System Boundaries





Electron main process: window lifecycle, permissions, overlay control, capture orchestration, background job scheduling.



Preload bridge: narrow IPC API with contextIsolation enabled and nodeIntegration disabled.



Renderer app: React UI for onboarding, session controls, permissions, playback, transcript review, coaching, and settings.



Worker/pipeline layer: Node-side jobs for chunk assembly, local transcription/diarization, multimodal analysis, summarization, embeddings, retry handling.



Persistence layer: SQLite for metadata and state, filesystem/object layout for raw media and derived artifacts.



Model sidecar: a local Python or native worker for speech-heavy inference that is awkward to run directly in Node.

Suggested Project Shape





electron/main/ for app bootstrap, windows, IPC handlers, permissions, tray, shortcuts.



electron/preload/ for secure renderer API exposure.



src/renderer/ for React UI.



src/shared/ for shared TypeScript types, DTOs, prompt schemas, and validation.



src/workers/ for long-running jobs such as transcription and analysis.



src/pipelines/ for orchestrated agentic flows.



src/sidecar/ or services/ml/ for local ML service wrappers and process management.



data/ or app-data path for local sessions, chunks, screenshots, exports.

Base Layer Setup

Initialize the repository around `electron-builder` with a Vite-powered React renderer and TypeScript as the default language boundary across main, preload, renderer, and shared code.

Frontend foundation for the renderer should include:

pnpm as the package manager

Tailwind CSS v4

TypeScript project configuration with a shared tsconfig base plus renderer and Electron-specific variants as needed

ESLint for TypeScript and React

Prettier for formatting

shadcn/ui instead of Base UI

Use the following shadcn initialization command for the renderer foundation:

`pnpm dlx shadcn@latest init --preset avSMx8s --template vite`

Base-layer implementation tasks should start with:

1. Initialize and configure the Electron + `electron-builder` repository.
2. Set up the Vite React renderer with TypeScript.
3. Add Tailwind CSS v4 and verify it works in the renderer.
4. Configure tsconfig structure for Electron main, preload, renderer, and shared code.
5. Configure ESLint and Prettier baselines.
6. Initialize shadcn/ui with the provided preset and Vite template.
7. Establish the initial folder layout for `electron/main/`, `electron/preload/`, `src/renderer/`, `src/shared/`, `src/workers/`, and `src/pipelines/`.

Electron Builder Install And Config Breakdown

Break the base-layer setup into the following implementation sequence:

1. Normalize `package.json` around `electron-builder`, Electron runtime, and Vite React scripts.
2. Create Electron entrypoints for `main` and `preload`.
3. Create the Vite React renderer entrypoint and mount path.
4. Split TypeScript config into shared base, Electron runtime config, and renderer config.
5. Add dev scripts that run the Vite dev server, wait for it, and then launch Electron.
6. Add production build scripts that compile Electron code and build the renderer separately.
7. Configure `electron-builder` to package both Electron output and renderer output.
8. Verify local dev launch first, then packaged build output.

Recommended script phases:

- `dev:renderer`
- `dev:electron`
- `dev`
- `build:renderer`
- `build:electron`
- `build`
- `dist`

Core Data Model

Persist locally first; send only required payloads to hosted APIs.

Primary entities:





session: interview metadata, start/end times, platform, job context, capture capabilities.



user_profile: optional coaching preferences, communication style settings, neurodiversity-aware support toggles, retention rules.



media_chunk: references to local audio/video/screenshot artifacts, timestamps, source type, checksum, upload/analyze status.



transcript_segment: speaker-attributed text with timing and confidence.



analysis_chunk: structured per-window output such as sentiment, engagement, interruptions, answer quality, interviewer reaction signals, and ambiguity/cue-mismatch markers.



derived_signal: local weak signals such as talk-time balance, pause length, overlap, speaking rate, hedging frequency, and coarse vocal affect.



session_summary: condensed summary, embedding/vector reference or summary text, final coaching output.



job: durable background task state for transcription, upload, analysis, retries, failure recovery.

Capture And Analysis Flow

flowchart LR
userAction[UserStartsSession] --> captureMgr[CaptureManager]
captureMgr --> audioCap[AudioChunks]
captureMgr --> screenCap[ScreenAndVideoChunks]
audioCap --> localStore[LocalMediaStore]
screenCap --> localStore
localStore --> dbRefs[SQLiteChunkRefs]
dbRefs --> localSpeech[LocalSpeechStack]
dbRefs --> visionJob[MultimodalAnalysisJob]
localSpeech --> localSignals[DerivedSignals]
localSignals --> chunkAnalysis[ChunkAnalysis]
visionJob --> chunkAnalysis
chunkAnalysis --> condensedContext[CondensedContext]
condensedContext --> finalReview[EndSessionReview]
finalReview --> coaching[CoachingOutput]

Local On-Device Analysis Stack

Use local models for the first-pass evidence layer, then let hosted models synthesize higher-level coaching.





faster-whisper: primary local chunk transcription engine.



whisper.cpp: future embedded or lower-resource fallback, especially for CPU-first/offline modes.



pyannote.audio: speaker diarization for who-spoke-when, interruptions, overlap, and talk-time balance.



SpeechBrain emotion models: weak-signal vocal affect only, not final sentiment or diagnosis.



Lightweight local text classifiers: transcript chunk tagging for sentiment, hedging, uncertainty, clarity, and answer structure.

This should be treated as a feature-extraction layer, not a final judgment layer. The best local outputs are usually operational signals such as:





speaker turns



silence and pause patterns



overlap and interruption rate



speaking rate and pacing shifts



coarse affect trend



transcript-level sentiment and confidence cues

Neurodiversity-Aware Coaching Mode

Support users who identify as autistic or ADHD by tailoring analysis and coaching to interaction friction, not by inferring anyone else's condition.

Design principles:





Do not label or infer whether an interviewer has autism, ADHD, or any other condition.



Focus instead on observed interaction patterns: ambiguity, pacing, interruptions, cue mismatch, turn-taking, and unclear intent.



Let the candidate opt into support modes and preferred feedback style in user_profile.

Candidate-facing outputs can emphasize:





ambiguity detection: questions or interviewer responses that were underspecified, indirect, or implied rather than explicit



pacing analysis: whether responses were too fast, too slow, over-detailed, or cut short



cue mismatch: moments where transcript tone, pauses, or interviewer follow-ups suggest misunderstanding or missed conversational cues



interruption handling: whether the candidate was cut off, spoke over others, or missed a turn-taking opening



reframe coaching: plain-language rewrites for what the interviewer likely meant and how to answer more clearly next time

This mode should produce accessibility-oriented feedback such as "the question contained implicit assumptions" or "the interviewer shifted topics without a verbal transition," rather than personality or condition labels.

Capture Architecture Decisions





Treat capture sources independently: microphone, system audio, webcam, screen/window stills, screen video.



Chunk locally on a fixed cadence, for example 15 to 30 seconds for audio/video and event-driven or interval-based screenshots.



Write chunks to disk first, then register references in SQLite so the system can recover after crashes.



Use capability detection at runtime and degrade gracefully per OS.

Important cross-platform constraint:





Linux support is the highest-risk target for reliable system audio capture and overlay behavior.



macOS typically needs extra handling for system audio loopback and explicit Screen Recording permissions.



Windows is generally the least restrictive for capture, but still needs per-device testing.

Because you want all-desktop support, the plan should treat microphone + screenshots + optional screen video as the stable baseline and system audio as a capability that may vary by OS.

Overlay Strategy





Use a separate transparent always-on-top overlay window.



Keep overlay responsibilities narrow: recording status, live cues, quick markers, session controls, possibly short coaching prompts.



Keep heavy controls in a standard settings/session window.



Design for fallbacks where overlay invisibility or click-through behavior is inconsistent on some OS/window-manager combinations.

Agentic Pipeline Shape

Break the backend-like logic into durable stages:





ingest: chunk registered locally.



extract_local_signals: transcription, diarization, pacing, overlap, vocal affect, and transcript tagging.



analyze_chunk: multimodal prompt for interviewer/candidate dynamics and reaction signals using local evidence plus selected media.



condense_context: rolling summary or embedding update for later augmentation.



specialize_feedback: optional candidate-selected coaching lens such as neurodiversity-aware interpretation.



final_synthesize: end-of-session overall impression, strengths, weaknesses, and coaching plan.



export: optional report, timeline, or practice recommendations.

Hosted APIs should be invoked only from the Node-side worker/pipeline layer, never from the renderer.

Backend Architecture

Use a domain-driven backend structure on the desktop side of the app. Apply this to Electron main-process code, background workers, pipelines, and persistence-facing code. Keep the React renderer UI-focused.

Layer responsibilities:

- `controller`: IPC handlers, background task triggers, and request/response mapping only.
- `service` or `application`: orchestration layer that coordinates repositories, validations, external providers, and workflow sequencing.
- `use-case`: explicit business actions such as `startSession`, `registerMediaChunk`, `analyzeChunk`, and `finalizeSession`.
- `domain`: entities, value objects, invariants, and domain policies with no Electron or database concerns.
- `persistence`: repositories and mappers only, with no business logic.

Backend request flow:

`renderer -> preload bridge -> controller -> use-case/service -> repository/provider -> response`

Background flow:

`chunk-created -> worker controller -> use-case -> local model adapters + persistence -> hosted provider -> persistence`

Suggested backend layout:

- `src/backend/domain/`
- `src/backend/application/use-cases/`
- `src/backend/application/services/`
- `src/backend/interfaces/controllers/`
- `src/backend/infrastructure/persistence/`
- `src/backend/infrastructure/providers/`
- `src/backend/infrastructure/ipc/`

Suggested domain modules:

- `session`
- `capture`
- `transcription`
- `analysis`
- `coaching`
- `user-profile`

Security And Privacy Baseline





Keep raw recordings and chunk files local by default.



Send only the minimum needed chunk payloads to hosted APIs for processing.



Store provider keys outside the renderer surface.



Make retention rules explicit and configurable per session.



Log pipeline events and failures without logging full sensitive content by default.



Treat neurodiversity support as user-declared preference data, with clear consent and easy opt-out.

Build-First Validation Sequence

Before full implementation, validate these spikes in order:





Cross-platform screen and microphone capture with chunk persistence.



Overlay window behavior: transparency, click-through, focus, always-on-top reliability.



System audio feasibility on macOS, Windows, and Linux.



Local speech stack performance for faster-whisper plus pyannote.audio on realistic desktop hardware.



Durable background job execution and recovery after app restart.



Latency of chunk upload plus hosted transcription/multimodal analysis.



Quality of ambiguity, pacing, and cue-mismatch feedback in neurodiversity-aware coaching mode.

Initial Scope Recommendation

For v1 architecture, optimize for:





Post-interview coaching first.



Optional low-risk in-session cues second.



Full real-time answer generation later, after capture reliability and privacy boundaries are solid.



Local evidence extraction first, hosted synthesis second.



Neurodiversity-aware coaching as an opt-in feedback lens, not a diagnostic or labeling system.

That sequencing better matches your stated flow and avoids over-optimizing for stealth-overlay behavior before the core evidence and coaching pipeline is trustworthy.

Base Layer Task Adjustment

Replace any earlier Base UI assumption with shadcn/ui for the renderer component system.

For implementation sequencing, the base layer should now prioritize repository initialization and frontend/tooling setup before capture and pipeline spikes:

1. Electron + `electron-builder` bootstrap
2. Vite React renderer wiring
3. TypeScript and lint/format foundations
4. Tailwind CSS v4 setup
5. shadcn/ui initialization
6. Shared app shell and window scaffolding

Implementation Plan

Phase 1: Desktop foundation

1. Normalize `package.json`, build scripts, and `electron-builder` config.
2. Create `electron/main`, `electron/preload`, and `src/renderer` entrypoints.
3. Add `tsconfig.json`, `tsconfig.electron.json`, and `tsconfig.renderer.json`.
4. Wire Vite React dev/prod flows with Electron main-process loading logic.
5. Add ESLint, Prettier, and Tailwind CSS v4.
6. Run `pnpm dlx shadcn@latest init --preset avSMx8s --template vite`.

Phase 2: Architectural skeleton

1. Create DDD backend folders for `domain`, `application`, `interfaces`, and `infrastructure`.
2. Define first domain modules: `session`, `capture`, `analysis`, `coaching`, and `user-profile`.
3. Add initial controllers, use-case stubs, repository interfaces, and provider interfaces.
4. Add shared schemas and DTO validation between preload, renderer, and backend.

Phase 3: Persistence and session lifecycle

1. Add SQLite-backed persistence with logic-free repositories and mappers.
2. Implement `startSession`, `registerMediaChunk`, and `finalizeSession` use cases.
3. Establish local app-data file layout for chunks, screenshots, transcripts, and summaries.

Phase 4: Local signal extraction

1. Add local sidecar/process orchestration for `faster-whisper`, `pyannote.audio`, and weak-signal classifiers.
2. Persist transcript segments, speaker turns, pacing, overlap, and ambiguity-related derived signals.
3. Keep local inference as evidence extraction, not final judgment.

Phase 5: Hosted analysis and coaching

1. Add provider adapters for hosted multimodal analysis.
2. Implement chunk analysis, rolling context condensation, and final session synthesis.
3. Add neurodiversity-aware coaching as an opt-in feedback lens centered on ambiguity, pacing, interruption handling, and cue mismatch.

Phase 6: Capture and overlay spikes

1. Validate microphone, screen capture, and optional system-audio behavior across macOS, Windows, and Linux.
2. Prototype overlay window behavior, click-through mode, and always-on-top reliability.
3. Add platform capability detection and graceful fallbacks.