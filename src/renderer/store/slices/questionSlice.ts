import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { QuestionDetectionPayload } from "@/shared/question-detection";

export type QuestionSliceState = {
  readonly detected: readonly QuestionDetectionPayload[];
};

const initialState: QuestionSliceState = {
  detected: [],
};

const questionSlice = createSlice({
  name: "questions",
  initialState,
  reducers: {
    questionDetected(state, action: PayloadAction<QuestionDetectionPayload>) {
      state.detected = [...state.detected, action.payload];
    },
    clearDetectedQuestions(state) {
      state.detected = [];
    },
    clearDetectedQuestionsForSession(
      state,
      action: PayloadAction<{ readonly sessionId: string }>,
    ) {
      const id = action.payload.sessionId;
      state.detected = state.detected.filter((q) => q.sessionId !== id);
    },
  },
});

export const {
  questionDetected,
  clearDetectedQuestions,
  clearDetectedQuestionsForSession,
} = questionSlice.actions;

export default questionSlice.reducer;
