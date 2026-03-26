import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { RecordingStateSnapshot } from "@/shared/recording";
import { shouldAcceptIncomingSession } from "@/shared/session-incoming-sync";
import type { SessionSnapshot } from "@/shared/session-lifecycle";


export type SessionRecordingState = {
  readonly currentSession: SessionSnapshot | null;
  readonly feedbackMessage: string;
  readonly isStarting: boolean;
  readonly isStopping: boolean;
  readonly recordingState: RecordingStateSnapshot | null;
  readonly recordingStartTime: number | null;
};

const initialState: SessionRecordingState = {
  currentSession: null,
  feedbackMessage: "Ready to start a local recording session.",
  isStarting: false,
  isStopping: false,
  recordingState: null,
  recordingStartTime: null,
};

const sessionRecordingSlice = createSlice({
  name: "sessionRecording",
  initialState,
  reducers: {
    setFeedbackMessage(state, action: PayloadAction<string>) {
      state.feedbackMessage = action.payload;
    },
    setRecordingState(
      state,
      action: PayloadAction<RecordingStateSnapshot | null>,
    ) {
      const next = action.payload;
      state.recordingState = next
        ? {
          ...next,
          sources: next.sources.map((source) => ({ ...source })),
        }
        : null;
    },
    setIsStarting(state, action: PayloadAction<boolean>) {
      state.isStarting = action.payload;
    },
    setIsStopping(state, action: PayloadAction<boolean>) {
      state.isStopping = action.payload;
    },
    syncIncomingSession(state, action: PayloadAction<SessionSnapshot>) {
      const session = action.payload;
      const previousSession = state.currentSession;

      if (!shouldAcceptIncomingSession(previousSession, session)) {
        return;
      }

      state.currentSession = {
        ...session,
        captureSources: [...session.captureSources],
        storageLayout: { ...session.storageLayout },
      };
    },
    setRecordingStartTime(state) {
      state.recordingStartTime = Date.now();
    },
  },
  extraReducers(builder) {
    builder.addCase(setIsStarting, (state, action) => {
      if (action.payload) {
        state.recordingStartTime = Date.now();
      }
    });
    builder.addCase(setIsStopping, (state) => {
      if (state.recordingStartTime) {
        const elapsed = Date.now() - state.recordingStartTime;
        state.recordingStartTime = elapsed;
      }
    });
  },
});

export const {
  setFeedbackMessage,
  setRecordingState,
  setIsStarting,
  setIsStopping,
  syncIncomingSession,
  setRecordingStartTime,
} = sessionRecordingSlice.actions;

export default sessionRecordingSlice.reducer;
