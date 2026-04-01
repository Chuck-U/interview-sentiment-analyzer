import type {
  CaptureDeviceOption,
  CaptureDisplayOption,
} from "@/renderer/capture-options/domain";

export type CaptureOptionSectionId =
  | "microphone"
  | "webcam"
  | "display"
  | "system";

export type CaptureCardBaseProps = {
  readonly isBusy: boolean;
};

export type MicrophoneCaptureCardProps = CaptureCardBaseProps & {
  readonly microphoneDevices: readonly CaptureDeviceOption[];
  readonly microphoneEnabled: boolean;
  readonly microphoneLevel: number;
  readonly onSetMicrophoneEnabled: (enabled: boolean) => void;
  readonly onSetMicrophoneDeviceId: (deviceId: string) => void;
};

export type WebcamCaptureCardProps = CaptureCardBaseProps & {
  readonly webcamDevices: readonly CaptureDeviceOption[];
  readonly webcamEnabled: boolean;
  readonly isWebcamPreviewVisible: boolean;
  readonly isWebcamPreviewLoading: boolean;
  readonly webcamPreviewStream: MediaStream | null;
  readonly onSetWebcamEnabled: (enabled: boolean) => void;
  readonly onSetWebcamDeviceId: (deviceId: string) => void;
  readonly onSetWebcamPreviewVisible: (visible: boolean) => void;
};

export type DisplayCaptureCardProps = CaptureCardBaseProps & {
  displays: readonly CaptureDisplayOption[];
  readonly screenEnabled: boolean;
  readonly isDesktopPreviewVisible: boolean;
  readonly isDesktopPreviewLoading: boolean;
  readonly desktopPreviewStream: MediaStream | null;
  readonly onSetScreenEnabled: (enabled: boolean) => void;
  readonly onSetDisplayId: (displayId: string) => void;
  readonly onSetDesktopPreviewVisible: (visible: boolean) => void;
  readonly onOpenMonitorPicker: () => void;
};

export type SystemCaptureOptionsCardProps = CaptureCardBaseProps & {
  readonly audioOutputDevices: readonly CaptureDeviceOption[];
  readonly systemAudioEnabled: boolean;
  readonly screenshotEnabled: boolean;
  readonly hasCaptureSourceEnabled: boolean;
  readonly onSetAudioOutputDeviceId: (deviceId: string) => void;
  readonly onSetSystemAudioEnabled: (enabled: boolean) => void;
  readonly onSetScreenshotEnabled: (enabled: boolean) => void;
};

export function getPermissionVariant(
  status: string,
): "default" | "outline" | "destructive" {
  if (status === "granted") {
    return "default";
  }

  if (status === "denied" || status === "restricted") {
    return "destructive";
  }

  return "outline";
}

export function renderDeviceLabel(device: CaptureDeviceOption): string {
  const suffixes = [];

  if (device.isDefault) {
    suffixes.push("default");
  }

  if (device.isActive) {
    suffixes.push("active");
  }

  if (suffixes.length === 0) {
    return device.label;
  }

  return `${device.label} (${suffixes.join(", ")})`;
}
