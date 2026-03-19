import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

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

  readonly onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  readonly activeInteraction: "move" | "resize" | null;
  readonly onQuit: () => void;
};

export function Options({
  view,
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
  onResizeStart,
  activeInteraction,
  onQuit,
}: OptionsProps) {
  if (view === "options") {
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

  return (
    <div className="flex h-full w-full flex-col gap-3">
      <Card className="w-full h-full">
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
              {activeInteraction === "resize" ? "Resizing overlay" : "Resize window"}
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