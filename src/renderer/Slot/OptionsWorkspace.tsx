import { useMemo, useState } from "react";

import {
  RiBrainLine,
  RiCameraLine,
  RiComputerLine,
  RiDownloadCloud2Line,
  RiEqualizerLine,
  RiFlaskLine,
  RiRecordCircleFill,
  RiSettings3Line,
} from "@remixicon/react";

import { RecordingSandboxCard } from "@/renderer/recording/recording-sandbox-card";

import type { OptionsProps } from "./Options";
import { OptionsOverviewCard } from "./OptionsOverviewCard";
import { SidebarCardShell } from "./SidebarCardShell";
import { AiProviderCard } from "./agent-controls-cards/AiProviderCard";
import { ExportRecordingCard } from "./agent-controls-cards/ExportRecordingCard";
import { RecordingControlCard } from "./agent-controls-cards/RecordingControlCard";
import { DisplayCaptureCard } from "./capture-options-cards/DisplayCaptureCard";
import { MicrophoneCaptureCard } from "./capture-options-cards/MicrophoneCaptureCard";
import type { CaptureOptionSectionId } from "./capture-options-cards/shared";
import { SystemCaptureOptionsCard } from "./capture-options-cards/SystemCaptureOptionsCard";
import { WebcamCaptureCard } from "./capture-options-cards/WebcamCaptureCard";

type WorkspaceSectionId =
  | "options"
  | "ai-provider"
  | CaptureOptionSectionId
  | "recording"
  | "export"
  | "sandbox";

type OptionsWorkspaceProps = Omit<OptionsProps, "layout"> & {
  readonly initialSection?: WorkspaceSectionId;
};

export function OptionsWorkspace({
  initialSection = "options",
  ...props
}: OptionsWorkspaceProps) {
  const [activeSection, setActiveSection] =
    useState<WorkspaceSectionId>(initialSection);
  const canExport =
    !props.isRecording &&
    !!props.recordingState &&
    props.recordingState.totalChunkCount > 0 &&
    props.recordingState.exportStatus === "idle";

  const sections = useMemo(
    () => [
      {
        id: "options",
        label: "Options",
        icon: RiSettings3Line,
        content: <OptionsOverviewCard {...props} />,
      },
      {
        id: "ai-provider",
        label: "AI Provider",
        icon: RiBrainLine,
        content: <AiProviderCard />,
      },
      {
        id: "microphone",
        label: "Microphone",
        icon: RiEqualizerLine,
        content: (
          <MicrophoneCaptureCard
            isBusy={props.isBusy}
            microphoneDevices={props.microphoneDevices}
            microphoneEnabled={props.microphoneEnabled}
            microphoneLevel={props.microphoneLevel}
            onSetMicrophoneEnabled={props.onSetMicrophoneEnabled}
            onSetMicrophoneDeviceId={props.onSetMicrophoneDeviceId}
          />
        ),
      },
      {
        id: "webcam",
        label: "Webcam",
        icon: RiCameraLine,
        content: (
          <WebcamCaptureCard
            isBusy={props.isBusy}
            webcamDevices={props.webcamDevices}
            webcamEnabled={props.webcamEnabled}
            isWebcamPreviewVisible={props.isWebcamPreviewVisible}
            isWebcamPreviewLoading={props.isWebcamPreviewLoading}
            webcamPreviewStream={props.webcamPreviewStream}
            onSetWebcamEnabled={props.onSetWebcamEnabled}
            onSetWebcamDeviceId={props.onSetWebcamDeviceId}
            onSetWebcamPreviewVisible={props.onSetWebcamPreviewVisible}
          />
        ),
      },
      {
        id: "display",
        label: "Display",
        icon: RiComputerLine,
        content: (
          <DisplayCaptureCard
            isBusy={props.isBusy}
            displays={props.displays}
            screenEnabled={props.screenEnabled}
            isDesktopPreviewVisible={props.isDesktopPreviewVisible}
            isDesktopPreviewLoading={props.isDesktopPreviewLoading}
            desktopPreviewStream={props.desktopPreviewStream}
            onSetScreenEnabled={props.onSetScreenEnabled}
            onSetDisplayId={props.onSetDisplayId}
            onSetDesktopPreviewVisible={props.onSetDesktopPreviewVisible}
            onOpenMonitorPicker={props.onOpenMonitorPicker}
          />
        ),
      },
      {
        id: "system",
        label: "System",
        icon: RiSettings3Line,
        content: (
          <SystemCaptureOptionsCard
            isBusy={props.isBusy}
            systemAudioEnabled={props.systemAudioEnabled}
            screenshotEnabled={props.screenshotEnabled}
            hasCaptureSourceEnabled={props.hasCaptureSourceEnabled}
            onSetSystemAudioEnabled={props.onSetSystemAudioEnabled}
            onSetScreenshotEnabled={props.onSetScreenshotEnabled}
          />
        ),
      },
      {
        id: "recording",
        label: "Recording",
        icon: RiRecordCircleFill,
        content: (
          <RecordingControlCard
            feedbackMessage={props.feedbackMessage}
            currentSessionId={props.currentSessionId}
            isRecording={props.isRecording}
            isBusy={props.isBusy}
            onToggleRecording={props.onToggleRecording}
          />
        ),
      },
      {
        id: "export",
        label: "Export",
        icon: RiDownloadCloud2Line,
        content: (
          <ExportRecordingCard
            canExport={canExport}
            onExportRecording={props.onExportRecording}
          />
        ),
      },
      {
        id: "sandbox",
        label: "Sandbox",
        icon: RiFlaskLine,
        content: <RecordingSandboxCard />,
      },
    ] as const,
    [canExport, props],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <SidebarCardShell
        sections={sections}
        activeSection={activeSection}
        onActiveSectionChange={setActiveSection}
      />
    </div>
  );
}
