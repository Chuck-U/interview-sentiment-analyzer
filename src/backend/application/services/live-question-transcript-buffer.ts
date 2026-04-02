/**
 * Buffers short streaming ASR snippets per session/source so question detection
 * sees concatenated context instead of each fragment in isolation.
 */
const DEFAULT_MAX_SAMPLES = 5;

/** Combined text length (after join) to treat multi-fragment speech as "ready" without punctuation. */
const DEFAULT_MIN_COMBINED_CHARS_FOR_MULTI_SAMPLE = 36;

function trimJoin(samples: readonly string[]): string {
  return samples
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function endsWithSentenceBoundary(text: string): boolean {
  const t = text.trimEnd();
  if (t.length === 0) {
    return false;
  }
  return /[.!?…]["')\]]*$/u.test(t);
}

export type LiveQuestionTranscriptBufferOptions = {
  readonly maxSamples?: number;
  readonly minCombinedCharsForMultiSample?: number;
};

export class LiveQuestionTranscriptBuffer {
  private readonly maxSamples: number;
  private readonly minCombinedCharsForMultiSample: number;
  private readonly samples: string[] = [];

  constructor(options: LiveQuestionTranscriptBufferOptions = {}) {
    this.maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES;
    this.minCombinedCharsForMultiSample =
      options.minCombinedCharsForMultiSample ??
      DEFAULT_MIN_COMBINED_CHARS_FOR_MULTI_SAMPLE;
  }

  /** Append one ASR result; drops empty strings. Oldest samples roll off at maxSamples. */
  pushSample(text: string): void {
    const t = text.trim();
    if (t.length === 0) {
      return;
    }
    this.samples.push(t);
    while (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  getCombinedText(): string {
    return trimJoin(this.samples);
  }

  getSampleCount(): number {
    return this.samples.length;
  }

  /**
   * Whether to run the question classifier on {@link getCombinedText}.
   * True when: full sentence ending, collected max samples, or at least two
   * fragments with enough total characters (covers split questions with no punctuation).
   */
  shouldEvaluate(): boolean {
    const combined = this.getCombinedText();
    if (combined.length === 0) {
      return false;
    }
    if (endsWithSentenceBoundary(combined)) {
      return true;
    }
    if (this.samples.length >= this.maxSamples) {
      return true;
    }
    if (
      this.samples.length >= 2 &&
      combined.length >= this.minCombinedCharsForMultiSample
    ) {
      return true;
    }
    return false;
  }

  clear(): void {
    this.samples.length = 0;
  }
}
