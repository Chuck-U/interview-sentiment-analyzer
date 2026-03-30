import type { TranscriptChunk } from "../../shared/transcription";

export type NormalizedAsrOutput = {
  readonly text: string;
  readonly chunks?: TranscriptChunk[];
};

/**
 * Normalizes Whisper/transformers.js raw ASR output into the app's `TranscriptionResult` shape.
 *
 * Pure function: no IO, no side effects.
 */
export function normalizeAsrOutput(raw: unknown): NormalizedAsrOutput {
  if (raw === null || typeof raw !== "object") {
    return { text: "" };
  }

  const record = raw as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text : "";

  // If `chunks` is missing / invalid, preserve existing behavior: return only `{ text }`.
  if (!Array.isArray(record.chunks)) {
    return { text };
  }

  const chunks: TranscriptChunk[] = [];
  for (const item of record.chunks) {
    if (item === null || typeof item !== "object") {
      continue;
    }

    const chunk = item as Record<string, unknown>;
    const chunkText = typeof chunk.text === "string" ? chunk.text : "";

    const ts = chunk.timestamp;
    if (
      Array.isArray(ts) &&
      ts.length >= 2 &&
      typeof ts[0] === "number" &&
      typeof ts[1] === "number"
    ) {
      chunks.push({
        text: chunkText,
        timestamp: [ts[0], ts[1]],
      });
    }
  }

  return { text, chunks: chunks.length > 0 ? chunks : undefined };
}

