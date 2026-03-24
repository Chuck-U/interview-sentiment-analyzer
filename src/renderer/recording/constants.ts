const CHUNK_INTERVAL_MS = 15000;
export const DEFAULT_CHUNK_INTERVAL_MS = CHUNK_INTERVAL_MS;
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