import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { TranscriptChunk } from "@/shared/transcription";

export type TranscriptSegment = {
  sessionId: string;
  chunkId: string;
  text: string;
  chunks?: TranscriptChunk[];
};

export type TranscriptionChunkFailure = {
  readonly chunkId: string;
  readonly message: string;
  readonly at: string;
};

export type DiarizationState = {
  segments: TranscriptSegment[];
  /** Latest ASR/decode failure for this window (not cleared on each chunk). */
  lastTranscriptionError: TranscriptionChunkFailure | null;
  /** Running count of failures since last clear (for diagnostics). */
  transcriptionFailureCount: number;
};

const initialState: DiarizationState = {
  segments: [],
  lastTranscriptionError: null,
  transcriptionFailureCount: 0,
};

const diarizationSlice = createSlice({
  name: "diarization",
  initialState,
  reducers: {
    segmentReceived(state, action: PayloadAction<TranscriptSegment>) {
      state.segments.push(action.payload);
    },
    clearTranscription(state) {
      state.segments = [];
      state.lastTranscriptionError = null;
      state.transcriptionFailureCount = 0;
    },
    transcriptionChunkFailed(
      state,
      action: PayloadAction<{ chunkId: string; message: string; at?: string }>,
    ) {
      const at = action.payload.at ?? new Date().toISOString();
      state.lastTranscriptionError = {
        chunkId: action.payload.chunkId,
        message: action.payload.message,
        at,
      };
      state.transcriptionFailureCount += 1;
    },
  },
});

export const {
  segmentReceived,
  clearTranscription,
  transcriptionChunkFailed,
} = diarizationSlice.actions;

export default diarizationSlice.reducer;
