import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";

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
    <div className="flex flex-col gap-3 rounded-md gap-y-4 p-4 my-5 justify-center min-h-1/2">
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
    </div>
  );
}
