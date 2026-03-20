import type {
  CaptureDeviceKind,
  CaptureDeviceSnapshot,
  CaptureDisplaySnapshot,
  CaptureOptionsConfig,
} from "./capture-options";

function getFirstDeviceIdForKind(
  devices: readonly CaptureDeviceSnapshot[],
  kind: CaptureDeviceKind,
): string | undefined {
  return devices.find((device) => device.kind === kind)?.deviceId;
}

function hasDevice(
  devices: readonly CaptureDeviceSnapshot[],
  kind: CaptureDeviceKind,
  deviceId: string | undefined,
): boolean {
  if (!deviceId) {
    return false;
  }

  return devices.some(
    (device) => device.kind === kind && device.deviceId === deviceId,
  );
}

function findDisplay(
  displays: readonly CaptureDisplaySnapshot[],
  displayId: string | undefined,
): CaptureDisplaySnapshot | undefined {
  if (!displayId) {
    return undefined;
  }

  return displays.find((display) => display.displayId === displayId);
}

export function reconcileCaptureOptionsConfig(args: {
  readonly config: CaptureOptionsConfig;
  readonly devices: readonly CaptureDeviceSnapshot[];
  readonly displays: readonly CaptureDisplaySnapshot[];
}): CaptureOptionsConfig {
  const { config, devices, displays } = args;
  const selectedMicrophoneId = hasDevice(
    devices,
    "audioinput",
    config.microphone.deviceId,
  )
    ? config.microphone.deviceId
    : getFirstDeviceIdForKind(devices, "audioinput");
  const selectedWebcamId = hasDevice(
    devices,
    "videoinput",
    config.webcam.deviceId,
  )
    ? config.webcam.deviceId
    : getFirstDeviceIdForKind(devices, "videoinput");
  const selectedDisplay =
    findDisplay(displays, config.display.displayId) ?? displays[0];

  return {
    ...config,
    microphone: {
      ...config.microphone,
      deviceId: selectedMicrophoneId,
      label:
        devices.find((device) => device.deviceId === selectedMicrophoneId)?.label ??
        config.microphone.label,
    },
    webcam: {
      ...config.webcam,
      deviceId: selectedWebcamId,
      label:
        devices.find((device) => device.deviceId === selectedWebcamId)?.label ??
        config.webcam.label,
    },
    display: {
      displayId: selectedDisplay?.displayId,
      label: selectedDisplay?.label,
    },
  };
}
