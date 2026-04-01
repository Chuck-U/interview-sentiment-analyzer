import { decoder as createWebmDecoder } from "@audio/webm-decode";

const TARGET_SAMPLE_RATE = 16_000;

/**
 * Feeds incremental WebM/Opus chunks through `@audio/webm-decode`'s streaming
 * decoder.  Because the decoder internally re-parses the full accumulated
 * buffer on every call (returning *all* decoded samples from the start), this
 * class tracks how many mono samples have already been emitted and slices off
 * only the new delta for each `decodeChunk` call.
 *
 * Output is mono PCM at 16 kHz — ready for Whisper without further conversion.
 */
export class AudioChunkAccumulator {
  private dec: Awaited<ReturnType<typeof createWebmDecoder>> | null = null;
  private initPromise: Promise<void> | null = null;
  private emittedSamples = 0;

  private async ensureDecoder(): Promise<void> {
    if (this.dec) return;

    if (!this.initPromise) {
      this.initPromise = createWebmDecoder().then((d) => {
        this.dec = d;
      });
    }
    await this.initPromise;
  }

  /**
   * Feed an encoded WebM chunk and get back only the *newly* decoded mono
   * PCM samples at 16 kHz.  Returns an empty array when the chunk produces
   * no new audio frames.
   */
  async decodeChunk(chunk: ArrayBuffer): Promise<Float32Array> {
    await this.ensureDecoder();

    const { channelData, sampleRate } = await this.dec!.decode(
      new Uint8Array(chunk),
    );

    if (!channelData || channelData.length === 0 || channelData[0].length === 0) {
      return new Float32Array(0);
    }

    const mono = mixToMono(channelData);
    const totalAvailable = mono.length;

    if (totalAvailable <= this.emittedSamples) {
      return new Float32Array(0);
    }

    const delta = mono.subarray(this.emittedSamples);
    this.emittedSamples = totalAvailable;

    const resampled = sampleRate !== TARGET_SAMPLE_RATE
      ? resampleLinear(delta, sampleRate, TARGET_SAMPLE_RATE)
      : delta;

    return resampled;
  }

  /** Flush any remaining buffered data from the decoder. */
  async flush(): Promise<Float32Array> {
    if (!this.dec) return new Float32Array(0);

    const { channelData, sampleRate } = await this.dec.flush();

    if (!channelData || channelData.length === 0 || channelData[0].length === 0) {
      return new Float32Array(0);
    }

    const mono = mixToMono(channelData);
    const totalAvailable = mono.length;

    if (totalAvailable <= this.emittedSamples) {
      return new Float32Array(0);
    }

    const delta = mono.subarray(this.emittedSamples);
    this.emittedSamples = totalAvailable;

    return sampleRate !== TARGET_SAMPLE_RATE
      ? resampleLinear(delta, sampleRate, TARGET_SAMPLE_RATE)
      : delta;
  }

  /** Release the WASM decoder and reset internal state. */
  reset(): void {
    if (this.dec) {
      try {
        this.dec.free();
      } catch {
        /* decoder may already be freed */
      }
    }
    this.dec = null;
    this.initPromise = null;
    this.emittedSamples = 0;
  }
}

function mixToMono(channelData: Float32Array[]): Float32Array {
  if (channelData.length === 1) return channelData[0];

  const length = channelData[0].length;
  const mono = new Float32Array(length);
  const scale = 1 / channelData.length;

  for (let ch = 0; ch < channelData.length; ch++) {
    const src = channelData[ch];
    for (let i = 0; i < length; i++) {
      mono[i] += src[i];
    }
  }

  for (let i = 0; i < length; i++) {
    mono[i] *= scale;
  }

  return mono;
}

/**
 * Linear-interpolation resampler.  Good enough for speech downsampling
 * (48 kHz → 16 kHz) where Whisper is the consumer.
 */
function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const outputLength = Math.ceil(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const lo = Math.floor(srcIndex);
    const hi = Math.min(lo + 1, input.length - 1);
    const frac = srcIndex - lo;
    output[i] = input[lo] * (1 - frac) + input[hi] * frac;
  }

  return output;
}
