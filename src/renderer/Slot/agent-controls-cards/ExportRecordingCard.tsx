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
    <div className="flex flex-col gap-3 rounded-md gap-y-4 p-4 my-5 justify-center min-h-1/2">
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
