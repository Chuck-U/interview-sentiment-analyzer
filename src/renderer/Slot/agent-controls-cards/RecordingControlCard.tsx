import type { CSSProperties } from "react";

import { RiFolderOpenLine, RiRecordCircleLine, RiStopCircleLine } from "@remixicon/react";

import { Badge } from "@/components/ui/badge";

import { IconToggle } from "../IconToggle";
import { Button } from "@/components/ui/button";
import type { RecordingStateSnapshot } from "@/shared/recording";

type RecordingControlCardProps = {
  readonly feedbackMessage: string;
  readonly currentSessionId?: string;
  readonly isRecording: boolean;
  readonly isBusy: boolean;
  readonly onToggleRecording: (enabled: boolean) => void;
  readonly onOpenRecordingsFolder: () => void;
  readonly recordingState?: RecordingStateSnapshot | null;
};

export function RecordingControlCard({
  feedbackMessage,
  currentSessionId,
  isRecording,
  isBusy,
  onToggleRecording,
  onOpenRecordingsFolder,
  recordingState: _recordingState,
}: RecordingControlCardProps) {
  return (
    <div className="flex h-stretch  flex-col justify-between gap-y-4 px-2 mt-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Start / Stop recording</p>
          <p className="text-sm text-muted-foreground">{feedbackMessage}</p>
        </div>
        <div style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
          <IconToggle
            pressed={isRecording}
            ariaLabel="Start or stop recording"
            disabled={isBusy}
            onPressedChange={onToggleRecording}
            IconActive={RiStopCircleLine}
            IconInactive={RiRecordCircleLine}
          />
        </div>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Recordings folder</p>
          <p className="text-xs text-muted-foreground">
            Open the current session&apos;s exported recordings directory in your
            system file browser.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          disabled={false}
          onClick={onOpenRecordingsFolder}
        >
          <RiFolderOpenLine className="size-4" />
          Open folder
        </Button>
      </div>
      {currentSessionId ? (
        <div className="mt-3">
          <Badge variant="outline" className={`${currentSessionId ? 'bg-yellow-contrast/20 animate-pulse duration-400 ease-out' : 'bg-red-500'}`}>Session {currentSessionId.slice(0, 8)}</Badge>
        </div>
      ) : null}
    </div>
  );
}
