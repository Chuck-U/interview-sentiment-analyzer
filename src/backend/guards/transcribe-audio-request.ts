import type { TranscriptionRequest } from "../../shared/transcription";
import { isAudioMediaChunkSource } from "../../shared/session-lifecycle";
import { isNonEmptyArray, isNonEmptyString } from "./checks";

/**
 * Validates and parses the payload for `transcription:transcribe-audio`.
 *
 * Note: We intentionally sanitize `pcmSamples` element-by-element to preserve
 * the existing IPC handler behavior (non-finite / non-number values become `0`).
 */
export function parseTranscribeAudioRequest(input: unknown): TranscriptionRequest {
  if (typeof input !== "object" || input === null) {
    throw new Error("transcribeAudio request must be an object");
  }

  const body = input as Record<string, unknown>;
  const sessionId = body.sessionId;
  const chunkId = body.chunkId;
  const pcmSamples = body.pcmSamples;
  const source = body.source;

  if (!isNonEmptyString(sessionId)) {
    throw new Error("transcribeAudio requires sessionId");
  }
  if (!isNonEmptyString(chunkId)) {
    throw new Error("transcribeAudio requires chunkId");
  }
  if (!isNonEmptyArray(pcmSamples)) {
    throw new Error("transcribeAudio requires pcmSamples array");
  }
  if (!isAudioMediaChunkSource(source)) {
    throw new Error("transcribeAudio requires a supported audio source");
  }

  // Sanitise to match the existing IPC handler's Float32Array conversion step.
  const sanitizedPcmSamples: number[] = (pcmSamples as unknown[]).map((n) => {
    return typeof n === "number" && Number.isFinite(n) ? n : 0;
  });

  return {
    sessionId,
    chunkId,
    pcmSamples: sanitizedPcmSamples,
    source,
  };
}

