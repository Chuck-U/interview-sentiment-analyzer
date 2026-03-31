import { useCallback } from "react";

import {
  RiBrainLine,
  RiEqualizerLine,
  RiFileList3Line,
  RiRecordCircleFill,
  RiSettings3Line,
} from "@remixicon/react";

import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  setActiveOptionsSection,
  type OptionsSectionId,
} from "../store/slices/viewsSlice";

import type { OptionsProps } from "./Options";
import { OptionsOverviewCard } from "./OptionsOverviewCard";
import { SidebarCardShell } from "./SidebarCardShell";
import { AiProviderCard } from "./agent-controls-cards/AiProviderCard";
import { RecordingControlCard } from "./agent-controls-cards/RecordingControlCard";
import { DisplayCaptureCard } from "./capture-options-cards/DisplayCaptureCard";
import { MicrophoneCaptureCard } from "./capture-options-cards/MicrophoneCaptureCard";
import { WebcamCaptureCard } from "./capture-options-cards/WebcamCaptureCard";
import { LicensesAndAcknowledgementsCard } from "./capture-options-cards/LicensesAndAcknowledgementsCard";
import { OptionsCard } from "./capture-options-cards/OptionsCard";

export type { OptionsSectionId as optionsSectionId };

type OptionsWorkspaceProps = Omit<OptionsProps, "layout">;

export function OptionsWorkspace({
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
  const dispatch = useAppDispatch();
  const activeOptionsSection = useAppSelector(
    (state) => state.views.activeOptionsSection,
  );
  const handleActiveOptionsSectionChange = useCallback(
    (section: OptionsSectionId) => {
      dispatch(setActiveOptionsSection(section));
    },
    [dispatch],
  );

  const sections = [


    {
      id: "capture-options",
      label: "Input Devices",
      icon: RiEqualizerLine,
      content: (
        <> <OptionsCard title="Microphone" description="Capture input">
          <MicrophoneCaptureCard
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
            recordingState={recordingState ?? undefined}
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
          />
        </OptionsCard>
      ),
    },
    {
      id: "licenses",
      label: "Licenses",
      icon: RiFileList3Line,
      content: (
        <OptionsCard title="Licenses" description="Open-source notices and acknowledgements.">
          <LicensesAndAcknowledgementsCard />
        </OptionsCard>
      ),
    },

  ]

  return (
    <div className="flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        <SidebarCardShell
          sections={sections}
          activeSection={activeOptionsSection}
          onActiveSectionChange={(section) =>
            handleActiveOptionsSectionChange(section as OptionsSectionId)
          }
          onOpenRecordingsFolder={onOpenRecordingsFolder}
        />
      </div>
    </div>
  );
}
