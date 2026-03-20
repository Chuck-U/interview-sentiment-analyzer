import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { WindowSizePreset } from "@/shared/window-controls";

export const VIEW_OPTIONS = {
  controls: "controls",
  options: "options",
} as const;

export type ViewOption = (typeof VIEW_OPTIONS)[keyof typeof VIEW_OPTIONS];

export type CardWindowId = "controls" | "options" | "sandbox";

type ViewsState = {
  readonly activeView: ViewOption;
  readonly openWindowIds: Record<CardWindowId, boolean>;
};

const initialState: ViewsState = {
  activeView: VIEW_OPTIONS.controls,
  openWindowIds: {
    controls: true,
    options: true,
    sandbox: true,
  },
};

const viewsSlice = createSlice({
  name: "views",
  initialState,
  reducers: {
    setActiveView(state, action: PayloadAction<ViewOption>) {
      state.activeView = action.payload;
    },
    openView(state, action: PayloadAction<CardWindowId>) {
      state.openWindowIds[action.payload] = true;
    },
    closeView(state, action: PayloadAction<CardWindowId>) {
      state.openWindowIds[action.payload] = false;
    },
    toggleView(state, action: PayloadAction<CardWindowId>) {
      state.openWindowIds[action.payload] = !state.openWindowIds[action.payload];
    },
  },
});

export const { setActiveView, openView, closeView, toggleView } =
  viewsSlice.actions;

export type WindowSizePresetOption = {
  readonly preset: WindowSizePreset;
  readonly label: string;
  readonly description: string;
};

export const RESIZE_PRESET_OPTIONS: readonly WindowSizePresetOption[] = [
  {
    preset: "half",
    label: "1/2 Screen",
    description: "900 x 700",
  },
  {
    preset: "three-quarters",
    label: "3/4 Screen",
    description: "75% of display",
  },
  {
    preset: "full",
    label: "Full",
    description: "Display size minus 100px",
  },
];

export default viewsSlice.reducer;
