import { z } from "zod";

import type { Unsubscribe } from "./session-lifecycle";

export const CAPTURE_PERMISSION_STATES = [
  "not-determined",
  "granted",
  "denied",
  "restricted",
  "unsupported",
] as const;

export const CAPTURE_DEVICE_KINDS = [
  "audioinput",
  "audiooutput",
  "videoinput",
] as const;

export type CapturePermissionState = (typeof CAPTURE_PERMISSION_STATES)[number];
export type CaptureDeviceKind = (typeof CAPTURE_DEVICE_KINDS)[number];

export type CaptureToggleConfig = {
  readonly enabled: boolean;
};

export type CaptureDevicePreference = {
  readonly deviceId?: string;
  readonly label?: string;
};

export type CaptureDisplayPreference = {
  readonly displayId?: string;
  readonly label?: string;
};

export type CaptureOptionsConfig = {
  readonly microphone: CaptureDevicePreference & CaptureToggleConfig;
  readonly webcam: CaptureDevicePreference & CaptureToggleConfig;
  readonly screen: CaptureToggleConfig;
  readonly systemAudio: CaptureDevicePreference & CaptureToggleConfig;
  readonly screenshot: CaptureToggleConfig;
  // Window pin and saved bounds should live in a dedicated config section rather
  // than piggybacking on capture-options when reopen persistence is added.
  readonly display: CaptureDisplayPreference;
};

export type CapturePermissionSnapshot = {
  readonly microphone: CapturePermissionState;
  readonly camera: CapturePermissionState;
  readonly screen: CapturePermissionState;
  readonly systemAudio: CapturePermissionState;
};

export type CaptureDeviceSnapshot = {
  readonly kind: CaptureDeviceKind;
  readonly deviceId: string;
  readonly label: string;
  readonly groupId?: string;
  readonly isDefault: boolean;
};

export type CaptureDisplayBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type CaptureDisplaySnapshot = {
  readonly displayId: string;
  readonly label: string;
  readonly isPrimary: boolean;
  readonly bounds: CaptureDisplayBounds;
  readonly sourceId?: string;
};

export type MonitorPickerSelectionChangedEvent = {
  readonly displayId?: string;
};

export const DEFAULT_CAPTURE_OPTIONS_CONFIG: CaptureOptionsConfig = {
  microphone: {
    enabled: true,
  },
  webcam: {
    enabled: false,
  },
  screen: {
    enabled: true,
  },
  systemAudio: {
    enabled: false,
  },
  screenshot: {
    enabled: true,
  },
  display: {},
};

const capturePermissionStateSchema = z.enum(CAPTURE_PERMISSION_STATES);

const captureToggleConfigSchema = z.object({
  enabled: z.boolean(),
});

const captureDevicePreferenceSchema = captureToggleConfigSchema.extend({
  deviceId: z
    .string()
    .trim()
    .min(1, "deviceId must be non-empty when provided")
    .optional(),
  label: z
    .string()
    .trim()
    .min(1, "label must be non-empty when provided")
    .optional(),
});

const captureDisplayPreferenceSchema = z.object({
  displayId: z
    .string()
    .trim()
    .min(1, "displayId must be non-empty when provided")
    .optional(),
  label: z
    .string()
    .trim()
    .min(1, "display label must be non-empty when provided")
    .optional(),
});

export const captureOptionsConfigSchema = z.object({
  microphone: captureDevicePreferenceSchema,
  webcam: captureDevicePreferenceSchema,
  screen: captureToggleConfigSchema,
  systemAudio: captureDevicePreferenceSchema,
  screenshot: captureToggleConfigSchema,
  display: captureDisplayPreferenceSchema,
});

export const capturePermissionSnapshotSchema = z.object({
  microphone: capturePermissionStateSchema,
  camera: capturePermissionStateSchema,
  screen: capturePermissionStateSchema,
  systemAudio: capturePermissionStateSchema,
});

const captureDeviceSnapshotSchema = z.object({
  kind: z.enum(CAPTURE_DEVICE_KINDS),
  deviceId: z.string().trim().min(1),
  label: z.string(),
  groupId: z.string().trim().min(1).optional(),
  isDefault: z.boolean(),
});

const captureDisplayBoundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
});

const captureDisplaySnapshotSchema = z.object({
  displayId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  isPrimary: z.boolean(),
  bounds: captureDisplayBoundsSchema,
  sourceId: z.string().trim().min(1).optional(),
});

export const monitorPickerSelectionChangedEventSchema = z.object({
  displayId: z.string().trim().min(1).optional(),
});

export function normalizeCaptureOptionsConfig(
  input: unknown,
): CaptureOptionsConfig {
  return captureOptionsConfigSchema.parse(input);
}

export function safeParseCaptureOptionsConfig(
  input: unknown,
): ReturnType<typeof captureOptionsConfigSchema.safeParse> {
  return captureOptionsConfigSchema.safeParse(input);
}

export function normalizeCapturePermissionSnapshot(
  input: unknown,
): CapturePermissionSnapshot {
  return capturePermissionSnapshotSchema.parse(input);
}

export function normalizeCaptureDevices(
  input: unknown,
): readonly CaptureDeviceSnapshot[] {
  return z.array(captureDeviceSnapshotSchema).parse(input);
}

export function normalizeCaptureDisplays(
  input: unknown,
): readonly CaptureDisplaySnapshot[] {
  return z.array(captureDisplaySnapshotSchema).parse(input);
}

export function normalizeMonitorPickerSelectionChangedEvent(
  input: unknown,
): MonitorPickerSelectionChangedEvent {
  return monitorPickerSelectionChangedEventSchema.parse(input);
}

export const CAPTURE_OPTIONS_CHANNELS = {
  getConfig: "capture-options:get-config",
  setConfig: "capture-options:set-config",
  listDisplays: "capture-options:list-displays",
  getPermissions: "capture-options:get-permissions",
  openMonitorPicker: "capture-options:open-monitor-picker",
  closeMonitorPicker: "capture-options:close-monitor-picker",
} as const;

export const CAPTURE_OPTIONS_EVENT_CHANNELS = {
  selectedDisplayChanged: "capture-options:event-selected-display-changed",
} as const;

export type CaptureOptionsBridge = {
  getConfig(): Promise<CaptureOptionsConfig>;
  setConfig(config: CaptureOptionsConfig): Promise<CaptureOptionsConfig>;
  listDisplays(): Promise<readonly CaptureDisplaySnapshot[]>;
  getPermissions(): Promise<CapturePermissionSnapshot>;
  openMonitorPicker(request: {
    readonly selectedDisplayId?: string;
  }): Promise<MonitorPickerSelectionChangedEvent>;
  closeMonitorPicker(): Promise<void>;
  onSelectedDisplayChanged(
    listener: (event: MonitorPickerSelectionChangedEvent) => void,
  ): Unsubscribe;
};
