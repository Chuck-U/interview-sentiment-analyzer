import type {
  CaptureDeviceKind,
  CaptureDeviceSnapshot,
  CaptureDisplaySnapshot,
  CaptureOptionsConfig,
} from "@/shared/capture-options";
import type { RecordingStateSnapshot } from "@/shared/recording";
import type { MediaChunkSource } from "@/shared/session-lifecycle";

export { reconcileCaptureOptionsConfig } from "@/shared/capture-options-reconcile";

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
  const hasUnifiedDesktopCapture =
    config.screen.enabled && config.systemAudio.enabled;

  if (config.microphone.enabled) {
    sources.push("microphone");
  }

  if (config.webcam.enabled) {
    sources.push("webcam");
  }

  if (hasUnifiedDesktopCapture) {
    sources.push("desktop-capture");
  } else if (config.systemAudio.enabled) {
    sources.push("system-audio");
  }

  if (config.screen.enabled && !hasUnifiedDesktopCapture) {
    sources.push("screen-video");
  }

  if (config.screenshot.enabled) {
    sources.push("screenshot");
  }

  return sources;
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
    getActiveSource(recordingState, "desktop-capture")?.activeDisplayId ??
    getActiveSource(recordingState, "screen-video")?.activeDisplayId ??
    getActiveSource(recordingState, "system-audio")?.activeDisplayId ??
    getActiveSource(recordingState, "screenshot")?.activeDisplayId
  );
}
