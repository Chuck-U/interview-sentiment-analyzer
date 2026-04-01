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
  const selectedSystemAudioId = hasDevice(
    devices,
    "audiooutput",
    config.systemAudio.deviceId,
  )
    ? config.systemAudio.deviceId
    : getFirstDeviceIdForKind(devices, "audiooutput");
  // Default screen capture to the primary display (display picker UI is disabled).
  const selectedDisplay =
    displays.find((display) => display.isPrimary) ?? displays[0];

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
    systemAudio: {
      ...config.systemAudio,
      deviceId: selectedSystemAudioId,
      label:
        devices.find((device) => device.deviceId === selectedSystemAudioId)?.label ??
        config.systemAudio.label,
    },
    display: {
      displayId: selectedDisplay?.displayId,
      label: selectedDisplay?.label,
    },
  };
}
