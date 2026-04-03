import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";

import type { QuestionDetectionPayload } from "@/shared/question-detection";

import { applyDetectedLengthSync } from "./slices/questionBoxSlice";
import {
  clearDetectedQuestions,
  clearDetectedQuestionsForSession,
  questionDetected,
} from "./slices/questionSlice";

type QuestionBoxListenerState = {
  readonly questions: { readonly detected: readonly QuestionDetectionPayload[] };
};

export const questionBoxListenerMiddleware = createListenerMiddleware();

questionBoxListenerMiddleware.startListening({
  matcher: isAnyOf(
    questionDetected,
    clearDetectedQuestions,
    clearDetectedQuestionsForSession,
  ),
  effect: (_action, listenerApi) => {
    queueMicrotask(() => {
      const state = listenerApi.getState() as QuestionBoxListenerState;
      const n = state.questions.detected.length;
      listenerApi.dispatch(applyDetectedLengthSync({ detectedCount: n }));
    });
  },
});
