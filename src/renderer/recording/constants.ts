const CHUNK_INTERVAL_FIVE_SECONDS = 5000;
export const DEFAULT_CHUNK_INTERVAL_MS = CHUNK_INTERVAL_FIVE_SECONDS;
export const DEFAULT_SCREENSHOT_INTERVAL_MS = 10000;

export const AUDIO_MIME_CANDIDATES = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
];

export const VIDEO_MIME_CANDIDATES = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
];