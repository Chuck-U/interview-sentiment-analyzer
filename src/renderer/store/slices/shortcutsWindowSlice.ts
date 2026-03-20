import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { WindowBoundsSnapshot } from "@/shared/window-controls";

export type ShortcutsWindowState = {
  readonly recordingShortcutAccelerator: string;
  readonly isShortcutEnabled: boolean;
  readonly windowBounds: WindowBoundsSnapshot | null;
  readonly isAlwaysOnTop: boolean;
  readonly isPinned: boolean;
};

const initialState: ShortcutsWindowState = {
  recordingShortcutAccelerator: "CommandOrControl+Shift+R",
  isShortcutEnabled: true,
  windowBounds: null,
  isAlwaysOnTop: true,
  isPinned: false,
};

const shortcutsWindowSlice = createSlice({
  name: "shortcutsWindow",
  initialState,
  reducers: {
    setRecordingShortcutAccelerator(state, action: PayloadAction<string>) {
      state.recordingShortcutAccelerator = action.payload;
    },
    setShortcutEnabled(state, action: PayloadAction<boolean>) {
      state.isShortcutEnabled = action.payload;
    },
    setWindowBounds(state, action: PayloadAction<WindowBoundsSnapshot | null>) {
      state.windowBounds = action.payload;
    },
    setAlwaysOnTop(state, action: PayloadAction<boolean>) {
      state.isAlwaysOnTop = action.payload;
    },
    setPinned(state, action: PayloadAction<boolean>) {
      state.isPinned = action.payload;
    },
  },
});

export const {
  setRecordingShortcutAccelerator,
  setShortcutEnabled,
  setWindowBounds,
  setAlwaysOnTop,
  setPinned,
} = shortcutsWindowSlice.actions;

export default shortcutsWindowSlice.reducer;
