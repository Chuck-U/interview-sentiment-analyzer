import { useEffect, useRef } from "react";

import { toast } from "sonner";

import { useAppSelector } from "@/renderer/store/hooks";
import { logger } from "@/lib/logger";
/**
 * Shows a toast when a new transcript segment lands in {@link diarizationSlice}.
 * Lives in the app root so it runs in whichever renderer window is dispatching segments.
 */
const log = logger.forSource("useDiarizationTranscriptToasts");
export function useDiarizationTranscriptToasts(): void {
  const lastSegment = useAppSelector((state) => {
    const segments = state.diarization.segments;
    return segments.length === 0 ? null : segments[segments.length - 1];
  });
  const segmentCount = useAppSelector((state) => state.diarization.segments.length);
  const lastTranscriptionError = useAppSelector(
    (state) => state.diarization.lastTranscriptionError,
  );
  const failureCount = useAppSelector(
    (state) => state.diarization.transcriptionFailureCount,
  );
  const lastToastedChunkId = useRef<string | null>(null);
  const lastLoggedErrorAt = useRef<string | null>(null);

  useEffect(() => {
    if (segmentCount === 0) {
      lastToastedChunkId.current = null;
      log.ger({
        type: "debug",
        message: "Transcript segments cleared (dedupe ref reset)",
      });
    }
  }, [segmentCount]);

  useEffect(() => {
    if (!lastTranscriptionError) {
      lastLoggedErrorAt.current = null;
      return;
    }
    const key = `${lastTranscriptionError.at}:${lastTranscriptionError.chunkId}`;
    if (lastLoggedErrorAt.current === key) {
      return;
    }
    lastLoggedErrorAt.current = key;
    log.ger({
      type: "error",
      message: "Transcription failure recorded in store",
      data: {
        ...lastTranscriptionError,
        transcriptionFailureCount: failureCount,
      },
    });
    toast.error(`Transcription failed (${lastTranscriptionError.chunkId.slice(0, 8)}…)`, {
      description: lastTranscriptionError.message,
      duration: 10_000,
      id: `transcript-err-${lastTranscriptionError.chunkId}`,
    });
  }, [failureCount, lastTranscriptionError]);

  useEffect(() => {
    if (!lastSegment) {
      return;
    }
    const text = lastSegment.text.trim();
    if (!text) {
      log.ger({
        type: "debug",
        message: "Skipping toast: empty transcript text",
        data: { chunkId: lastSegment.chunkId },
      });
      return;
    }
    if (lastToastedChunkId.current === lastSegment.chunkId) {
      log.ger({
        type: "debug",
        message: "Skipping toast: same chunk already shown",
        data: { chunkId: lastSegment.chunkId },
      });
      return;
    }
    lastToastedChunkId.current = lastSegment.chunkId;

    log.ger({
      type: "info",
      message: "Transcript segment toast",
      data: {
        sessionId: lastSegment.sessionId,
        chunkId: lastSegment.chunkId,
        textLength: text.length,
      },
    });

    toast.message(text, {
      id: `transcript-${lastSegment.chunkId}`,
    });
  }, [lastSegment]);
}
