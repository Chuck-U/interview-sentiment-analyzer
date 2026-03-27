import { useMemo, useState } from "react";

import {
  RiBrainLine,
  RiDownloadCloud2Line,
  RiEqualizerLine,
  RiRecordCircleFill,
  RiSettings3Line,
} from "@remixicon/react";

import type { OptionsProps } from "./Options";
import { OptionsOverviewCard } from "./OptionsOverviewCard";
import { SidebarCardShell } from "./SidebarCardShell";
import { AiProviderCard } from "./agent-controls-cards/AiProviderCard";
import { RecordingControlCard } from "./agent-controls-cards/RecordingControlCard";
import { DisplayCaptureCard } from "./capture-options-cards/DisplayCaptureCard";
import { MicrophoneCaptureCard } from "./capture-options-cards/MicrophoneCaptureCard";
import type { CaptureOptionSectionId } from "./capture-options-cards/shared";
import { WebcamCaptureCard } from "./capture-options-cards/WebcamCaptureCard";
import { OptionsCard } from "./capture-options-cards/OptionsCard";

type WorkspaceSectionId =
  | "options"
  | "ai-provider"
  | CaptureOptionSectionId
  | "recordings"
  | "export"


type OptionsWorkspaceProps = Omit<OptionsProps, "layout"> & {
  readonly initialSection?: WorkspaceSectionId;
};

export function OptionsWorkspace({
  initialSection = "microphone",
  statusLabel,
  statusVariant,
  platformLabel,
  windowSizeLabel,
  windowBoundsLabel,
  currentSessionId,
  feedbackMessage,
  isRecording,
  isBusy,
  onToggleRecording,
  shortcutLabel,
  isShortcutEnabled,
  onSetShortcutEnabled,
  recordingState,
  onExportRecording,
  permissions,
  microphoneDevices,
  audioOutputDevices,
  webcamDevices,
  displays,
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
  onOpenRecordingsFolder,
  onQuit,
}: OptionsWorkspaceProps) {
  const [activeSection, setActiveSection] =
    useState<WorkspaceSectionId>(initialSection);

  const sections = [


    {
      id: "microphone",
      label: "Input Devices",
      icon: RiEqualizerLine,
      content: (
        <> <OptionsCard title="Microphone" description="Capture input"> <MicrophoneCaptureCard
          isBusy={isBusy}
          microphoneDevices={microphoneDevices}
          microphoneEnabled={microphoneEnabled}
          microphoneLevel={microphoneLevel}
          onSetMicrophoneEnabled={onSetMicrophoneEnabled}
          onSetMicrophoneDeviceId={onSetMicrophoneDeviceId}
        />
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
        </>
      ),
    },
    {
      id: "recordings",
      label: "Recordings",
      icon: RiRecordCircleFill,
      content: (
        <OptionsCard title="Recording" description="View and manage your recordings.">
          <RecordingControlCard
            feedbackMessage={feedbackMessage}
            currentSessionId={currentSessionId}
            isRecording={isRecording}
            isBusy={isBusy}
            onToggleRecording={onToggleRecording}
            onOpenRecordingsFolder={onOpenRecordingsFolder}
            recordingState={recordingState as unknown as RecordingState}
          />

        </OptionsCard>
      ),
    },
    {
      id: "ai-provider",
      label: "AI Provider",
      icon: RiBrainLine,
      content: (
        <OptionsCard title="AI Provider" description="Provider configuration and API key Management.">
          <AiProviderCard />
        </OptionsCard>
      ),
    },
    {
      id: "options",
      label: "Shortcuts",
      icon: RiSettings3Line,
      content: (
        <OptionsCard title="Options" description="View and manage your options.">

          <OptionsOverviewCard
            shortcutLabel={shortcutLabel}
            isShortcutEnabled={isShortcutEnabled}
            onSetShortcutEnabled={onSetShortcutEnabled}
            isBusy={isBusy}
          />,
        </OptionsCard>
      ),
    },

  ]

  return (
    <div className="flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        <SidebarCardShell
          sections={sections}
          activeSection={activeSection}
          onActiveSectionChange={(section) => setActiveSection(section as WorkspaceSectionId)}
          onOpenRecordingsFolder={onOpenRecordingsFolder}
        />
      </div>
    </div>
  );
}
