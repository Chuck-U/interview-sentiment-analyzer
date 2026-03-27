---
name: revert-investigate-fix-capture
overview: "Stash/revert the flawed streaming audio additions, then produce a diagnostic analysis of the five distinct problems found: broken desktop capture handler, repeated per-chunk pipeline calls instead of streaming, excessive JSON/webm file writes, split chunking of combined video+audio, and a syntax error in the display media handler."
todos:
  - id: stash-revert
    content: Stash current changes and revert the 7 modified files + delete the 6 new files listed in the plan
    status: completed
  - id: fix-display-media-handler
    content: Fix the setDisplayMediaRequestHandler syntax error and ensure only one handler is registered
    status: completed
  - id: verify-clean-state
    content: Run the app and verify desktop capture + audio capture work correctly after revert
    status: pending
  - id: todo-1774552736194-fl5ps962n
    content: add pipeline for concanating recording
    status: completed
  - id: todo-1774552752644-o5o5ffdy1
    content: ""
    status: pending
isProject: false
---

# Revert, Investigate, and Fix Audio Capture

## Step 1: Stash and revert the flawed streaming additions

The following new files should be deleted (they exist only on the working tree, not in any prior commit):

- `src/backend/infrastructure/ml/source-stream-manager.ts`
- `src/backend/infrastructure/ml/diarization-artifact-writer.ts`
- `src/backend/infrastructure/ml/question-qualifier.ts`
- `src/shared/audio-stream.ts`
- `src/backend/test/source-stream-and-question.test.ts`
- `src/renderer/components/TranscriptionLog.tsx`

The following modified files should be reverted to HEAD via `git checkout HEAD -- <path>`:

- `electron/main/index.ts`
- `electron/preload/index.ts`
- `src/renderer/hooks/useRecordingSession.ts`
- `src/renderer/store/slices/diarizationSlice.ts`
- `src/renderer/main.tsx`
- `src/shared/electron-app.ts`
- `src/shared/index.ts`

The plan file itself (`main-process-streaming-transcription_fe83ede8.plan.md`) should NOT be reverted.

---

## Analysis: Five problems found

### Problem 1: Broken `setDisplayMediaRequestHandler` (syntax error)

Current code at [electron/main/index.ts](electron/main/index.ts) lines 593-602:

```typescript
session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
  desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
    if (request.source) {
      callback({ video: request.source, audio: 'loopback' })
    } else {
      callback({ video: sources[0], audio: 'loopback' })
    }); // <-- closes .then() but leaves the if/else dangling
}, { useSystemPicker: true })
```

The closing brace/paren is wrong -- the `});` on line 601 closes `.then(` while the `}` that should close the `else` block is missing. Additionally there was **already a second** `setDisplayMediaRequestHandler` registered further down (~line 1145 after the audio stream additions) which would collide. Per Electron docs, there should be exactly one call to `setDisplayMediaRequestHandler`.

The Electron docs show the correct pattern:

```typescript
session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
  desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
    callback({ video: sources[0], audio: 'loopback' })
  })
}, { useSystemPicker: true })
```

**Fix:** After reverting, the original handler (which was further down in the `whenReady` block and already working) will be restored. Any future change should ensure only one handler is registered, and the braces match.

### Problem 2: Repeated per-chunk pipeline calls instead of streaming

The terminal logs show the core design flaw. The `SourceStreamManager.processChunkInternal()` calls `await asrPipeline(chunk.pcm, { return_timestamps: true })` **once per 3-second audio chunk**. With both `microphone` and `desktop-capture` active, that means:

- Every 3 seconds, two chunks arrive (one per source)
- Each triggers a full Whisper `pipeline()` inference (~800ms each)
- Whisper runs sequentially (one ONNX session), so the second chunk blocks behind the first
- With 2 sources * ~1 inference/3s, pipeline is busy ~50-60% of the time on trivial empty-audio chunks

Evidence from terminal:

```
[source-stream] audio pushed  { pcmSamples: 47040 }    -> window finalized { textLength: 0 }
[source-stream] audio pushed  { pcmSamples: 48000 }    -> window finalized { textLength: 0 }
```

Empty `textLength: 0` results are still causing full pipeline invocations. The plan called for "streaming response when calling the model" but the implementation just ran the same batch pipeline on each chunk.

**What should happen instead:** Rather than calling `pipeline()` per chunk, audio should be accumulated into a rolling buffer and only submitted to the pipeline when there is enough audio (e.g. voice activity detected, or a silence threshold). The transformers.js Whisper pipeline does not support true streaming tokens, but you can avoid redundant calls by buffering and submitting longer windows.

### Problem 3: Excessive JSON and WebM file writes flooding app storage

Every finalized source window triggers **three** file writes:

1. **Transcript JSON** via `DiarizationArtifactWriter.writeTranscriptArtifact()` -- one `transcripts/<chunkId>.json` file per chunk
2. **Diarization log** via `DiarizationArtifactWriter.appendSourceSegment()` -- reads + rewrites `diarization/source-segments.json` every time (append-by-rewrite)
3. **WebM chunk** via `recording-persistence.ts` -- the original `persistChunk` still runs, writing a `.webm` file every 3 seconds per source

Additionally, the `recording-persistence.ts` already writes the raw WebM blob to `chunks/desktop-capture/` and `chunks/audio/` every 3 seconds. So for a 2-minute recording, the system produces:

- ~~40 microphone WebM chunks + ~40 desktop-capture WebM chunks + ~40 mic transcript JSONs + ~40 desktop transcript JSONs + ~40 diarization log rewrites + ~12 screenshots = **~~212 file writes** in 2 minutes.

**Suggestions to flag/control this:**

- Add a `CAPTURE_PERSISTENCE_MODE` config flag (e.g. `"chunked"` vs `"single-file"`) to choose between chunk-per-interval and single-continuous-file persistence
- Gate the diarization JSON writes behind a feature flag (they are only needed when the streaming transcription pipeline is active)
- The transcript JSON artifacts should only be written for chunks that actually contain non-empty text, not for `textLength: 0` results
- Consider making the diarization log a proper append-only write (`appendFile`) rather than read-parse-rewrite

### Problem 4: Combined video+audio capture is split into 3-second chunks

The plan states: "ensure that the combined video and audio capture is only stored in a single webm file, Don't split by chunking."

Currently, `desktop-capture` records a **single MediaRecorder** with video + audio tracks into a WebM muxed stream, but `capture-manager.ts` calls `requestData()` every `AUDIO_CHUNK_INTERVAL_MS` (3000ms), producing a new blob/file every 3 seconds. The renderer's `onChunkAvailable` sends each blob to the main process for persistence as a separate file.

**To produce a single WebM file per session:**

- Stop calling `requestData()` on an interval for `desktop-capture` (remove the `setInterval` for that source, or use a very long interval / only fire on stop)
- On `stop()`, the final `MediaRecorder.stop()` triggers the last `ondataavailable`, and the entire recording is in that one blob
- Alternatively, change `recording-persistence` to append chunks to a single file (WebM supports this since each blob is a valid continuation), but this is more complex -- simpler to just not chunk

**Trade-off:** Not chunking means the entire recording is held in memory until stop. For desktop capture this could be large. An alternative is to keep chunking for pipeline consumption but concatenate into a single file for the final exported artifact (the existing `recording-export.ts` already does something like this).

### Problem 5: Duplicate stream start calls

Terminal shows:

```
[source-stream] stream started       { source: 'microphone' }
[source-stream] stream started       { source: 'desktop-capture' }
[source-stream] stream already active, ignoring duplicate start  { source: 'microphone' }
[source-stream] stream already active, ignoring duplicate start  { source: 'desktop-capture' }
```

The renderer calls `audioStream.start()` in `handleStartRecording` and **again** in the `useEffect` re-attach path (lines 424-433 of `useRecordingSession.ts`). The `useEffect` fires because `currentSession` changes to `active`, so both the explicit start and the effect-driven start race. This is a minor bug but adds unnecessary IPC calls.

---

## Summary of recommended next steps after revert

1. **Fix the `setDisplayMediaRequestHandler` syntax** -- ensure exactly one handler, correctly structured per Electron docs
2. **Re-approach the streaming plan** with audio buffering instead of per-chunk pipeline calls -- accumulate a rolling window (e.g. 10-30s) and only invoke Whisper when there is meaningful audio
3. **Add persistence flags** for chunked vs single-file WebM output, and gate diarization JSON writes behind a feature flag
4. **For desktop-capture**, stop the `requestData()` interval so the combined video+audio is captured as a single continuous WebM
5. **Remove duplicate `audioStream.start()` calls** by gating the useEffect re-attach path with a ref that tracks whether streams were already started

