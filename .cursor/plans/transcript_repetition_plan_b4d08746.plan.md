---
name: Transcript repetition plan
overview: A concise reference document summarizing why transcript tails repeat, what is intentional for question detection, and what fixes belong in a later implementation pass.
todos:
  - id: seam-dedupe
    content: Add word/token-level suffix–prefix overlap merge for consecutive ASR texts before question buffer or log (with tests).
    status: pending
  - id: tune-asr-windows
    content: Re-evaluate chunk_length_s / stride_length_s vs actual PCM length per capture slice; adjust to reduce internal overlap artifacts.
    status: pending
  - id: transcribe-idempotency
    content: "Optional: dedupe transcribeAudio by (sessionId, chunkId, source) if double IPC is observed."
    status: pending
isProject: false
---

# Transcript repetition: condensed findings and follow-up plan

## Problem (symptom)

Lines in `[transcrpt.log](e:/interview-sentiment-analyzer/src/backend/infrastructure/storage/session-transcript-log.ts)` (and similar rolled-up text) sometimes show **repeated words or phrases at the end**, e.g. “training training…” or “jump to jump to jump”.

## Root causes (technical)

1. **ASR internal windowing** — `[transcribe-audio.ts](e:/interview-sentiment-analyzer/src/backend/application/use-cases/transcribe-audio.ts)` passes `chunk_length_s: 30` and `stride_length_s: 5` into the Hugging Face `automatic-speech-recognition` pipeline. Overlapping windows can produce **boundary repetition** in merged `text`.
2. **No seam / overlap dedupe in app code** — `[normalize-asr-output.ts](e:/interview-sentiment-analyzer/src/backend/guards/normalize-asr-output.ts)` only shapes types; it does **not** merge overlapping spans or strip duplicate suffix/prefix between windows. The pipeline’s top-level `text` is trusted as-is.
3. **Decoder path is unlikely to duplicate PCM** — `[audio-chunk-accumulator.ts](e:/interview-sentiment-analyzer/src/lib/audio-chunk-accumulator.ts)` tracks `emittedSamples` and returns only **new** mono samples per WebM chunk, so repeated tails are **not** primarily explained by double-decoding the same audio.
4. **Optional secondary issue** — Live `transcribeAudio` has **no idempotency** by `chunkId` (unlike `[register-media-chunk.ts](e:/interview-sentiment-analyzer/src/backend/application/use-cases/register-media-chunk.ts)` for DB registration). Duplicate IPC calls could duplicate **whole** segments; that is a different failure mode than tail stutter.

## Intentional design (why things look “out of sync”)

**We intentionally accept looser text sync for question detection.** `[LiveQuestionTranscriptBuffer](e:/interview-sentiment-analyzer/src/backend/application/services/live-question-transcript-buffer.ts)` **concatenates** several short ASR `text` snippets (space-joined) until `[shouldEvaluate()](e:/interview-sentiment-analyzer/src/backend/application/services/live-question-transcript-buffer.ts)` fires, then `[transcription-controller.ts](e:/interview-sentiment-analyzer/src/backend/interfaces/controllers/transcription-controller.ts)` runs classification on that **rolled-up** string. That gives the zero-shot classifier enough context for split questions and fragments without waiting for perfect punctuation.

**Side effect:** anything logged or displayed from that rolled-up line inherits **raw** concatenation — including **model-level repetition** and **cross-chunk phrasing overlap**. The log does not imply a separate “repeat loop” in logging; it reflects **buffer + ASR output** without a cleanup pass.

## What “CTC” means here (clarification)

Moonshine in this stack is used as **seq2seq ASR via `pipeline()`**, not a custom CTC decode path. Fixing tail repetition is **overlap / seam reconciliation** (and optionally model/prompt tuning), not “add CTC collapse” in the app.

## Suggested later work (when implementing)


| Area        | Direction                                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seam stitch | Before log / question path: longest suffix–prefix overlap on **token or word** boundaries; cap overlap length; conservative merge when uncertain.    |
| ASR options | Revisit `stride_length_s` / `chunk_length_s` vs typical **per-chunk PCM duration** from capture; shorter slices may reduce internal overlap effects. |
| Idempotency | Optional: skip or replace transcript for same `(sessionId, chunkId, source)` if `transcribeAudio` is ever retried.                                   |
| Separation  | Keep **verbatim segment** for UI vs **deduped rollup** for question detection + log, if product needs both.                                          |


## One-line summary

**Tail repetition comes from ASR overlap + no text-level seam dedupe; the multi-snippet buffer is deliberate for question detection and surfaces that noise in the transcript log as a side effect.**