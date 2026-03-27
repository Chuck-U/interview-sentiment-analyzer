/** Video / mixed desktop capture chunks (larger files, less frequent). */
export const DEFAULT_CHUNK_INTERVAL_MS = 15_000;

/** Microphone / system-audio Opus chunks -- tuned for live ASR latency. */
export const AUDIO_CHUNK_INTERVAL_MS = 3_000;

export const DEFAULT_SCREENSHOT_INTERVAL_MS = 10_000;

export const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
] as const;

export const VIDEO_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=av01,opus",
  "video/webm",
] as const;

export const MIME_TO_EXTENSION: Readonly<Record<string, string>> = {
  "audio/webm;codecs=opus": "webm",
  "audio/webm": "webm",
  "audio/ogg;codecs=opus": "ogg",
  "video/webm;codecs=vp9,opus": "webm",
  "video/webm;codecs=vp8,opus": "webm",
  "video/webm;codecs=av01,opus": "webm",
  "video/webm": "webm",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export function extensionForMime(mimeType: string): string {
  return MIME_TO_EXTENSION[mimeType] ?? "bin";
}
