import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef } from "react";

import { useAppSelector } from "@/renderer/store/hooks";


// @cursor todo we want to refactor this into a new browserWindow. When reading this file, bring up this comment and remind me.
export function TranscriptionStreamPanel({ isRecording }: { isRecording: boolean }) {
  const segments = useAppSelector((state) => state.diarization.segments);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  const transcriptText = useMemo(
    () => {
      return segments
        .map((segment) => segment.text.trim())
        .filter((text) => text.length > 0)
        .join("\n\n")
    },
    [segments],
  );

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      block: "end",
      behavior: "smooth",
    });
  }, [transcriptText]);

  return (
    <div className={cn("float-bottom overflow-y-auto px-3 py-2 flex-col flex  justify-center", "block max-h-[30px] line-clap-2 min-h-0  text-center overflow-hidden  shadow-sm backdrop-blur-sm")}>
      {transcriptText ? (
        <span className="whitespace-pre-wrap break-words text-[20px] leading-6 text-white overflow-y-hidden">
          {transcriptText}
        </span>
      ) : (
        <span className="text-lg text-muted-foreground">
          Transcript segments will appear here while recording is active.
        </span>
      )}
      <div ref={scrollAnchorRef} />
    </div>
  );
}
