import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  DEFAULT_CAPTURE_OPTIONS_CONFIG,
  type CaptureDeviceSnapshot,
  type CaptureDisplaySnapshot,
  type CaptureOptionsConfig,
  type CapturePermissionSnapshot,
} from "@/shared/capture-options";
import { loadCaptureOptionsBundle } from "@/shared/capture-options-load";
import type { MediaChunkSource } from "@/shared/session-lifecycle";

import { buildCaptureSourcesFromConfig } from "@/renderer/capture-options/domain";

export type CaptureOptionsSliceState = {
  readonly config: CaptureOptionsConfig;
  readonly permissions: CapturePermissionSnapshot | null;
  readonly devices: readonly CaptureDeviceSnapshot[];
  readonly displays: readonly CaptureDisplaySnapshot[];
};

const initialState: CaptureOptionsSliceState = {
  config: DEFAULT_CAPTURE_OPTIONS_CONFIG,
  permissions: null,
  devices: [],
  displays: [],
};

export const loadCaptureOptions = createAsyncThunk(
  "captureOptions/load",
  async (_, { rejectWithValue }) => {
    try {
      return await loadCaptureOptionsBundle({
        getConfig: () => window.electronApp.captureOptions.getConfig(),
        getPermissions: () => window.electronApp.captureOptions.getPermissions(),
        listDisplays: () => window.electronApp.captureOptions.listDisplays(),
        enumerateDevices: () => navigator.mediaDevices.enumerateDevices(),
        setConfig: (config) => window.electronApp.captureOptions.setConfig(config),
      });
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Unable to load capture options.",
      );
    }
  },
);

type PersistCaptureConfigRejected = {
  readonly previousConfig: CaptureOptionsConfig;
  readonly message: string;
};

export const persistCaptureConfig = createAsyncThunk<
  CaptureOptionsConfig,
  {
    readonly nextConfig: CaptureOptionsConfig;
    readonly previousConfig: CaptureOptionsConfig;
  },
  { readonly rejectValue: PersistCaptureConfigRejected }
>(
  "captureOptions/persist",
  async ({ nextConfig, previousConfig }, { rejectWithValue }) => {
    try {
      return await window.electronApp.captureOptions.setConfig(nextConfig);
    } catch (error) {
      return rejectWithValue({
        previousConfig,
        message:
          error instanceof Error
            ? error.message
            : "Unable to save capture options.",
      });
    }
  },
);

const captureOptionsSlice = createSlice({
  name: "captureOptions",
  initialState,
  reducers: {
    optimisticSetConfig(state, action: PayloadAction<CaptureOptionsConfig>) {
      state.config = action.payload;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(loadCaptureOptions.fulfilled, (state, action) => {
        state.config = action.payload.config;
        state.permissions = action.payload.permissions;
        state.devices = [...action.payload.devices];
        state.displays = [...action.payload.displays];
      })
      .addCase(persistCaptureConfig.fulfilled, (state, action) => {
        state.config = action.payload;
      })
      .addCase(persistCaptureConfig.rejected, (state, action) => {
        const payload = action.payload;
        if (payload) {
          state.config = payload.previousConfig;
        }
      });
  },
});

export const { optimisticSetConfig } = captureOptionsSlice.actions;

export function selectCaptureSources(state: {
  readonly captureOptions: CaptureOptionsSliceState;
}): readonly MediaChunkSource[] {
  return buildCaptureSourcesFromConfig(state.captureOptions.config);
}

export default captureOptionsSlice.reducer;
