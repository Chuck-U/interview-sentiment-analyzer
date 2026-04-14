---
name: Question Detection Gradient Scoring
overview: Refactor question detection to use a gradient scoring system with all zero-shot classification labels, extract the evaluation formula into a testable pure function, and add in-memory recent-question storage accessible to downstream pipeline consumers.
todos:
  - id: extract-evaluator
    content: Extract evaluateQuestionScores pure function from mapQuestionDetectionResult in detect-live-question.ts
    status: completed
  - id: update-payload-type
    content: Add topLabel and questionConfidence to QuestionDetectionPayload in shared/question-detection.ts
    status: completed
  - id: refactor-map-result
    content: Refactor mapQuestionDetectionResult to always return a result (never null), move threshold gate to caller
    status: completed
  - id: create-memory-service
    content: Create LiveQuestionMemory service in src/backend/application/services/
    status: completed
  - id: wire-controller
    content: Update transcription controller to use extracted evaluator, threshold gate, and LiveQuestionMemory
    status: completed
  - id: wire-main
    content: Instantiate LiveQuestionMemory in electron/main/index.ts and inject into handler + session cleanup
    status: completed
  - id: update-tests
    content: Update detect-live-question tests for new evaluator function and payload shape
    status: completed
  - id: transcript-repetition-separate
    content: Execute transcript_repetition_plan on a separate agent (seam dedupe, ASR windows, idempotency)
    status: completed
isProject: false
---

# Question Detection: Gradient Scoring + Recent Question Memory

## Context

The live question detection pipeline currently uses a binary decision (question vs non-question with margin threshold). We want to:
- Use **all** zero-shot classification labels to produce a **gradient** confidence score
- **Extract** the evaluation formula into a standalone, testable function
- **Store** the most recent detected question in-memory (per session) for downstream access
- Keep the existing pipeline chain (ASR -> buffer -> classify -> publish) intact

## 1. Extract evaluation formula into pure function

**File:** [`src/backend/application/use-cases/detect-live-question.ts`](src/backend/application/use-cases/detect-live-question.ts)

Create a new pure function `evaluateQuestionScores`:

```typescript
type QuestionEvaluationResult = {
  scores: Record<string, number>;  // all label scores
  topLabel: string;
  questionConfidence: number;      // gradient 0-1
};

function evaluateQuestionScores(
  output: ZeroShotClassificationOutput
): QuestionEvaluationResult
```

- Maps each `QUESTION_CLASSIFIER_LABELS` value to its score
- Identifies the top-scoring label
- Computes `questionConfidence` where question label is primary signal, competing labels (statement, anecdote, greeting, introduction) penalize proportionally
- **Formula (starting point, tunable):** `questionConfidence = questionScore * (1 - max(statementScore, nonQuestionScore) * 0.5)`

Refactor `mapQuestionDetectionResult` to:
1. Call `evaluateQuestionScores` to get the full evaluation
2. Always return a `QuestionDetectionPayload` (never null) with all scores + `topLabel` + `questionConfidence`
3. Move the threshold/gate logic **out** to the caller (transcription controller)

## 2. Update shared payload type

**File:** [`src/shared/question-detection.ts`](src/shared/question-detection.ts)

Add to `QuestionDetectionPayload`:
- `topLabel: string`
- `questionConfidence: number`

Keep all existing score fields for backward compatibility with renderer Redux store.

## 3. Create LiveQuestionMemory service

**New file:** `src/backend/application/services/live-question-memory.ts`

```typescript
class LiveQuestionMemory {
  private store = new Map<string, QuestionDetectionPayload>();
  
  setLatestQuestion(sessionId: string, payload: QuestionDetectionPayload): void;
  getLatestQuestion(sessionId: string): QuestionDetectionPayload | null;
  clearSession(sessionId: string): void;
}
```

- Keyed by `sessionId` only (most recent question regardless of audio source)
- Single latest question per session (overwrites on each detection)

## 4. Wire into transcription controller

**File:** [`src/backend/interfaces/controllers/transcription-controller.ts`](src/backend/interfaces/controllers/transcription-controller.ts)

Changes:
- Add `questionMemory: LiveQuestionMemory` to `TranscribeAudioIpcHandlerDependencies`
- After detection, the controller checks `questionConfidence >= threshold` (configurable, default `LIVE_QUESTION_MIN_SCORE`)
- If above threshold: `questionMemory.setLatestQuestion(sessionId, result)` then `publishQuestionDetected(result)`
- If below threshold: skip publish, but the full evaluation is still available for logging/debugging

## 5. Wire in electron/main

**File:** [`electron/main/index.ts`](electron/main/index.ts)

- Instantiate `LiveQuestionMemory` at app startup (alongside `modelLifecycle`)
- Pass into `createTranscribeAudioIpcHandler`
- Call `questionMemory.clearSession(sessionId)` during session finalization

## 6. Transcript repetition plan (separate workstream)

The [transcript repetition plan](/.cursor/plans/transcript_repetition_plan_b4d08746.plan.md) (seam dedupe, ASR window tuning, transcribe idempotency) should be executed separately. It improves the **input quality** to this pipeline but is independent of the scoring/memory changes.

## Files changed (summary)

- `src/backend/application/use-cases/detect-live-question.ts` -- extract evaluator, refactor mapResult
- `src/shared/question-detection.ts` -- add topLabel + questionConfidence to payload
- `src/backend/application/services/live-question-memory.ts` -- **new** service
- `src/backend/interfaces/controllers/transcription-controller.ts` -- threshold gate, memory wiring
- `electron/main/index.ts` -- instantiate + inject LiveQuestionMemory
- `src/backend/test/detect-live-question.test.ts` -- update tests for new evaluator + payload shape
