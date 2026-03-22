import type { CSSProperties, ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";

import {
  RiDownloadCloud2Line,
  RiPlayCircleLine,
  RiFlaskLine,
} from "@remixicon/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RecordingSandboxCard } from "@/renderer/recording/recording-sandbox-card";

import type { OptionsProps } from "./Options";
import { SidebarCardShell } from "./SidebarCardShell";
import { ExportRecordingCard } from "./agent-controls-cards/ExportRecordingCard";
import { RecordingControlCard } from "./agent-controls-cards/RecordingControlCard";

type ControlsSectionId = "recording" | "export" | "sandbox";

type ControlsSection = {
  readonly id: ControlsSectionId;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly content: ReactNode;
};

export type AgentControlsProps = Omit<OptionsProps, "layout" | "dragRegionStyle">;

export function AgentControls({
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
  recordingState,
  onExportRecording,
  onQuit,
  showStatusBadges = true,
  showQuitButton = true,
}: AgentControlsProps & {
  readonly showStatusBadges?: boolean;
  readonly showQuitButton?: boolean;
}) {
  const [activeSection, setActiveSection] =
    useState<ControlsSectionId>("recording");
  const canExport =
    !isRecording &&
    !!recordingState &&
    recordingState.totalChunkCount > 0 &&
    recordingState.exportStatus === "idle";

  const sections = useMemo<readonly ControlsSection[]>(
    () => [
      {
        id: "recording",
        label: "Recording",
        icon: RiPlayCircleLine,
        content: (
          <RecordingControlCard
            feedbackMessage={feedbackMessage}
            currentSessionId={currentSessionId}
            isRecording={isRecording}
            isBusy={isBusy}
            onToggleRecording={onToggleRecording}
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
            onExportRecording={onExportRecording}
          />
        ),
      },
      {
        id: "sandbox",
        label: "Sandbox",
        icon: RiFlaskLine,
        content: <RecordingSandboxCard />,
      },
    ],
    [
      canExport,
      currentSessionId,
      feedbackMessage,
      isBusy,
      isRecording,
      onExportRecording,
      onToggleRecording,
    ],
  );

  return (
    <div className="flex h-full w-full min-h-0 flex-col gap-3">
      {showStatusBadges ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant}>{statusLabel}</Badge>
          <Badge variant="outline" className="capitalize">
            {platformLabel}
          </Badge>
          <Badge variant="outline">{windowSizeLabel}</Badge>
          {windowBoundsLabel ? (
            <Badge variant="outline">{windowBoundsLabel}</Badge>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border/50 bg-background/25">
        <SidebarCardShell
          sections={sections}
          activeSection={activeSection}
          onActiveSectionChange={setActiveSection}
        />
      </div>

      {showQuitButton ? (
        <div
          className="flex justify-end"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <Button type="button" variant="destructive" size="xs" onClick={onQuit}>
            Quit
          </Button>
        </div>
      ) : null}
    </div>
  );
}