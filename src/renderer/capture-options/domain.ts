import type {
  CaptureDeviceKind,
  CaptureDeviceSnapshot,
  CaptureDisplaySnapshot,
  CaptureOptionsConfig,
} from "@/shared/capture-options";
import type { RecordingStateSnapshot } from "@/shared/recording";
import type { MediaChunkSource } from "@/shared/session-lifecycle";

export type CaptureDeviceOption = CaptureDeviceSnapshot & {
  readonly isSelected: boolean;
  readonly isActive: boolean;
};

export type CaptureDisplayOption = CaptureDisplaySnapshot & {
  readonly isSelected: boolean;
  readonly isActive: boolean;
};

export function buildCaptureSourcesFromConfig(
  config: CaptureOptionsConfig,
): readonly MediaChunkSource[] {
  const sources: MediaChunkSource[] = [];

  if (config.microphone.enabled) {
    sources.push("microphone");
  }

  if (config.webcam.enabled) {
    sources.push("webcam");
  }

  if (config.systemAudio.enabled) {
    sources.push("system-audio");
  }

  if (config.screen.enabled) {
    sources.push("screen-video");
  }

  if (config.screenshot.enabled) {
    sources.push("screenshot");
  }

  return sources;
}

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

function getActiveSource(
  recordingState: RecordingStateSnapshot | null,
  source: MediaChunkSource,
) {
  return recordingState?.sources.find((item) => item.source === source);
}

export function buildDeviceOptions(args: {
  readonly devices: readonly CaptureDeviceSnapshot[];
  readonly kind: CaptureDeviceKind;
  readonly selectedDeviceId?: string;
  readonly activeDeviceId?: string;
}): readonly CaptureDeviceOption[] {
  const { devices, kind, selectedDeviceId, activeDeviceId } = args;

  return devices
    .filter((device) => device.kind === kind)
    .map((device) => ({
      ...device,
      isSelected: device.deviceId === selectedDeviceId,
      isActive: device.deviceId === activeDeviceId,
    }));
}

export function buildDisplayOptions(args: {
  readonly displays: readonly CaptureDisplaySnapshot[];
  readonly selectedDisplayId?: string;
  readonly activeDisplayId?: string;
}): readonly CaptureDisplayOption[] {
  const { displays, selectedDisplayId, activeDisplayId } = args;

  return displays.map((display) => ({
    ...display,
    isSelected: display.displayId === selectedDisplayId,
    isActive: display.displayId === activeDisplayId,
  }));
}

export function getActiveMicrophoneDeviceId(
  recordingState: RecordingStateSnapshot | null,
): string | undefined {
  return getActiveSource(recordingState, "microphone")?.activeDeviceId;
}

export function getActiveWebcamDeviceId(
  recordingState: RecordingStateSnapshot | null,
): string | undefined {
  return getActiveSource(recordingState, "webcam")?.activeDeviceId;
}

export function getActiveDisplayId(
  recordingState: RecordingStateSnapshot | null,
): string | undefined {
  return (
    getActiveSource(recordingState, "screen-video")?.activeDisplayId ??
    getActiveSource(recordingState, "system-audio")?.activeDisplayId ??
    getActiveSource(recordingState, "screenshot")?.activeDisplayId
  );
}
