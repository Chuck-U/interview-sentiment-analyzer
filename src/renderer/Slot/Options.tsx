import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { RecordingStateSnapshot } from "@/shared/recording";

export type AgentOptionsView = "controls" | "options";

export type OptionsProps = {
  readonly view: AgentOptionsView;
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

  readonly onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly activeInteraction: "move" | "resize" | null;
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
  view: _view,
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
  onResizeStart,
  activeInteraction,
  onQuit,
}: OptionsProps) {
    return (
      <div className="flex h-full w-full flex-col gap-3">
        <Card className="w-full">
          <CardHeader className="flex flex-col gap-1">
            <CardTitle>Options</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant}>{statusLabel}</Badge>
              <Badge variant="outline" className="capitalize">
                {platformLabel}
              </Badge>
              <Badge variant="outline">{windowSizeLabel}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Keyboard shortcuts</p>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/35 p-3">
                <div className="flex flex-col gap-1">
                  <p className="text-sm">Recording toggle</p>
                  <p className="text-sm text-muted-foreground">
                    Trigger: {shortcutLabel}
                  </p>
                </div>
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
              <p className="text-xs text-muted-foreground">
                More shortcut configurations coming soon.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Preferences</p>
              <div className="rounded-md border border-border/50 bg-background/35 p-3">
                <p className="text-sm text-muted-foreground">
                  Placeholder for additional agent preferences.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader className="flex flex-col gap-1">
            <CardTitle>Agent Controls</CardTitle>
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
          <CardContent className="flex flex-col gap-3">
            <div className="rounded-md border border-border/50 bg-background/35 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">Start / Stop recording</p>
                  <p className="text-sm text-muted-foreground">{feedbackMessage}</p>
                </div>
                <div style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
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
          <CardFooter className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
                onPointerDown={onResizeStart}
                className="touch-none"
              >
                {activeInteraction === "resize"
                  ? "Resizing overlay"
                  : "Resize window"}
              </Button>
            </div>
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
      </div>
    );
}