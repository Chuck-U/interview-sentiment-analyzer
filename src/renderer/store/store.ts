import { configureStore } from "@reduxjs/toolkit";

import captureOptionsReducer from "./slices/captureOptionsSlice";
import sessionRecordingReducer from "./slices/sessionRecordingSlice";
import shortcutsWindowReducer from "./slices/shortcutsWindowSlice";
import viewsReducer from "./slices/viewsSlice";

export const store = configureStore({
  reducer: {
    views: viewsReducer,
    sessionRecording: sessionRecordingReducer,
    captureOptions: captureOptionsReducer,
    shortcutsWindow: shortcutsWindowReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
