import { configureStore } from "@reduxjs/toolkit";

import aiProviderReducer from "./slices/aiProviderSlice";
import captureOptionsReducer from "./slices/captureOptionsSlice";
import diarizationReducer from "./slices/diarizationSlice";
import modelInitReducer from "./slices/modelInitSlice";
import questionReducer from "./slices/questionSlice";
import sessionRecordingReducer from "./slices/sessionRecordingSlice";
import shortcutsWindowReducer from "./slices/shortcutsWindowSlice";
import viewsReducer from "./slices/viewsSlice";

export const store = configureStore({
  reducer: {
    aiProvider: aiProviderReducer,
    views: viewsReducer,
    sessionRecording: sessionRecordingReducer,
    captureOptions: captureOptionsReducer,
    diarization: diarizationReducer,
    questions: questionReducer,
    shortcutsWindow: shortcutsWindowReducer,
    modelInit: modelInitReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
