import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  DEFAULT_CAPTURE_OPTIONS_CONFIG,
  type CaptureDeviceKind,
  type CaptureDeviceSnapshot,
  type CaptureDisplaySnapshot,
  type CaptureOptionsConfig,
  type CapturePermissionSnapshot,
} from "@/shared/capture-options";
import type { MediaChunkSource } from "@/shared/session-lifecycle";

import {
  buildCaptureSourcesFromConfig,
  reconcileCaptureOptionsConfig,
} from "@/renderer/capture-options/domain";

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

function buildFallbackLabel(
  kind: CaptureDeviceKind,
  index: number,
  isDefault: boolean,
): string {
  if (kind === "audioinput") {
    return isDefault ? "Default microphone" : `Microphone ${index + 1}`;
  }

  return isDefault ? "Default camera" : `Camera ${index + 1}`;
}

function normalizeDevices(
  devices: readonly MediaDeviceInfo[],
): readonly CaptureDeviceSnapshot[] {
  const filtered = devices.filter(
    (device): device is MediaDeviceInfo & { kind: CaptureDeviceKind } =>
      device.kind === "audioinput" || device.kind === "videoinput",
  );

  const firstDeviceIndexByKind = new Map<CaptureDeviceKind, number>();

  return filtered.map((device, index) => {
    if (!firstDeviceIndexByKind.has(device.kind)) {
      firstDeviceIndexByKind.set(device.kind, index);
    }

    const isDefault = firstDeviceIndexByKind.get(device.kind) === index;

    return {
      kind: device.kind,
      deviceId: device.deviceId,
      label: device.label || buildFallbackLabel(device.kind, index, isDefault),
      groupId: device.groupId || undefined,
      isDefault,
    };
  });
}

function configsEqual(a: CaptureOptionsConfig, b: CaptureOptionsConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const loadCaptureOptions = createAsyncThunk(
  "captureOptions/load",
  async (_, { rejectWithValue }) => {
    try {
      const [savedConfig, savedPermissions, displaySnapshots, deviceInfos] =
        await Promise.all([
          window.electronApp.captureOptions.getConfig(),
          window.electronApp.captureOptions.getPermissions(),
          window.electronApp.captureOptions.listDisplays(),
          navigator.mediaDevices.enumerateDevices(),
        ]);

      const normalizedDevices = normalizeDevices(deviceInfos);
      const reconciledConfig = reconcileCaptureOptionsConfig({
        config: savedConfig,
        devices: normalizedDevices,
        displays: displaySnapshots,
      });

      if (!configsEqual(savedConfig, reconciledConfig)) {
        await window.electronApp.captureOptions.setConfig(reconciledConfig);
      }

      return {
        permissions: savedPermissions,
        devices: normalizedDevices,
        displays: displaySnapshots,
        config: reconciledConfig,
      };
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
