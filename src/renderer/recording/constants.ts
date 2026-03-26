/** Video / mixed desktop capture chunks (larger files, less frequent). */
const DEFAULT_CHUNK_INTERVAL_MS = 15_000;
export { DEFAULT_CHUNK_INTERVAL_MS };

/** Microphone / system-audio Opus chunks — tuned for live ASR latency. */
export const AUDIO_CHUNK_INTERVAL_MS = 3000;
export const DEFAULT_SCREENSHOT_INTERVAL_MS = 10000;

export const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
];

export const VIDEO_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=av01,opus",
  "video/webm",
];