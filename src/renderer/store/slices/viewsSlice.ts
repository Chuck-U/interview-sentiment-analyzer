import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { WindowSizePreset } from "@/shared/window-controls";

export const VIEW_OPTIONS = {
  controls: "controls",
  options: "options",
  sandbox: "sandbox",
} as const;

export type ViewOption = (typeof VIEW_OPTIONS)[keyof typeof VIEW_OPTIONS];

export type CardWindowId = "controls" | "options" | "sandbox";

/** Active sidebar section inside the options card window. */
export type OptionsSectionId =
  | "capture-options"
  | "recordings"
  | "ai-provider"
  | "options";

const CARD_TAB_ORDER: readonly CardWindowId[] = [
  "controls",
  "options",
  "sandbox",
];

/** Picks the first card tab that is open, or defaults to Controls. */
export function pickFirstOpenCardView(
  openIds: Record<CardWindowId, boolean>,
): ViewOption {
  for (const id of CARD_TAB_ORDER) {
    if (openIds[id]) {
      return id;
    }
  }

  return VIEW_OPTIONS.controls;
}

type ViewsState = {
  readonly activeView: ViewOption;
  readonly activeOptionsSection: OptionsSectionId;
  readonly openWindowIds: Record<CardWindowId, boolean>;
};

const initialState: ViewsState = {
  activeView: VIEW_OPTIONS.controls,
  activeOptionsSection: "capture-options",
  openWindowIds: {
    controls: false,
    options: false,
    sandbox: false,
  },
};

const viewsSlice = createSlice({
  name: "views",
  initialState,
  reducers: {
    setActiveView(state, action: PayloadAction<ViewOption>) {
      state.activeView = action.payload;
    },
    setActiveOptionsSection(state, action: PayloadAction<OptionsSectionId>) {
      state.activeOptionsSection = action.payload;
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
    syncOpenWindowIds(
      state,
      action: PayloadAction<Record<CardWindowId, boolean>>,
    ) {
      state.openWindowIds = { ...action.payload };
    },
  },
});

export const {
  setActiveView,
  setActiveOptionsSection,
  openView,
  closeView,
  toggleView,
  syncOpenWindowIds,
} = viewsSlice.actions;

export type WindowSizePresetOption = {
  readonly preset: WindowSizePreset;
  readonly label: string;
};

export const RESIZE_PRESET_OPTIONS: readonly WindowSizePresetOption[] = [
  {
    preset: "50%",
    label: "50%",
  },
  {
    preset: "75%",
    label: "75%",
  },
  {
    preset: "90%",
    label: "Full",
  },
];

export default viewsSlice.reducer;
