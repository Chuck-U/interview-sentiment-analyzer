---
name: Recording persistence simplification
overview: Flatten the chunk directory structure, share constants between frontend and backend, switch desktop-capture persistence to append-mode (single file), remove concatenation complexity, and add macOS audio capture plist keys.
todos:
  - id: shared-constants
    content: Create src/shared/recording-constants.ts and update renderer constants.ts to re-export from it
    status: completed
  - id: flatten-persistence
    content: Remove SOURCE_DIRECTORY map from recording-persistence.ts, write to flat chunksRoot, switch to appendFile for single-file output
    status: completed
  - id: fix-export
    content: Fix recording-export.ts sourceDirectories to use flat chunksRoot, replace concatenation with copyFile
    status: completed
  - id: delete-concat
    content: Delete recording-concatenation-pipeline.ts
    status: completed
  - id: flatten-layout
    content: Remove chunkSourceDirectories from session-storage-layout.ts, simplify normalizeRelativeArtifactPath
    status: completed
  - id: remove-subdirs-start
    content: Remove per-source ensureDirectory calls from start-session.ts
    status: completed
  - id: macos-plist
    content: Add NSAudioCaptureUsageDescription and NSMicrophoneUsageDescription to package.json build.mac.extendInfo
    status: completed
  - id: cleanup-util
    content: Create electron/main/cleanup-stale-artifacts.ts and call from initializeApp -- removes orphaned tmp files, empty dirs, zero-byte chunks, and legacy per-source subdirs
    status: completed
  - id: deduplicate-mime-map
    content: Consolidate duplicated MIME_TO_EXTENSION maps from recording-persistence.ts and recording-sandbox-persistence.ts into shared recording-constants.ts
    status: completed
  - id: update-tests
    content: Update recording-pipeline.test.ts assertions for flat chunk paths, remove concatenation pipeline tests, verify export with single-file persistence
    status: completed
  - id: remove-dead-code
    content: Remove unused persistTranscriptToDisk from transcription-controller.ts (currently wired but never called), and audit sandbox-recording for active usage
    status: completed
isProject: false
---

# Recording Persistence Simplification

## Step 1: Flatten directory structure and share constants

### 1a. Create shared constants file

Create `**src/shared/recording-constants.ts**` to be the single source of truth for timing, MIME candidates, and any recording-related constants used by both renderer and backend.

Move from `[src/renderer/recording/constants.ts](src/renderer/recording/constants.ts)`:

- `AUDIO_CHUNK_INTERVAL_MS` (3000)
- `DEFAULT_CHUNK_INTERVAL_MS` (15000)
- `DEFAULT_SCREENSHOT_INTERVAL_MS` (10000)
- `AUDIO_MIME_CANDIDATES`
- `VIDEO_MIME_CANDIDATES`

Then update `[src/renderer/recording/constants.ts](src/renderer/recording/constants.ts)` to re-export from `src/shared/recording-constants.ts` so all existing renderer imports continue to work unchanged.

### 1b. Flatten persistence -- remove per-source subdirectories

In `[src/backend/infrastructure/recording/recording-persistence.ts](src/backend/infrastructure/recording/recording-persistence.ts)`, remove the `SOURCE_DIRECTORY` map. All chunks write directly to `chunks/` (the flat `chunksRoot`). Filenames already include the source name (e.g. `desktop-capture-00001-<ts>.webm`) so files remain distinguishable without subdirectories.

### 1c. Fix export directory mapping

In `[src/backend/infrastructure/recording/recording-export.ts](src/backend/infrastructure/recording/recording-export.ts)` (lines 113-123), fix `sourceDirectories` so every source uses `sessionLayout.chunksRoot` directly:

```typescript
const sourceDirectories: { source: string; dir: string }[] = [
  { source: "desktop-capture", dir: sessionLayout.chunksRoot },
  { source: "microphone",      dir: sessionLayout.chunksRoot },
  { source: "webcam",          dir: sessionLayout.chunksRoot },
  { source: "system-audio",    dir: sessionLayout.chunksRoot },
  { source: "screen-video",    dir: sessionLayout.chunksRoot },
  { source: "screenshot",      dir: sessionLayout.chunksRoot },
];
```

Export's `listChunksInDirectory` already sorts by sequence number extracted from filename, so it will naturally group by source prefix when scanning a flat directory.

### 1d. Remove per-source mkdir from start-session

In `[src/backend/application/use-cases/start-session.ts](src/backend/application/use-cases/start-session.ts)` (lines 66-80), remove the six `ensureDirectory` calls for `audio/`, `webcam/`, `system-audio/`, `screen-video/`, `screenshots/`. Keep only `ensureDirectory(storageLayout.chunksRoot)`.

### 1e. Simplify session-storage-layout

In `[src/backend/infrastructure/storage/session-storage-layout.ts](src/backend/infrastructure/storage/session-storage-layout.ts)`, remove the `chunkSourceDirectories` map (lines 9-16). Update `normalizeRelativeArtifactPath` to validate that the relative path stays within `chunks/` without requiring a per-source subdirectory prefix.

---

## Step 2: Append mode for desktop-capture (Option B -- single file on disk)

### 2a. Add append-mode persistence

In `[recording-persistence.ts](src/backend/infrastructure/recording/recording-persistence.ts)`, change `persistChunk` for persisted sources to **append** to a single file per session+source rather than writing a new file per chunk:

- On first chunk for a given session+source, create file `<chunksRoot>/<source>.<ext>` (e.g. `desktop-capture.webm`).
- On subsequent chunks, `appendFile` to the same path.
- Use `appendFile` from `node:fs/promises` (stateless, no open handles to manage).
- Return a consistent `relativePath` (always `chunks/desktop-capture.webm`) and cumulative `byteSize`.

This works because `requestData()` produces sequential Matroska Cluster elements that are valid for binary concatenation (the same property the current concatenation pipeline relies on).

### 2b. Simplify export for single-file sources

In `[recording-export.ts](src/backend/infrastructure/recording/recording-export.ts)`, since desktop-capture is now a single file, `listChunksInDirectory` will find exactly one file. The existing `concatenateChunkFiles` already handles the single-chunk case with a `copyFile` (lines 46-59 of `[recording-concatenation-pipeline.ts](src/backend/infrastructure/recording/recording-concatenation-pipeline.ts)`), so export works without changes for now.

### 2c. Remove concatenation pipeline

Delete `[src/backend/infrastructure/recording/recording-concatenation-pipeline.ts](src/backend/infrastructure/recording/recording-concatenation-pipeline.ts)`. Replace the import in `recording-export.ts` with a direct `copyFile` call for the single file. This removes ~113 lines of streaming concatenation logic that is no longer needed.

---

## Step 3: Protect AI transcription pipeline + macOS permissions

### 3a. Transcription pipeline -- no changes needed

The transcription path in `[useRecordingSession.ts](src/renderer/hooks/useRecordingSession.ts)` (lines 78-143) operates on **in-memory buffers** from `onChunkAvailable`, not from persisted files on disk:

```
MediaRecorder → ondataavailable → ArrayBuffer → persistChunk (IPC)
                                              → decodeAudioToPcm (renderer, in-memory)
                                              → transcribeAudio (IPC to main process)
```

Persistence changes (flat dirs, append mode) only affect what happens after the buffer crosses IPC to the main process. The renderer-side decode and transcription call are completely independent. **No changes to this path.**

### 3b. macOS audio capture permissions

In `[package.json](package.json)` under `build.mac`, add `extendInfo` with the required plist keys:

```json
"mac": {
  "category": "public.app-category.productivity",
  "hardenedRuntime": true,
  "extendInfo": {
    "NSAudioCaptureUsageDescription": "This app captures system audio during screen recording for interview analysis.",
    "NSMicrophoneUsageDescription": "This app uses the microphone to record interview audio for sentiment analysis."
  },
  "target": [...]
}
```

This satisfies the macOS 14.2+ requirement for `NSAudioCaptureUsageDescription` when using `audio: 'loopback'` in `setDisplayMediaRequestHandler`.

---

## Step 4: Startup cleanup utility

### 4a. Create `electron/main/cleanup-stale-artifacts.ts`

A standalone module imported and called from `initializeApp()` in `electron/main/index.ts`. Runs once at startup, best-effort (all errors caught and logged, never blocks launch).

**What it cleans:**

- *Orphaned `.tmp-` files** in the appData root -- left behind by `appConfigStore`, `secretStore`, or `shortcutsConfigStore` atomic writes that crashed mid-rename. Pattern: `*.tmp-`* in the config directory.
- **Empty directories** under `sessions/<id>/chunks/` -- the old per-source subdirs (`audio/`, `webcam/`, `system-audio/`, `screen-video/`, `screenshots/`, `desktop-capture/`) that are now unused after flattening. Walk each session's `chunks/` dir, `rmdir` any empty subdirectory.
- **Zero-byte chunk files** in `sessions/<id>/chunks/` -- corrupt writes from interrupted persistence. Any `.webm` or `.ogg` file with size 0 is deleted.
- **Empty `temp/` directories** -- `tempRoot` is created per session but never used in production. Remove if empty.

**Signature:**

```typescript
export async function cleanupStaleArtifacts(appDataRoot: string): Promise<void>
```

### 4b. Wire into `initializeApp`

In `[electron/main/index.ts](electron/main/index.ts)`, call after `app.whenReady()` resolves but before window creation:

```typescript
import { cleanupStaleArtifacts } from "./cleanup-stale-artifacts";

// inside app.whenReady().then(async () => {
await cleanupStaleArtifacts(appDataRoot).catch((err) =>
  log.ger({ type: "warn", message: "[cleanup] startup cleanup failed", data: err })
);
```

---

## Step 5: Definition of done -- test updates and dead code removal

### 5a. Consolidate duplicated `MIME_TO_EXTENSION`

Both `[recording-persistence.ts](src/backend/infrastructure/recording/recording-persistence.ts)` (lines 29-39) and `[recording-sandbox-persistence.ts](src/backend/infrastructure/recording/recording-sandbox-persistence.ts)` (lines 10-18) define their own `MIME_TO_EXTENSION` map. Move to `[src/shared/recording-constants.ts](src/shared/recording-constants.ts)` (the new shared file from Step 1a) and import from both.

### 5b. Update `recording-pipeline.test.ts`

In `[src/backend/test/recording-pipeline.test.ts](src/backend/test/recording-pipeline.test.ts)`:

- **Chunk path assertions** (lines 225, 239, 250): Change from `chunks/audio/`, `chunks/screen-video/`, `chunks/screenshots/` to `chunks/` (flat). E.g.: `assert.ok(audioChunk.relativePath.startsWith("chunks/"))`.
- **Orphaned-file recovery test** (line 541): Update `"chunks/audio"` to `"chunks"`.
- **Concatenation pipeline tests**: Remove the dedicated `concatenateChunkFiles` tests (empty list, single chunk, multi-chunk, skip missing, progress callback). These test the deleted module.
- **Export tests**: Update to verify single-file copy behavior instead of multi-chunk concatenation.
- `**createTestContext`**: Currently passes `ALL_SOURCES` to `persistedSources`. Verify this still works with flat layout.

### 5c. Remove unused `persistTranscriptToDisk`

In `[src/backend/interfaces/controllers/transcription-controller.ts](src/backend/interfaces/controllers/transcription-controller.ts)` (lines 20-31), `persistTranscriptToDisk` is defined and injected into `createTranscribeAudioUseCase`, but the use case has its persistence path **commented out** (`[src/backend/application/use-cases/transcribe-audio.ts](src/backend/application/use-cases/transcribe-audio.ts)` lines 75-113). Remove the dead function and its `mkdir`/`writeFile` imports. The use case's `persistTranscriptToDisk` dependency can be made optional or removed.

### 5d. Audit sandbox-recording

`[recording-sandbox-persistence.ts](src/backend/infrastructure/recording/recording-sandbox-persistence.ts)` writes to `%Videos%/Interview Sentiment Analyzer/sandbox-captures/`. It is still actively wired:

- IPC: `beginSandboxRecording` / `saveSandboxRecording` in `[register-recording-ipc.ts](src/backend/infrastructure/ipc/register-recording-ipc.ts)`
- Main: instantiated in `[electron/main/index.ts](electron/main/index.ts)` (line ~1269)
- Renderer: called from `use-simple-media-recorder.ts`
- Tests: `[recording-sandbox.test.ts](src/backend/test/recording-sandbox.test.ts)`

**Decision needed:** If sandbox-recording is still a used feature, keep it but consolidate its `MIME_TO_EXTENSION` into shared. If it is deprecated, remove the service, IPC handlers, test file, and renderer hook. Flag for user decision during implementation.

---

## Files changed summary

- `src/shared/recording-constants.ts` -- NEW: timing, MIME candidates, `MIME_TO_EXTENSION` map
- `src/renderer/recording/constants.ts` -- re-export from shared
- `src/backend/infrastructure/recording/recording-persistence.ts` -- flatten dirs, `appendFile` single file, import shared MIME map
- `src/backend/infrastructure/recording/recording-export.ts` -- flat `chunksRoot`, replace concat with `copyFile`
- `src/backend/infrastructure/recording/recording-concatenation-pipeline.ts` -- DELETE
- `src/backend/infrastructure/recording/recording-sandbox-persistence.ts` -- import shared MIME map (or DELETE if deprecated)
- `src/backend/infrastructure/storage/session-storage-layout.ts` -- remove `chunkSourceDirectories`, simplify validation
- `src/backend/application/use-cases/start-session.ts` -- remove per-source mkdir calls
- `src/backend/interfaces/controllers/transcription-controller.ts` -- remove dead `persistTranscriptToDisk`
- `electron/main/cleanup-stale-artifacts.ts` -- NEW: startup cleanup utility
- `electron/main/index.ts` -- import and call cleanup utility
- `package.json` -- add `mac.extendInfo` with NS usage descriptions
- `src/backend/test/recording-pipeline.test.ts` -- update path assertions, remove concat tests

