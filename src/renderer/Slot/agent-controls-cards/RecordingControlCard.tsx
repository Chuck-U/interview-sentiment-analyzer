import type { CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type RecordingControlCardProps = {
  readonly feedbackMessage: string;
  readonly currentSessionId?: string;
  readonly isRecording: boolean;
  readonly isBusy: boolean;
  readonly onToggleRecording: (enabled: boolean) => void;
};

export function RecordingControlCard({
  feedbackMessage,
  currentSessionId,
  isRecording,
  isBusy,
  onToggleRecording,
}: RecordingControlCardProps) {
  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="border-b">
        <CardTitle>Recording</CardTitle>
        <CardDescription>
          Start or stop the active session without leaving the controls window.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-1">
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
                onCheckedChange={onToggleRecording}
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
    </Card>
  );
}
