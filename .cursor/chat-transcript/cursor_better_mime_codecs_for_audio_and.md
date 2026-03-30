# Better mime codecs for audio and video
_Exported on 3/24/2026 at 11:36:19 EDT from Cursor (2.6.19)_

---

**User**

@src/renderer/recording/constants.ts:5-15 suggest better mime codecs for audio and video. 

---

**Cursor**

Let me read the full file for context, and also check how these constants are used.

Let me also check the export pipeline to understand what downstream processing expects.

Let me check the MIME-to-extension mappings to see what formats are supported on the backend.

Let me check the Electron version to know exactly which Chromium codecs are available.

Now I have full picture of the pipeline. Here's my analysis and recommendations:

---

**Your Electron 41 ships with Chromium ~136**, which unlocks several codec improvements over what you're currently listing.

### Audio: Current list is nearly optimal

Opus is purpose-built for speech and is the ideal codec for an interview recorder. The main change is reordering -- bare `audio/webm` as a fallback could negotiate a non-Opus codec, so `audio/ogg;codecs=opus` should come before it:

```typescript
export const AUDIO_MIME_CANDIDATES = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm",
];
```

This is a minor ordering fix. Opus is already the right answer for speech capture -- low bitrate, high intelligibility, and well-supported by transcription APIs.

### Video: Meaningful improvements available

Chromium 125+ added MP4 muxer support for `MediaRecorder`, and AV1 encoding has been available since Chromium 113. Both are worth adding:

```typescript
export const VIDEO_MIME_CANDIDATES = [
    "video/webm;codecs=vp9,opus",               // best balance of quality/CPU for real-time
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",   // H.264 Baseline + AAC — hw-accelerated, universal playback
    "video/webm;codecs=av01,opus",               // AV1 — 30-50% smaller than VP9, but CPU-heavy
    "video/webm;codecs=vp8,opus",                // legacy fallback
    "video/webm",                                // bare fallback
];
```

**Why this order matters** (since `pickSupportedMimeType` takes the first match):

| Codec | Pro | Con |
|-------|-----|-----|
| **VP9+Opus (WebM)** | Great quality/size, moderate CPU, no container compatibility issues with your existing export pipeline | Slightly higher CPU than H.264 hw encode |
| **H.264+AAC (MP4)** | Hardware-accelerated on all GPUs, universally playable, best for downstream tools | Needs `.mp4` extension support in persistence + export; AAC is slightly worse than Opus for speech |
| **AV1+Opus (WebM)** | Best compression (30-50% smaller), future-proof | Real-time encoding is very CPU-intensive without hardware AV1 encode (Intel 12th+ gen, NVIDIA 40-series) |
| **VP8+Opus (WebM)** | Lowest CPU, always supported | Noticeably worse quality than VP9 at same bitrate |

### If you add MP4: backend changes needed

The `MIME_TO_EXTENSION` maps in `recording-persistence.ts` and `recording-sandbox-persistence.ts` don't know about MP4 yet, and the export pipeline in `recording-export.ts` concatenates raw chunks, which works for WebM (since the container supports appending) but **not** for MP4 (which requires a finalized `moov` atom). 

Two options to handle this:
1. **Keep VP9/WebM as the top pick** (recommended -- your current export pipeline "just works") and add MP4 lower in the list as a last-resort fallback.
2. **Adopt MP4 as primary** but refactor the export to use a proper muxer (e.g., `mp4-muxer` npm package or FFmpeg via `fluent-ffmpeg`) instead of naive chunk concatenation.

### My recommendation

Given your existing chunk-concatenation export and that this is an interview recorder (not a streaming service), I'd suggest:

```typescript
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
```

This adds AV1 as a WebM fallback (so the container stays compatible with your pipeline) while keeping VP9 as the default. AV1 is placed *after* VP8 intentionally -- VP9 will match on virtually all Electron 41 installs, and AV1 is only there for the rare case where VP9 is somehow unavailable but AV1 is.

If you want me to apply either variant (with or without MP4), let me know and I'll update the constants file along with the corresponding `MIME_TO_EXTENSION` maps in the persistence layer.

