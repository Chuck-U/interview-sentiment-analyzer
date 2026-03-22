import type { CSSProperties, ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";

import {
  RiCameraLine,
  RiComputerLine,
  RiEqualizerLine,
  RiSettings3Line,
} from "@remixicon/react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CapturePermissionSnapshot } from "@/shared/capture-options";

import type {
  CaptureDeviceOption,
  CaptureDisplayOption,
} from "../capture-options/domain";
import { SidebarCardShell } from "./SidebarCardShell";
import { DisplayCaptureCard } from "./capture-options-cards/DisplayCaptureCard";
import { MicrophoneCaptureCard } from "./capture-options-cards/MicrophoneCaptureCard";
import { SystemCaptureOptionsCard } from "./capture-options-cards/SystemCaptureOptionsCard";
import { WebcamCaptureCard } from "./capture-options-cards/WebcamCaptureCard";
import {
  getPermissionVariant,
  type CaptureOptionSectionId,
} from "./capture-options-cards/shared";

type CaptureOptionsPanelProps = {
  readonly isBusy: boolean;
  readonly microphoneDevices: readonly CaptureDeviceOption[];
  readonly webcamDevices: readonly CaptureDeviceOption[];
  readonly displays: readonly CaptureDisplayOption[];
  readonly permissions: CapturePermissionSnapshot | null;
  readonly microphoneEnabled: boolean;
  readonly webcamEnabled: boolean;
  readonly screenEnabled: boolean;
  readonly systemAudioEnabled: boolean;
  readonly screenshotEnabled: boolean;
  readonly microphoneLevel: number;
  readonly isWebcamPreviewVisible: boolean;
  readonly isWebcamPreviewLoading: boolean;
  readonly webcamPreviewStream: MediaStream | null;
  readonly isDesktopPreviewVisible: boolean;
  readonly isDesktopPreviewLoading: boolean;
  readonly desktopPreviewStream: MediaStream | null;
  readonly hasCaptureSourceEnabled: boolean;
  readonly onSetMicrophoneEnabled: (enabled: boolean) => void;
  readonly onSetWebcamEnabled: (enabled: boolean) => void;
  readonly onSetScreenEnabled: (enabled: boolean) => void;
  readonly onSetSystemAudioEnabled: (enabled: boolean) => void;
  readonly onSetScreenshotEnabled: (enabled: boolean) => void;
  readonly onSetMicrophoneDeviceId: (deviceId: string) => void;
  readonly onSetWebcamDeviceId: (deviceId: string) => void;
  readonly onSetDisplayId: (displayId: string) => void;
  readonly onSetWebcamPreviewVisible: (visible: boolean) => void;
  readonly onSetDesktopPreviewVisible: (visible: boolean) => void;
  readonly onOpenMonitorPicker: () => void;
  readonly showPermissions: boolean;
  readonly setShowPermissions: (visible: boolean) => void;
};

type CaptureSection = {
  readonly id: CaptureOptionSectionId;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly content: ReactNode;
};

export function CaptureOptionsPanel({
  isBusy,
  microphoneDevices,
  webcamDevices,
  displays,
  permissions,
  microphoneEnabled,
  webcamEnabled,
  screenEnabled,
  systemAudioEnabled,
  screenshotEnabled,
  microphoneLevel,
  isWebcamPreviewVisible,
  isWebcamPreviewLoading,
  webcamPreviewStream,
  isDesktopPreviewVisible,
  isDesktopPreviewLoading,
  desktopPreviewStream,
  hasCaptureSourceEnabled,
  onSetMicrophoneEnabled,
  onSetWebcamEnabled,
  onSetScreenEnabled,
  onSetSystemAudioEnabled,
  onSetScreenshotEnabled,
  onSetMicrophoneDeviceId,
  onSetWebcamDeviceId,
  onSetDisplayId,
  onSetWebcamPreviewVisible,
  onSetDesktopPreviewVisible,
  onOpenMonitorPicker,
  showPermissions = false,
  setShowPermissions,
}: CaptureOptionsPanelProps) {
  const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;
  const [activeSection, setActiveSection] =
    useState<CaptureOptionSectionId>("microphone");

  const sections = useMemo<readonly CaptureSection[]>(
    () => [
      {
        id: "microphone",
        label: "Microphone",
        icon: RiEqualizerLine,
        content: (
          <MicrophoneCaptureCard
            isBusy={isBusy}
            microphoneDevices={microphoneDevices}
            microphoneEnabled={microphoneEnabled}
            microphoneLevel={microphoneLevel}
            onSetMicrophoneEnabled={onSetMicrophoneEnabled}
            onSetMicrophoneDeviceId={onSetMicrophoneDeviceId}
          />
        ),
      },
      {
        id: "webcam",
        label: "Webcam",
        icon: RiCameraLine,
        content: (
          <WebcamCaptureCard
            isBusy={isBusy}
            webcamDevices={webcamDevices}
            webcamEnabled={webcamEnabled}
            isWebcamPreviewVisible={isWebcamPreviewVisible}
            isWebcamPreviewLoading={isWebcamPreviewLoading}
            webcamPreviewStream={webcamPreviewStream}
            onSetWebcamEnabled={onSetWebcamEnabled}
            onSetWebcamDeviceId={onSetWebcamDeviceId}
            onSetWebcamPreviewVisible={onSetWebcamPreviewVisible}
          />
        ),
      },
      {
        id: "display",
        label: "Display",
        icon: RiComputerLine,
        content: (
          <DisplayCaptureCard
            isBusy={isBusy}
            displays={displays}
            screenEnabled={screenEnabled}
            isDesktopPreviewVisible={isDesktopPreviewVisible}
            isDesktopPreviewLoading={isDesktopPreviewLoading}
            desktopPreviewStream={desktopPreviewStream}
            onSetScreenEnabled={onSetScreenEnabled}
            onSetDisplayId={onSetDisplayId}
            onSetDesktopPreviewVisible={onSetDesktopPreviewVisible}
            onOpenMonitorPicker={onOpenMonitorPicker}
          />
        ),
      },
      {
        id: "system",
        label: "System",
        icon: RiSettings3Line,
        content: (
          <SystemCaptureOptionsCard
            isBusy={isBusy}
            systemAudioEnabled={systemAudioEnabled}
            screenshotEnabled={screenshotEnabled}
            hasCaptureSourceEnabled={hasCaptureSourceEnabled}
            onSetSystemAudioEnabled={onSetSystemAudioEnabled}
            onSetScreenshotEnabled={onSetScreenshotEnabled}
          />
        ),
      },
    ],
    [
      desktopPreviewStream,
      displays,
      hasCaptureSourceEnabled,
      isBusy,
      isDesktopPreviewLoading,
      isDesktopPreviewVisible,
      isWebcamPreviewLoading,
      isWebcamPreviewVisible,
      microphoneDevices,
      microphoneEnabled,
      microphoneLevel,
      onOpenMonitorPicker,
      onSetDesktopPreviewVisible,
      onSetDisplayId,
      onSetMicrophoneDeviceId,
      onSetMicrophoneEnabled,
      onSetScreenEnabled,
      onSetScreenshotEnabled,
      onSetSystemAudioEnabled,
      onSetWebcamDeviceId,
      onSetWebcamEnabled,
      onSetWebcamPreviewVisible,
      screenEnabled,
      screenshotEnabled,
      systemAudioEnabled,
      webcamDevices,
      webcamEnabled,
      webcamPreviewStream,
    ],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" style={noDragStyle}>
      <div
        className={cn("flex flex-wrap gap-2", showPermissions ? "flex" : "hidden")}
        onClick={() => setShowPermissions(!showPermissions)}
      >
        <Badge
          variant={permissions ? getPermissionVariant(permissions.microphone) : "outline"}
        >
          Mic {permissions?.microphone ?? "unknown"}
        </Badge>
        <Badge
          variant={permissions ? getPermissionVariant(permissions.camera) : "outline"}
        >
          Camera {permissions?.camera ?? "unknown"}
        </Badge>
        <Badge
          variant={permissions ? getPermissionVariant(permissions.screen) : "outline"}
        >
          Screen {permissions?.screen ?? "unknown"}
        </Badge>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border/50 bg-background/25">
        <SidebarCardShell
          sections={sections}
          activeSection={activeSection}
          onActiveSectionChange={setActiveSection}
        />
      </div>
    </div>
  );
}
