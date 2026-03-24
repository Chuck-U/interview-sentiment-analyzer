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
import { OptionsCard } from "./capture-options-cards/OptionsCard";
import { SystemCaptureOptionsCard } from "./capture-options-cards/SystemCaptureOptionsCard";
import { WebcamCaptureCard } from "./capture-options-cards/WebcamCaptureCard";
import {
  getPermissionVariant,
  type CaptureOptionSectionId,
} from "./capture-options-cards/shared";

type CaptureOptionsPanelProps = {
  readonly isBusy: boolean;
  readonly microphoneDevices: readonly CaptureDeviceOption[];
  readonly audioOutputDevices: readonly CaptureDeviceOption[];
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
  readonly onSetAudioOutputDeviceId: (deviceId: string) => void;
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
  audioOutputDevices,
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
  onSetAudioOutputDeviceId,
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
          <OptionsCard
            title="Microphone"
            description="Preview metering runs while the options view is active."
          >
            <MicrophoneCaptureCard
              isBusy={isBusy}
              microphoneDevices={microphoneDevices}
              microphoneEnabled={microphoneEnabled}
              microphoneLevel={microphoneLevel}
              onSetMicrophoneEnabled={onSetMicrophoneEnabled}
              onSetMicrophoneDeviceId={onSetMicrophoneDeviceId}
            />
          </OptionsCard>
        ),
      },
      {
        id: "webcam",
        label: "Webcam",
        icon: RiCameraLine,
        content: (
          <OptionsCard
            title="Webcam"
            description="Choose a camera and keep a live preview visible while configuring capture."
          >
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
          </OptionsCard>
        ),
      },
      {
        id: "display",
        label: "Display",
        icon: RiComputerLine,
        content: (
          <OptionsCard
            title="Display"
            description="Configure screen capture, monitor selection, and desktop preview."
          >
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
          </OptionsCard>
        ),
      },
      {
        id: "system",
        label: "System",
        icon: RiSettings3Line,
        content: (
          <OptionsCard
            title="System Options"
            description="Configure shared recording behavior that is not tied to a single source card."
          >
            <SystemCaptureOptionsCard
              isBusy={isBusy}
              audioOutputDevices={audioOutputDevices}
              systemAudioEnabled={systemAudioEnabled}
              screenshotEnabled={screenshotEnabled}
              hasCaptureSourceEnabled={hasCaptureSourceEnabled}
              onSetAudioOutputDeviceId={onSetAudioOutputDeviceId}
              onSetSystemAudioEnabled={onSetSystemAudioEnabled}
              onSetScreenshotEnabled={onSetScreenshotEnabled}
            />
          </OptionsCard>
        ),
      },
    ],
    [
      desktopPreviewStream,
      audioOutputDevices,
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
      onSetAudioOutputDeviceId,
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
