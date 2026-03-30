import type { AudioMediaSource, MediaChunkSource } from "./session-lifecycle";

export const TRANSCRIPTION_CHANNELS = {
  transcribeAudio: "transcription:transcribe-audio",
} as const;

/**
 * One timed span from ASR (`return_timestamps`). Seconds relative to the decoded PCM window.
 * Matches Whisper-style `chunks[].timestamp` from transformers.js.
 */
export type TranscriptChunk = {
  text: string;
  timestamp: [number, number];
};

export type TranscriptionRequest = {
  readonly pcmSamples: number[];
  readonly sessionId: string;
  readonly chunkId: string;
  readonly source: MediaChunkSource;
};

export type TranscriptionResult = {
  readonly source: AudioMediaSource;
  readonly text: string;
  readonly sessionId: string;
  readonly chunkId: string;
  /** Word/segment-level timestamps when the model returns them. */
  readonly chunks?: TranscriptChunk[];
};

export type TranscriptionBridge = {
  transcribeAudio(request: TranscriptionRequest): Promise<TranscriptionResult>;
};

/** Stored under `sessions/<id>/transcripts/<chunkId>.json` — aligns with pipeline `transcript` artifacts. */
export const TRANSCRIPT_ARTIFACT_SCHEMA_VERSION = 1 as const;

/**
 * Canonical JSON written for each chunk transcript (live ASR + pipeline stages).
 * `segments` mirrors {@link TranscriptionResult.chunks} / pipeline “transcript” artifact content.
 */
export type SessionTranscriptArtifactV1 = {
  readonly schemaVersion: typeof TRANSCRIPT_ARTIFACT_SCHEMA_VERSION;
  readonly chunkId: string;
  readonly sessionId: string;
  readonly source: AudioMediaSource;
  /** Full text for the chunk window. */
  readonly text: string;
  /** Optional sub-spans with [start,end] times in seconds (same as {@link TranscriptChunk}). */
  readonly segments?: readonly TranscriptChunk[];
  readonly completedAt: string;
  /** Set when language is known (e.g. pipeline); omit for English-only models. */
  readonly language?: string;
  /**
   * Compatibility with early pipeline placeholders that used `transcript` for full text.
   * Prefer `text`; writers may set both to the same value.
   */
  readonly transcript?: string;
};

export function buildSessionTranscriptArtifact(args: {
  readonly chunkId: string;
  readonly sessionId: string;
  readonly source: AudioMediaSource;
  readonly text: string;
  readonly chunks?: readonly TranscriptChunk[];
  readonly completedAt?: string;
  readonly language?: string;
  /** When true, also sets `transcript` to `text` for legacy readers. */
  readonly includeLegacyTranscriptField?: boolean;
}): SessionTranscriptArtifactV1 {
  const completedAt = args.completedAt ?? new Date().toISOString();
  const base: SessionTranscriptArtifactV1 = {
    schemaVersion: TRANSCRIPT_ARTIFACT_SCHEMA_VERSION,
    chunkId: args.chunkId,
    sessionId: args.sessionId,
    source: args.source,
    text: args.text,
    completedAt,
    ...(args.chunks && args.chunks.length > 0
      ? { segments: args.chunks }
      : {}),
    ...(args.language ? { language: args.language } : {}),
    ...(args.includeLegacyTranscriptField ? { transcript: args.text } : {}),
  };
  return base;
}

/** Session-relative path for a transcript JSON artifact (matches pipeline handoff rules). */
export function getSessionTranscriptRelativePath(chunkId: string): string {
  return `transcripts/${chunkId}.json`;
}
