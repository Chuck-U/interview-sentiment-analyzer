import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ExportRecordingCardProps = {
  readonly canExport: boolean;
  readonly onExportRecording?: () => void;
};

export function ExportRecordingCard({
  canExport,
  onExportRecording,
}: ExportRecordingCardProps) {
  return (
    //  Let's give the path to the recording folder to the user on completion of the export. This seems like it was hallucinated in implementation
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="border-b">
        <CardTitle>Export</CardTitle>
        <CardDescription>
          Persist the most recent finished recording when a completed session is available.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-4 py-1">
        <p className="text-sm text-muted-foreground">
          {canExport
            ? "The current recording session is ready to export."
            : "Complete a recording before exporting from this panel."}
        </p>
        <div style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canExport || !onExportRecording}
            onClick={onExportRecording}
          >
            Export recording
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
