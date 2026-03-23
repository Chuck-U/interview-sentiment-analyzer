import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import type { SystemCaptureOptionsCardProps } from "./shared";

export function SystemCaptureOptionsCard({
  isBusy,
  systemAudioEnabled,
  screenshotEnabled,
  hasCaptureSourceEnabled,
  onSetSystemAudioEnabled,
  onSetScreenshotEnabled,
}: SystemCaptureOptionsCardProps) {
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="border-b">
        <CardTitle>System Options</CardTitle>
        <CardDescription>
          Configure shared recording behavior that is not tied to a single source card.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-1">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 p-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="system-audio-switch">System audio</Label>
            <p className="text-xs text-muted-foreground">
              Record desktop audio alongside the selected display when available.
            </p>
          </div>
          <Switch
            id="system-audio-switch"
            checked={systemAudioEnabled}
            disabled={isBusy}
            onCheckedChange={onSetSystemAudioEnabled}
          />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/40 p-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="screenshot-switch">Screenshots</Label>
            <p className="text-xs text-muted-foreground">
              Capture screenshots in parallel with the enabled recording sources.
            </p>
          </div>
          <Switch
            id="screenshot-switch"
            checked={screenshotEnabled}
            disabled={isBusy}
            onCheckedChange={onSetScreenshotEnabled}
          />
        </div>

        <div className="rounded-md border border-border/50 bg-background/35 p-3 text-xs text-muted-foreground">
          {hasCaptureSourceEnabled
            ? "At least one source is enabled and ready to record."
            : "Enable at least one source before starting a recording."}
        </div>
      </CardContent>
    </Card>
  );
}
