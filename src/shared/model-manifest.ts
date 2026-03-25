export const TRANSFORMERS_PIPELINE_TASKS = [
  "automatic-speech-recognition",
  "audio-classification",
  "text-classification",
  "zero-shot-audio-classification",
  "zero-shot-classification",
] as const;

export type TransformersPipelineTask =
  (typeof TRANSFORMERS_PIPELINE_TASKS)[number];

export type ModelPriority = "required" | "optional";

export type ModelEntry = {
  readonly id: string;
  readonly task: TransformersPipelineTask;
  readonly dtype: string;
  readonly priority: ModelPriority;
  readonly label: string;
};

export type RealtimeAssessmentCapability =
  | "speech-to-text"
  | "speaker-diarization"
  | "topic-tracking"
  | "rambling-detection"
  | "engagement-detection";

export type ModelRuntime = "pipeline" | "low-level-api";

export type ModelSupportStatus = "ready" | "experimental";

export type ModelMatrixEntry = {
  readonly id: string;
  readonly task: string;
  readonly dtype: string;
  readonly priority: ModelPriority;
  readonly label: string;
  readonly capabilities: readonly RealtimeAssessmentCapability[];
  readonly runtime: ModelRuntime;
  readonly supportStatus: ModelSupportStatus;
  readonly includedInManifest: boolean;
  readonly approxRepositorySizeMb: number;
  readonly expectedLatencyPerChunk: string;
  readonly notes: string;
};

/**
 * Full evaluation matrix documenting every candidate model considered.
 *
 * `approxRepositorySizeMb` reflects the full HF Hub repository footprint.
 * Runtime downloads are smaller because transformers.js only fetches the
 * files needed for the selected dtype.
 */
export const MODEL_EVALUATION_MATRIX = [
  {
    id: "onnx-community/whisper-tiny.en",
    task: "automatic-speech-recognition",
    dtype: "q8",
    priority: "required",
    label: "Whisper tiny English transcription",
    capabilities: ["speech-to-text"],
    runtime: "pipeline",
    supportStatus: "ready",
    includedInManifest: true,
    approxRepositorySizeMb: 1251,
    expectedLatencyPerChunk:
      "Roughly 0.7-2.2s per 10s audio chunk on a typical laptop CPU/WASM path.",
    notes:
      "Best browser-supported ASR tradeoff in transformers.js today. English-only, but it keeps cold-start and per-chunk latency low enough for live transcript updates.",
  },
  {
    id: "onnx-community/distilbert-base-uncased-mnli-ONNX",
    task: "zero-shot-classification",
    dtype: "q8",
    priority: "required",
    label: "DistilBERT MNLI topic and rambling classifier",
    capabilities: ["topic-tracking", "rambling-detection"],
    runtime: "pipeline",
    supportStatus: "ready",
    includedInManifest: true,
    approxRepositorySizeMb: 817,
    expectedLatencyPerChunk:
      "Roughly 0.1-0.4s per transcript chunk, increasing with candidate-label count.",
    notes:
      "Most practical in-browser choice for topic tracking because the app can supply dynamic labels per interview rubric. The same model can score concise vs rambling/off-topic labels without introducing a second text model.",
  },
  {
    id: "onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX",
    task: "audio-classification",
    dtype: "q8",
    priority: "optional",
    label: "Wav2Vec2 speech emotion proxy",
    capabilities: ["engagement-detection"],
    runtime: "pipeline",
    supportStatus: "experimental",
    includedInManifest: true,
    approxRepositorySizeMb: 954,
    expectedLatencyPerChunk:
      "Roughly 0.25-0.9s per 5s audio chunk on CPU/WASM.",
    notes:
      "Useful as an optional engagement proxy, but it does not directly measure interviewer attention. Keep it optional and validate quality before exposing it as a product signal.",
  },
  {
    id: "onnx-community/pyannote-segmentation-3.0",
    task: "audio-frame-classification",
    dtype: "q8",
    priority: "optional",
    label: "Pyannote diarization segmentation",
    capabilities: ["speaker-diarization"],
    runtime: "low-level-api",
    supportStatus: "experimental",
    includedInManifest: false,
    approxRepositorySizeMb: 51,
    expectedLatencyPerChunk:
      "Roughly 0.4-1.5s per 5-10s audio chunk, plus diarization post-processing.",
    notes:
      "Promising for in-browser diarization, but transformers.js support is low-level only (AutoProcessor + AutoModel) rather than pipeline(). Leave it out of the preload manifest until the worker path supports non-pipeline models.",
  },
] satisfies readonly ModelMatrixEntry[];

/**
 * Recommended preload set. Limited to models loadable through
 * `pipeline(task, model, { dtype })` in the main process.
 */
export const MODEL_MANIFEST = [
  {
    id: "onnx-community/whisper-tiny.en",
    task: "automatic-speech-recognition",
    dtype: "q8",
    priority: "required",
    label: "Whisper tiny English transcription",
  },
  {
    id: "onnx-community/distilbert-base-uncased-mnli-ONNX",
    task: "zero-shot-classification",
    dtype: "q8",
    priority: "required",
    label: "DistilBERT MNLI topic and rambling classifier",
  },
  {
    id: "onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX",
    task: "audio-classification",
    dtype: "q8",
    priority: "optional",
    label: "Wav2Vec2 speech emotion proxy",
  },
] satisfies readonly ModelEntry[];
