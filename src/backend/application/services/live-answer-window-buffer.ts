import { AUDIO_CHUNK_INTERVAL_MS } from "../../../shared/recording-constants";
import { mergeConsecutiveAsrTexts } from "../../guards/merge-asr-transcript-seams";

const DEFAULT_MAX_WINDOW_MS = 30_000;
const DEFAULT_SILENCE_BREAK_MS = 4000;
/** Normalized mono PCM; tune if silence end fires too often on quiet mics. */
const DEFAULT_SILENCE_RMS_THRESHOLD = 0.012;

export type LiveAnswerWindowBufferOptions = {
  readonly maxWindowMs?: number;
  readonly silenceBreakMs?: number;
  readonly silenceRmsThreshold?: number;
  readonly fallbackChunkDurationMs?: number;
};

export type LiveAnswerWindowSample = {
  readonly chunkId: string;
  readonly recordedAt: string;
  readonly text: string;
  readonly pcmRms?: number;
  readonly pcmDurationMs?: number;
};

export type LiveAnswerWindowInterval = {
  readonly chunkIds: readonly string[];
  readonly text: string;
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
};

type BufferedSample = {
  readonly chunkId: string;
  readonly recordedAtMs: number;
  readonly text: string;
  readonly durationMs: number;
  readonly silent: boolean;
};

function toRecordedAtMs(recordedAt: string): number {
  const recordedAtMs = Date.parse(recordedAt);
  if (!Number.isFinite(recordedAtMs)) {
    throw new Error(`Invalid recordedAt timestamp: ${recordedAt}`);
  }
  return recordedAtMs;
}

function toIsoString(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function isSilentSample(
  text: string,
  pcmRms: number | undefined,
  threshold: number,
): boolean {
  if (text.trim().length === 0) {
    return true;
  }
  if (pcmRms !== undefined && Number.isFinite(pcmRms) && pcmRms < threshold) {
    return true;
  }
  return false;
}

function intervalFromSamples(samples: readonly BufferedSample[]): LiveAnswerWindowInterval {
  const texts = samples
    .map((s) => s.text.trim())
    .filter(Boolean);
  const merged = mergeConsecutiveAsrTexts(texts);
  const chunkIds = [...new Set(samples.map((s) => s.chunkId))];
  const startMs = samples[0]!.recordedAtMs;
  const last = samples[samples.length - 1]!;
  const endMs = last.recordedAtMs + last.durationMs;
  return {
    chunkIds,
    text: merged,
    windowStartedAt: toIsoString(startMs),
    windowEndedAt: toIsoString(endMs),
  };
}

/**
 * After a question, accumulates microphone ASR slices until either ~30s of wall time
 * or ~4s of consecutive silence (from RMS / empty transcript), then yields one window.
 */
export class LiveAnswerWindowBuffer {
  private readonly maxWindowMs: number;
  private readonly silenceBreakMs: number;
  private readonly silenceRmsThreshold: number;
  private readonly fallbackChunkDurationMs: number;

  private windowStartRecordedAtMs?: number;
  private consecutiveSilenceMs = 0;
  private readonly currentSamples: BufferedSample[] = [];

  constructor(options: LiveAnswerWindowBufferOptions = {}) {
    this.maxWindowMs = options.maxWindowMs ?? DEFAULT_MAX_WINDOW_MS;
    this.silenceBreakMs = options.silenceBreakMs ?? DEFAULT_SILENCE_BREAK_MS;
    this.silenceRmsThreshold =
      options.silenceRmsThreshold ?? DEFAULT_SILENCE_RMS_THRESHOLD;
    this.fallbackChunkDurationMs =
      options.fallbackChunkDurationMs ?? AUDIO_CHUNK_INTERVAL_MS;
  }

  reset(): void {
    this.windowStartRecordedAtMs = undefined;
    this.consecutiveSilenceMs = 0;
    this.currentSamples.length = 0;
  }

  append(sample: LiveAnswerWindowSample): {
    readonly readyWindows: readonly LiveAnswerWindowInterval[];
  } {
    const recordedAtMs = toRecordedAtMs(sample.recordedAt);
    const durationMs =
      sample.pcmDurationMs !== undefined &&
      Number.isFinite(sample.pcmDurationMs) &&
      sample.pcmDurationMs > 0
        ? sample.pcmDurationMs
        : this.fallbackChunkDurationMs;

    const silent = isSilentSample(
      sample.text,
      sample.pcmRms,
      this.silenceRmsThreshold,
    );

    const buffered: BufferedSample = {
      chunkId: sample.chunkId,
      recordedAtMs,
      text: sample.text,
      durationMs,
      silent,
    };

    if (this.windowStartRecordedAtMs === undefined) {
      this.windowStartRecordedAtMs = recordedAtMs;
    }

    this.currentSamples.push(buffered);

    if (silent) {
      this.consecutiveSilenceMs += durationMs;
    } else {
      this.consecutiveSilenceMs = 0;
    }

    const spanMs = recordedAtMs - this.windowStartRecordedAtMs;
    const hitMaxWindow = spanMs >= this.maxWindowMs;
    const hitSilenceBreak =
      this.consecutiveSilenceMs >= this.silenceBreakMs && this.currentSamples.length > 0;

    if (!hitMaxWindow && !hitSilenceBreak) {
      return { readyWindows: [] };
    }

    const ready = intervalFromSamples(this.currentSamples);
    this.windowStartRecordedAtMs = undefined;
    this.consecutiveSilenceMs = 0;
    this.currentSamples.length = 0;

    if (ready.text.length === 0 && !hitSilenceBreak) {
      return { readyWindows: [] };
    }

    if (ready.text.length === 0 && hitSilenceBreak) {
      return { readyWindows: [] };
    }

    return { readyWindows: [ready] };
  }

  flushAll(): readonly LiveAnswerWindowInterval[] {
    if (this.currentSamples.length === 0) {
      return [];
    }
    const ready = intervalFromSamples(this.currentSamples);
    this.windowStartRecordedAtMs = undefined;
    this.consecutiveSilenceMs = 0;
    this.currentSamples.length = 0;
    if (ready.text.length === 0) {
      return [];
    }
    return [ready];
  }
}
