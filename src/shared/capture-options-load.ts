import {
  type CaptureDeviceKind,
  type CaptureDeviceSnapshot,
  type CaptureDisplaySnapshot,
  type CaptureOptionsConfig,
  type CapturePermissionSnapshot,
} from "./capture-options";

import { reconcileCaptureOptionsConfig } from "./capture-options-reconcile";

export type DeviceInfoInput = {
  readonly kind: string;
  readonly deviceId: string;
  readonly label: string;
  readonly groupId?: string;
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

export function normalizeDeviceInfosToSnapshots(
  devices: readonly DeviceInfoInput[],
): readonly CaptureDeviceSnapshot[] {
  const filtered = devices.filter(
    (device): device is DeviceInfoInput & { kind: CaptureDeviceKind } =>
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

export type CaptureOptionsLoadDeps = {
  readonly getConfig: () => Promise<CaptureOptionsConfig>;
  readonly getPermissions: () => Promise<CapturePermissionSnapshot>;
  readonly listDisplays: () => Promise<readonly CaptureDisplaySnapshot[]>;
  readonly enumerateDevices: () => Promise<readonly DeviceInfoInput[]>;
  readonly setConfig: (config: CaptureOptionsConfig) => Promise<CaptureOptionsConfig>;
};

export type CaptureOptionsLoadResult = {
  readonly permissions: CapturePermissionSnapshot;
  readonly devices: readonly CaptureDeviceSnapshot[];
  readonly displays: readonly CaptureDisplaySnapshot[];
  readonly config: CaptureOptionsConfig;
};

/**
 * Loads persisted capture config, permissions, displays, and devices; reconciles
 * against hardware and persists reconciled config when it drifted from disk.
 */
export async function loadCaptureOptionsBundle(
  deps: CaptureOptionsLoadDeps,
): Promise<CaptureOptionsLoadResult> {
  const [savedConfig, savedPermissions, displaySnapshots, deviceInfos] =
    await Promise.all([
      deps.getConfig(),
      deps.getPermissions(),
      deps.listDisplays(),
      deps.enumerateDevices(),
    ]);

  const normalizedDevices = normalizeDeviceInfosToSnapshots(deviceInfos);
  const reconciledConfig = reconcileCaptureOptionsConfig({
    config: savedConfig,
    devices: normalizedDevices,
    displays: displaySnapshots,
  });

  if (!configsEqual(savedConfig, reconciledConfig)) {
    await deps.setConfig(reconciledConfig);
  }

  return {
    permissions: savedPermissions,
    devices: normalizedDevices,
    displays: displaySnapshots,
    config: reconciledConfig,
  };
}
