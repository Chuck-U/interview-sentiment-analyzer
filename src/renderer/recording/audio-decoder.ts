function mergeToMono(audioBuffer: AudioBuffer): AudioBuffer {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer;
  }

  const { length, sampleRate } = audioBuffer;
  const monoBuffer = new AudioBuffer({
    length,
    numberOfChannels: 1,
    sampleRate,
  });
  const out = monoBuffer.getChannelData(0);
  const tmp = new Float32Array(length);
  for (let c = 0; c < audioBuffer.numberOfChannels; c += 1) {
    const channel = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) {
      tmp[i] += channel[i];
    }
  }
  const scale = 1 / audioBuffer.numberOfChannels;
  for (let i = 0; i < length; i += 1) {
    out[i] = tmp[i] * scale;
  }
  return monoBuffer;
}

/**
 * Decodes encoded audio (e.g. WebM/Opus) to mono PCM at the target sample rate (default 16 kHz).
 */
export async function decodeAudioToPcm(
  buffer: ArrayBuffer,
  targetSampleRate = 16_000,
): Promise<Float32Array> {
  const audioContext = new AudioContext();
  try {
    const decoded = await audioContext.decodeAudioData(buffer.slice(0));
    const mono = mergeToMono(decoded);
    const length = Math.ceil(mono.duration * targetSampleRate);
    const offline = new OfflineAudioContext(1, length, targetSampleRate);
    const source = offline.createBufferSource();
    source.buffer = mono;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    await audioContext.close();
  }
}
