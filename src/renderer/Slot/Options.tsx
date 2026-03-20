import type { CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { RecordingSandboxCard } from "@/renderer/recording/recording-sandbox-card";
import type { CapturePermissionSnapshot } from "@/shared/capture-options";
import type { RecordingStateSnapshot } from "@/shared/recording";

import { CaptureOptionsPanel } from "./CaptureOptionsPanel";
import type { CaptureDeviceOption, CaptureDisplayOption } from "../capture-options/domain";
import { useState } from "react";

export type OptionsCardLayout = "controls" | "options" | "sandbox";

export type OptionsProps = {
  readonly layout: OptionsCardLayout;
  readonly statusLabel: string;
  readonly statusVariant: "default" | "secondary" | "outline";
  readonly platformLabel: string;
  readonly windowSizeLabel: string;
  readonly windowBoundsLabel?: string;
  readonly currentSessionId?: string;
  readonly feedbackMessage: string;

  readonly isRecording: boolean;
  readonly isBusy: boolean;
  readonly onToggleRecording: (enabled: boolean) => void;

  readonly shortcutLabel: string;
  readonly isShortcutEnabled: boolean;
  readonly onSetShortcutEnabled: (enabled: boolean) => void;

  readonly recordingState: RecordingStateSnapshot | null;
  readonly onExportRecording?: () => void;

  readonly permissions: CapturePermissionSnapshot | null;
  readonly microphoneDevices: readonly CaptureDeviceOption[];
  readonly webcamDevices: readonly CaptureDeviceOption[];
  readonly displays: readonly CaptureDisplayOption[];
  readonly microphoneEnabled: boolean;
  readonly webcamEnabled: boolean;
  readonly screenEnabled: boolean;
  readonly systemAudioEnabled: boolean;
  readonly screenshotEnabled: boolean;
  readonly microphoneLevel: number;
  readonly isWebcamPreviewVisible: boolean;
  readonly webcamPreviewStream: MediaStream | null;
  readonly isDesktopPreviewVisible: boolean;
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
  readonly onQuit: () => void;
};

const CAPTURE_STATE_LABELS: Record<string, string> = {
  idle: "Idle",
  "requesting-permission": "Requesting permission",
  capturing: "Capturing",
  stopping: "Stopping",
  error: "Error",
  stopped: "Stopped",
};

const EXPORT_STATUS_LABELS: Record<string, string> = {
  idle: "",
  queued: "Export queued",
  assembling: "Assembling recording",
  completed: "Export complete",
  failed: "Export failed",
};

export function Options({
  layout,
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
  webcamDevices,
  displays,
  microphoneEnabled,
  webcamEnabled,
  screenEnabled,
  systemAudioEnabled,
  screenshotEnabled,
  microphoneLevel,
  isWebcamPreviewVisible,
  webcamPreviewStream,
  isDesktopPreviewVisible,
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
  onQuit,
}: OptionsProps) {
  const [showPermissions, setShowPermissions] = useState(false);
  const optionsCard = (
    <Card className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <CardHeader className="flex shrink-0 flex-col gap-1">
        <CardTitle>Options</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant}>{statusLabel}</Badge>
          <Badge variant="outline" className="capitalize">
            {platformLabel}
          </Badge>
          <Badge variant="outline">{windowSizeLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Keyboard shortcuts</p>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/35 p-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm">Recording toggle</p>
              <p className="text-sm text-muted-foreground">
                Trigger: {shortcutLabel}
              </p>
            </div>
            {/* add a input with keybinding for capture shortcut */}

            <div
              style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            >
              <Switch
                checked={isShortcutEnabled}
                aria-label="Toggle recording keyboard shortcut"
                disabled={isBusy}
                onCheckedChange={(enabled) => onSetShortcutEnabled(enabled)}
              />
            </div>
          </div>

        </div>

        <div className="flex flex-1 flex-col gap-2 min-h-0">
          <p className="text-sm font-medium">Recording sources</p>
          <CaptureOptionsPanel
            isBusy={isBusy}
            microphoneDevices={microphoneDevices}
            webcamDevices={webcamDevices}
            displays={displays}
            permissions={permissions}
            microphoneEnabled={microphoneEnabled}
            webcamEnabled={webcamEnabled}
            screenEnabled={screenEnabled}
            systemAudioEnabled={systemAudioEnabled}
            screenshotEnabled={screenshotEnabled}
            microphoneLevel={microphoneLevel}
            isWebcamPreviewVisible={isWebcamPreviewVisible}
            webcamPreviewStream={webcamPreviewStream}
            isDesktopPreviewVisible={isDesktopPreviewVisible}
            desktopPreviewStream={desktopPreviewStream}
            hasCaptureSourceEnabled={hasCaptureSourceEnabled}
            onSetMicrophoneEnabled={onSetMicrophoneEnabled}
            onSetWebcamEnabled={onSetWebcamEnabled}
            onSetScreenEnabled={onSetScreenEnabled}
            onSetSystemAudioEnabled={onSetSystemAudioEnabled}
            onSetScreenshotEnabled={onSetScreenshotEnabled}
            onSetMicrophoneDeviceId={onSetMicrophoneDeviceId}
            onSetWebcamDeviceId={onSetWebcamDeviceId}
            onSetDisplayId={onSetDisplayId}
            onSetWebcamPreviewVisible={onSetWebcamPreviewVisible}
            onSetDesktopPreviewVisible={onSetDesktopPreviewVisible}
            onOpenMonitorPicker={onOpenMonitorPicker}
            showPermissions={showPermissions}
            setShowPermissions={setShowPermissions}
          />
        </div>
      </CardContent>
    </Card>
  );

  const controlsCard = (
    <Card className="flex h-full min-h-0 w-full flex-col overflow-y-scroll min-h-80vh" style={{ WebkitAppRegion: "drag" } as CSSProperties}>
      <CardHeader className="flex shrink-0 flex-col gap-1">
        <CardTitle>Controls</CardTitle>
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
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto " style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
        <div className="rounded-md border border-border/50 bg-background/35 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Start / Stop recording</p>
              <p className="text-sm text-muted-foreground">{feedbackMessage}</p>
            </div>
            <div style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
              {/* change this button style, it's bad. */}
              <Switch
                checked={isRecording}
                aria-label="Start or stop recording"
                disabled={isBusy}
                onCheckedChange={(enabled) => onToggleRecording(enabled)}
              />
            </div>
          </div>

          {currentSessionId ? (
            <div className="mt-3">
              <Badge variant="outline">Session {currentSessionId}</Badge>
            </div>
          ) : null}
        </div>
        {/* add this to debug view */}
        {recordingState && recordingState.sources.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-background/35 p-3">
            <p className="text-sm font-medium">Capture sources</p>
            {recordingState.sources.map((source) => (
              <div
                key={source.source}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="capitalize">{source.source}</span>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      source.state === "capturing"
                        ? "default"
                        : source.state === "error"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {CAPTURE_STATE_LABELS[source.state] ?? source.state}
                  </Badge>
                  <Badge variant="outline">{source.chunkCount} chunks</Badge>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 pt-1 text-sm text-muted-foreground">
              <span>Total chunks</span>
              <span>{recordingState.totalChunkCount}</span>
            </div>
            {recordingState.exportStatus !== "idle" ? (
              <div className="flex items-center justify-between gap-2 pt-1 text-sm">
                <span>{EXPORT_STATUS_LABELS[recordingState.exportStatus]}</span>
                {recordingState.exportFilePath ? (
                  <Badge variant="outline" className="truncate max-w-[200px]">
                    {recordingState.exportFilePath.split(/[\\/]/).pop()}
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {!isRecording &&
          recordingState &&
          recordingState.totalChunkCount > 0 &&
          recordingState.exportStatus === "idle" &&
          onExportRecording ? (
          <div
            className="flex justify-end"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onExportRecording}
            >
              Export recording
            </Button>
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="flex shrink-0 items-center justify-end gap-3">
        <Button
          type="button"
          variant="destructive"
          size="xs"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
          onClick={onQuit}
        >
          Quit
        </Button>
      </CardFooter>
    </Card>
  );

  const shellClass =
    "flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden";

  if (layout === "options") {
    return <div className={shellClass}>{optionsCard}</div>;
  }

  if (layout === "controls") {
    return <div className={shellClass}>{controlsCard}</div>;
  }

  return (
    <div className={shellClass}>
      <RecordingSandboxCard />
    </div>
  );
}