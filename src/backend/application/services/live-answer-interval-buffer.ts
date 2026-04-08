import { mergeConsecutiveAsrTexts } from "../../guards/merge-asr-transcript-seams";

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_ALLOWED_LATENESS_INTERVALS = 1;

export type LiveAnswerIntervalBufferOptions = {
  readonly intervalMs?: number;
  readonly allowedLatenessIntervals?: number;
};

export type LiveAnswerIntervalSample = {
  readonly chunkId: string;
  readonly recordedAt: string;
  readonly text: string;
};

export type LiveAnswerInterval = {
  readonly chunkIds: readonly string[];
  readonly text: string;
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
};

type BufferedBucket = {
  readonly chunkIds: string[];
  readonly samples: Array<{
    readonly chunkId: string;
    readonly recordedAtMs: number;
    readonly text: string;
  }>;
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

function getBucketText(bucket: BufferedBucket): string {
  return mergeConsecutiveAsrTexts(
    bucket.samples.map((sample) => sample.text.trim()).filter(Boolean),
  );
}

export class LiveAnswerIntervalBuffer {
  private readonly intervalMs: number;

  private readonly allowedLatenessIntervals: number;

  private anchorRecordedAtMs?: number;

  private latestSeenBucketIndex = -1;

  private readonly buckets = new Map<number, BufferedBucket>();

  constructor(options: LiveAnswerIntervalBufferOptions = {}) {
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.allowedLatenessIntervals =
      options.allowedLatenessIntervals ?? DEFAULT_ALLOWED_LATENESS_INTERVALS;
  }

  reset(anchorRecordedAt?: string): void {
    this.anchorRecordedAtMs =
      anchorRecordedAt === undefined ? undefined : toRecordedAtMs(anchorRecordedAt);
    this.latestSeenBucketIndex = -1;
    this.buckets.clear();
  }

  append(sample: LiveAnswerIntervalSample): {
    readonly readyIntervals: readonly LiveAnswerInterval[];
  } {
    const text = sample.text.trim();

    if (text.length === 0) {
      return { readyIntervals: [] };
    }

    const recordedAtMs = toRecordedAtMs(sample.recordedAt);

    if (this.anchorRecordedAtMs === undefined) {
      this.anchorRecordedAtMs = recordedAtMs;
    }

    const anchorRecordedAtMs = this.anchorRecordedAtMs;
    const bucketIndex = Math.max(
      0,
      Math.floor((recordedAtMs - anchorRecordedAtMs) / this.intervalMs),
    );
    const existingBucket = this.buckets.get(bucketIndex) ?? {
      chunkIds: [],
      samples: [],
    };

    existingBucket.chunkIds.push(sample.chunkId);
    existingBucket.samples.push({
      chunkId: sample.chunkId,
      recordedAtMs,
      text,
    });
    existingBucket.samples.sort((left, right) => left.recordedAtMs - right.recordedAtMs);
    this.buckets.set(bucketIndex, existingBucket);
    this.latestSeenBucketIndex = Math.max(this.latestSeenBucketIndex, bucketIndex);

    return {
      readyIntervals: this.drainReadyIntervals(false),
    };
  }

  flushAll(): readonly LiveAnswerInterval[] {
    return this.drainReadyIntervals(true);
  }

  private drainReadyIntervals(flushAll: boolean): readonly LiveAnswerInterval[] {
    if (this.anchorRecordedAtMs === undefined) {
      return [];
    }

    const maxReadyBucketIndex = flushAll
      ? this.latestSeenBucketIndex
      : this.latestSeenBucketIndex - this.allowedLatenessIntervals - 1;
    const readyIntervals: LiveAnswerInterval[] = [];

    if (maxReadyBucketIndex < 0) {
      return readyIntervals;
    }

    for (const bucketIndex of [...this.buckets.keys()].sort((left, right) => left - right)) {
      if (bucketIndex > maxReadyBucketIndex) {
        continue;
      }

      const bucket = this.buckets.get(bucketIndex);

      if (!bucket) {
        continue;
      }

      const text = getBucketText(bucket);
      this.buckets.delete(bucketIndex);

      if (text.length === 0) {
        continue;
      }

      const windowStartedAtMs = this.anchorRecordedAtMs + bucketIndex * this.intervalMs;
      readyIntervals.push({
        chunkIds: [...bucket.chunkIds],
        text,
        windowStartedAt: toIsoString(windowStartedAtMs),
        windowEndedAt: toIsoString(windowStartedAtMs + this.intervalMs),
      });
    }

    return readyIntervals;
  }
}
