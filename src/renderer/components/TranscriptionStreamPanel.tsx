import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef } from "react";

import { useAppSelector } from "@/renderer/store/hooks";

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
    <section className={cn("flex h-full min-h-0 flex-col text-center overflow-hidden  shadow-sm backdrop-blur-sm", isRecording ? "animate-pulse duration-400 ease-out" : "px-2  border-lime-green-500")}>
      <div className="overflow-y-auto px-3 py-2 flex-col flex items-center justify-center">
        {transcriptText ? (
          <span className="whitespace-pre-wrap break-words text-[20px] leading-6 text-foreground  opacity-50">
            {transcriptText}
          </span>
        ) : (
          <span className="text-lg text-muted-foreground">
            Transcript segments will appear here while recording is active.
          </span>
        )}
        <div ref={scrollAnchorRef} />
      </div>
    </section>
  );
}
