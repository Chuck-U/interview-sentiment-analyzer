import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { CSSProperties } from "react";
import type { OptionsProps } from "./Options";

export type AgentControlsProps = Omit<OptionsProps, "view" | "onQuit">;

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
  onResizeStart,
  activeInteraction,
}: AgentControlsProps) {
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

        </CardFooter>
      </Card>
    </div>
  );
}