import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type QuestionBoxState = {
  readonly viewIndex: number;
  readonly isPaused: boolean;
  readonly isMockRunning: boolean;
  readonly prevDetectedCount: number;
};

const initialState: QuestionBoxState = {
  viewIndex: 0,
  isPaused: false,
  isMockRunning: false,
  prevDetectedCount: 0,
};

const questionBoxSlice = createSlice({
  name: "questionBox",
  initialState,
  reducers: {
    applyDetectedLengthSync(
      state,
      action: PayloadAction<{ readonly detectedCount: number }>,
    ) {
      const n = action.payload.detectedCount;
      const prev = state.prevDetectedCount;
      const vi = state.viewIndex;
      const { isPaused } = state;

      if (n === 0) {
        state.viewIndex = 0;
        state.prevDetectedCount = 0;
        return;
      }

      let next = vi;
      if (n > prev && !isPaused) {
        const atEnd = prev === 0 || vi === prev - 1;
        if (atEnd) {
          next = n - 1;
        }
      }
      if (vi >= n) {
        next = Math.max(0, n - 1);
      }
      state.viewIndex = next;
      state.prevDetectedCount = n;
    },
    setPaused(state, action: PayloadAction<boolean>) {
      state.isPaused = action.payload;
    },
    toggleIsPaused(state) {
      state.isPaused = !state.isPaused;
    },
    setViewIndex(state, action: PayloadAction<number>) {
      state.viewIndex = action.payload;
    },
    goPrevious(state) {
      state.viewIndex = Math.max(0, state.viewIndex - 1);
    },
    goNext(state, action: PayloadAction<{ readonly lastIndex: number }>) {
      state.viewIndex = Math.min(
        action.payload.lastIndex,
        state.viewIndex + 1,
      );
    },
    setMockRunning(state, action: PayloadAction<boolean>) {
      state.isMockRunning = action.payload;
    },
  },
});

export const {
  applyDetectedLengthSync,
  setPaused,
  toggleIsPaused,
  setViewIndex,
  goPrevious,
  goNext,
  setMockRunning,
} = questionBoxSlice.actions;

export default questionBoxSlice.reducer;
