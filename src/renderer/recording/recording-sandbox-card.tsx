import type { CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSimpleMediaRecorder } from "./use-simple-media-recorder";

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  "requesting-permission": "Requesting permission",
  recording: "Recording",
  stopping: "Stopping",
  stopped: "Ready",
  error: "Error",
};

function formatBytes(byteLength: number): string {
  if (byteLength < 1024) {
    return `${byteLength} B`;
  }

  if (byteLength < 1024 * 1024) {
    return `${(byteLength / 1024).toFixed(1)} KB`;
  }

  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

export function RecordingSandboxCard() {
  const { snapshot, result, savedFilePath, startRecording, stopRecording, clearRecording } =
    useSimpleMediaRecorder();

  const isBusy =
    snapshot.status === "requesting-permission" || snapshot.status === "stopping";
  const isRecording = snapshot.status === "recording";

  return (
    <Card className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <CardHeader className="flex shrink-0 flex-col gap-1">
        <CardTitle>Capture Sandbox</CardTitle>
        <p className="text-sm text-muted-foreground">
          Desktop capture smoke test. Capture starts in the renderer, then the final file is
          handed to Electron over IPC and written to disk when you stop.
        </p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              snapshot.status === "recording"
                ? "default"
                : snapshot.status === "error"
                  ? "destructive"
                  : "outline"
            }
          >
            {STATUS_LABELS[snapshot.status] ?? snapshot.status}
          </Badge>
          {snapshot.kind ? (
            <Badge variant="outline" className="capitalize">
              {snapshot.kind}
            </Badge>
          ) : null}
          {snapshot.mimeType ? (
            <Badge variant="outline">{snapshot.mimeType}</Badge>
          ) : null}
          {result ? (
            <Badge variant="outline">
              {formatBytes(result.byteLength)} across {result.chunkCount} chunk
              {result.chunkCount === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>

        {snapshot.errorMessage ? (
          <p className="text-sm text-destructive">{snapshot.errorMessage}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Start desktop capture, choose a screen or window, then stop to persist the final
            recording through Electron IPC.
          </p>
        )}

        <div
          className="flex flex-wrap gap-2"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <Button
            type="button"
            size="sm"
            disabled={isBusy || isRecording}
            onClick={() => {
              void startRecording("desktop");
            }}
          >
            Start desktop capture
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isBusy || !isRecording}
            onClick={() => {
              void stopRecording();
            }}
          >
            Stop capture
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isRecording || (!result && !snapshot.errorMessage)}
            onClick={clearRecording}
          >
            Reset sandbox
          </Button>
        </div>

        {result ? (
          <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-background/35 p-3">
            <p className="text-sm font-medium">Recording complete</p>
            <p className="text-sm text-muted-foreground">
              Recorded from {result.startedAt} to {result.stoppedAt}.
            </p>
            {snapshot.targetDirectory ? (
              <p className="text-xs text-muted-foreground">
                Target folder: {snapshot.targetDirectory}
              </p>
            ) : null}
            {savedFilePath ? (
              <p className="text-xs text-muted-foreground">
                Saved file: {savedFilePath}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
