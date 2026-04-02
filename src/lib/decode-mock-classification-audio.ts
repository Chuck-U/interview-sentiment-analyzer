import { audioBufferToMonoPcm16k } from "@/lib/audio-chunk-accumulator";

/**
 * Bundled clip: `jfk.wav` from Hugging Face dataset `Xenova/transformers.js-docs`
 * (common ASR regression audio; public-domain speech). Michigan TOEFL speaking MP3s
 * surfaced in web search are not redistributed here.
 *
 * Resolves the file next to `index.html` (Vite `public/audio/...`).
 * Works with `file://` prod loads and the dev server.
 */
export function mockQuestionClassificationAudioHref(): string {
  return new URL(
    "audio/mock-question-classification.wav",
    window.location.href,
  ).href;
}

/**
 * Fetch and decode to mono 16 kHz float PCM for `transcribeAudio`.
 */
export async function decodeMockClassificationAudio(): Promise<Float32Array> {
  const href = mockQuestionClassificationAudioHref();
  const res = await fetch(href);
  if (!res.ok) {
    throw new Error(`Mock classification audio fetch failed (${res.status}): ${href}`);
  }
  const buf = await res.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const audioBuffer = await ctx.decodeAudioData(buf.slice(0));
    return audioBufferToMonoPcm16k(audioBuffer);
  } finally {
    await ctx.close();
  }
}
