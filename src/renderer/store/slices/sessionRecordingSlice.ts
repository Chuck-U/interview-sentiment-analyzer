import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { RecordingStateSnapshot } from "@/shared/recording";
import type { SessionSnapshot } from "@/shared/session-lifecycle";

export type SessionRecordingState = {
  readonly currentSession: SessionSnapshot | null;
  readonly feedbackMessage: string;
  readonly isStarting: boolean;
  readonly isStopping: boolean;
  readonly recordingState: RecordingStateSnapshot | null;
};

const initialState: SessionRecordingState = {
  currentSession: null,
  feedbackMessage: "Ready to start a local recording session.",
  isStarting: false,
  isStopping: false,
  recordingState: null,
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

      if (
        previousSession &&
        previousSession.id !== session.id &&
        session.status !== "active"
      ) {
        return;
      }

      state.currentSession = {
        ...session,
        captureSources: [...session.captureSources],
        storageLayout: { ...session.storageLayout },
      };
    },
  },
});

export const {
  setFeedbackMessage,
  setRecordingState,
  setIsStarting,
  setIsStopping,
  syncIncomingSession,
} = sessionRecordingSlice.actions;

export default sessionRecordingSlice.reducer;
