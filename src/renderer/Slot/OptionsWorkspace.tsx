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
import { ExportRecordingCard } from "./agent-controls-cards/ExportRecordingCard";
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
        id: "ai-provider",
        label: "AI Provider",
        icon: RiBrainLine,
        content: <AiProviderCard />,
      },
      {
        id: "microphone",
        label: "Input Devices",
        icon: RiEqualizerLine,
        content: (
          <> <OptionsCard title="Microphone" description="Capture input"> <MicrophoneCaptureCard
            isBusy={props.isBusy}
            microphoneDevices={props.microphoneDevices}
            microphoneEnabled={props.microphoneEnabled}
            microphoneLevel={props.microphoneLevel}
            onSetMicrophoneEnabled={props.onSetMicrophoneEnabled}
            onSetMicrophoneDeviceId={props.onSetMicrophoneDeviceId}
          />
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
              feedbackMessage={props.feedbackMessage}
              currentSessionId={props.currentSessionId}
              isRecording={props.isRecording}
              isBusy={props.isBusy}
              onToggleRecording={props.onToggleRecording}
              onOpenRecordingsFolder={props.onOpenRecordingsFolder}
              recordingState={props.recordingState as unknown as RecordingState}
            />

          </OptionsCard>
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
        id: "options",
        label: "Options",
        icon: RiSettings3Line,
        content: (
          <OptionsCard title="Options" description="View and manage your options.">

            <OptionsOverviewCard {...props} />,
          </OptionsCard>
        ),
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
        onOpenRecordingsFolder={props.onOpenRecordingsFolder}
      />
    </div>
  );
}
