export const TRANSFORMERS_PIPELINE_TASKS = [
  "automatic-speech-recognition",
  "audio-classification",
  "feature-extraction",
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
  | "question-detection"
  | "answer-relevance"
  | "topic-tracking"
  | "rambling-detection"
  | "engagement-detection";

export type ModelRuntime = "pipeline" | "low-level-api";

export type ModelSupportStatus = "ready" | "experimental";

export type ModelEvaluationRating = "strong" | "moderate" | "weak";

export type ModelEvaluationDimension = {
  readonly rating: ModelEvaluationRating;
  readonly summary: string;
};

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
  readonly approxRepositorySizeMb: number | null;
  readonly expectedLatencyPerChunk: string;
  readonly evaluation: {
    readonly latency: ModelEvaluationDimension;
    readonly memory: ModelEvaluationDimension;
    readonly transcriptQuality: ModelEvaluationDimension;
    readonly compatibility: ModelEvaluationDimension;
  };
  readonly notes?: string;
};

export const DEFAULT_TRANSCRIPTION_MODEL_ID =
  "distil-whisper/distil-small.en";
// "onnx-community/whisper-base";

export const ASR_MODEL_CANDIDATE_IDS = [
  DEFAULT_TRANSCRIPTION_MODEL_ID,
  "onnx-community/cohere-transcribe-03-2026-ONNX",
  "onnx-community/ultravox-v0_5-llama-3_2-1b-ONNX",
] as const;

export type AsrModelCandidateId = (typeof ASR_MODEL_CANDIDATE_IDS)[number];

export const DEFAULT_ANSWER_RELEVANCE_MODEL_ID = "Xenova/bge-small-en-v1.5";

export const ANSWER_RELEVANCE_MODEL_CANDIDATE_IDS = [
  DEFAULT_ANSWER_RELEVANCE_MODEL_ID,
  "Xenova/bge-base-en-v1.5",
  "Xenova/all-MiniLM-L6-v2",
  "Supabase/gte-small",
] as const;

export type AnswerRelevanceModelCandidateId =
  (typeof ANSWER_RELEVANCE_MODEL_CANDIDATE_IDS)[number];

export const ASR_MODEL_EVALUATIONS = [
  {
    id: DEFAULT_TRANSCRIPTION_MODEL_ID,
    task: "automatic-speech-recognition",
    dtype: "q4",
    priority: "required",
    label: "Moonshine Base English transcription",
    capabilities: ["speech-to-text"],
    runtime: "pipeline",
    supportStatus: "ready",
    includedInManifest: true,
    approxRepositorySizeMb: 228,
    expectedLatencyPerChunk:
      "Roughly 0.2-0.5s per 10s audio chunk on a typical laptop CPU/WASM path.",
    evaluation: {
      latency: {
        rating: "strong",
        summary:
          "Fastest option of the three for the current 30s chunk / 5s stride pipeline.",
      },
      memory: {
        rating: "strong",
        summary:
          "Smallest repository and the lightest expected runtime footprint, making it the safest preload choice.",
      },
      transcriptQuality: {
        rating: "moderate",
        summary:
          "Reliable English verbatim transcripts, but less multilingual coverage than Cohere and weaker on harder accents.",
      },
      compatibility: {
        rating: "strong",
        summary:
          "Best fit for the existing `transcribeAudio` pipeline because it already returns transcript text plus timestamps through `pipeline()`.",
      },
    },
    notes:
      "Hugging Face MCP reports Moonshine as a transformers.js automatic-speech-recognition pipeline backed by the `moonshine` architecture.",
  },
  {
    id: "onnx-community/cohere-transcribe-03-2026-ONNX",
    task: "automatic-speech-recognition",
    dtype: "q8",
    priority: "optional",
    label: "Cohere Transcribe multilingual transcription",
    capabilities: ["speech-to-text"],
    runtime: "pipeline",
    supportStatus: "experimental",
    includedInManifest: false,
    approxRepositorySizeMb: null,
    expectedLatencyPerChunk:
      "Cohere reports up to 3x faster real-time factor than similarly sized dedicated ASR models, but the 2B multilingual stack is still a heavier live candidate than Moonshine.",
    evaluation: {
      latency: {
        rating: "moderate",
        summary:
          "Likely acceptable for chunked offline transcription, but less comfortable than Moonshine for low-latency live feedback.",
      },
      memory: {
        rating: "weak",
        summary:
          "The model card describes a 2B parameter ASR stack, so startup and runtime memory pressure should be treated as materially higher than Moonshine until measured locally.",
      },
      transcriptQuality: {
        rating: "strong",
        summary:
          "Best transcript-quality candidate when multilingual accuracy matters; the Hub metadata lists broad language coverage.",
      },
      compatibility: {
        rating: "moderate",
        summary:
          "Still a `pipeline()` ASR model, but the model card explicitly calls out missing timestamps, so it cannot fully satisfy the current segment-aware contract yet.",
      },
    },
    notes:
      "Hugging Face MCP reports Cohere Transcribe as a transformers.js automatic-speech-recognition pipeline backed by the `cohere_asr` architecture. The model card describes it as a 2B multilingual ASR model with 14 languages and no timestamp support.",
  },
  {
    id: "onnx-community/ultravox-v0_5-llama-3_2-1b-ONNX",
    task: "audio-text-to-text",
    dtype: "mixed q8/q4",
    priority: "optional",
    label: "Ultravox multimodal speech-to-text generation",
    capabilities: ["speech-to-text"],
    runtime: "low-level-api",
    supportStatus: "experimental",
    includedInManifest: false,
    approxRepositorySizeMb: null,
    expectedLatencyPerChunk:
      "Expected to be the slowest option because generation adds decoder and KV-cache cost beyond plain ASR decoding.",
    evaluation: {
      latency: {
        rating: "weak",
        summary:
          "Token generation and decoder caching make it a poor fit for the app's current low-latency rolling ASR loop.",
      },
      memory: {
        rating: "weak",
        summary:
          "The usage example loads multiple submodels with mixed q8/q4 dtypes, which is a poor fit for the Electron main-process memory budget compared with plain ASR pipelines.",
      },
      transcriptQuality: {
        rating: "weak",
        summary:
          "Not ideal for verbatim transcript quality because the model is optimized for generated responses rather than faithful transcript spans.",
      },
      compatibility: {
        rating: "weak",
        summary:
          "Lowest compatibility of the three because it uses the `audio-text-to-text` task and would require a processor + generate path instead of the current ASR pipeline contract.",
      },
    },
    notes:
      "Hugging Face MCP reports Ultravox as a transformers.js `audio-text-to-text` model backed by the `ultravox` architecture. Its model card uses `UltravoxProcessor` + `UltravoxModel.generate()` with mixed q8/q4 dtypes, so it should be treated as a research candidate rather than a drop-in ASR replacement.",
  },
] satisfies readonly ModelMatrixEntry[];

export const ANSWER_RELEVANCE_MODEL_EVALUATIONS = [
  {
    id: DEFAULT_ANSWER_RELEVANCE_MODEL_ID,
    task: "feature-extraction",
    dtype: "q8",
    priority: "required",
    label: "BGE Small answer relevance embeddings",
    capabilities: ["answer-relevance", "topic-tracking", "rambling-detection"],
    runtime: "pipeline",
    supportStatus: "ready",
    includedInManifest: true,
    approxRepositorySizeMb: null,
    expectedLatencyPerChunk:
      "Designed for short text embedding lookups, making it a safer low-latency live relevance default than pairwise rerankers.",
    evaluation: {
      latency: {
        rating: "strong",
        summary:
          "Hugging Face MCP lists this as a transformers.js `feature-extraction` BERT model, which is a better fit for frequent live similarity checks than heavier rerankers.",
      },
      memory: {
        rating: "strong",
        summary:
          "Smaller than the base BGE and reranker alternatives, keeping the local-first live path more practical in Electron.",
      },
      transcriptQuality: {
        rating: "moderate",
        summary:
          "Not an ASR model; transcript quality is neutral because it consumes interviewer and candidate text after transcription.",
      },
      compatibility: {
        rating: "strong",
        summary:
          "The Hub metadata reports `transformers.js` + `feature-extraction`, so it fits the existing `getPipeline()` loader with only a manifest and scorer seam update.",
      },
    },
    notes:
      "Hugging Face MCP reports `Xenova/bge-small-en-v1.5` as a transformers.js ONNX feature-extraction model with BERT architecture, making it the best low-latency local default for semantic answer relevance in this app.",
  },
  {
    id: "Xenova/bge-base-en-v1.5",
    task: "feature-extraction",
    dtype: "q8",
    priority: "optional",
    label: "BGE Base higher-quality relevance embeddings",
    capabilities: ["answer-relevance", "topic-tracking"],
    runtime: "pipeline",
    supportStatus: "ready",
    includedInManifest: false,
    approxRepositorySizeMb: null,
    expectedLatencyPerChunk:
      "Higher-quality semantic similarity candidate when the small model proves too weak, at a higher local runtime cost.",
    evaluation: {
      latency: {
        rating: "moderate",
        summary:
          "Still pipeline-compatible, but the base model should cost more than the small default on CPU/WASM.",
      },
      memory: {
        rating: "moderate",
        summary:
          "Bigger than the small default, so it should stay behind a seam until the latency budget is measured locally.",
      },
      transcriptQuality: {
        rating: "moderate",
        summary:
          "Neutral for transcript quality because it operates on already-transcribed text.",
      },
      compatibility: {
        rating: "strong",
        summary:
          "Hugging Face MCP reports the same transformers.js feature-extraction compatibility as the small model, so it is an easy local upgrade path.",
      },
    },
    notes:
      "Treat as the quality-first local fallback when `bge-small` under-scores partially relevant answers.",
  },
  {
    id: "Xenova/all-MiniLM-L6-v2",
    task: "feature-extraction",
    dtype: "q8",
    priority: "optional",
    label: "MiniLM lightweight semantic similarity fallback",
    capabilities: ["answer-relevance", "topic-tracking"],
    runtime: "pipeline",
    supportStatus: "ready",
    includedInManifest: false,
    approxRepositorySizeMb: null,
    expectedLatencyPerChunk:
      "Common lightweight embedding fallback when experimentation speed matters more than top relevance quality.",
    evaluation: {
      latency: {
        rating: "strong",
        summary:
          "Widely used for fast embeddings and still compatible with the feature-extraction pipeline path.",
      },
      memory: {
        rating: "strong",
        summary:
          "A pragmatic fallback when the BGE family proves too heavy or slow for some environments.",
      },
      transcriptQuality: {
        rating: "moderate",
        summary:
          "Neutral for transcript quality because it scores text, not raw audio.",
      },
      compatibility: {
        rating: "strong",
        summary:
          "Hugging Face MCP reports transformers.js ONNX support, so it fits the same scorer seam with only a model-id swap.",
      },
    },
    notes:
      "Keep as a lower-cost fallback for development and calibration work.",
  },
  {
    id: "Supabase/gte-small",
    task: "feature-extraction",
    dtype: "q8",
    priority: "optional",
    label: "GTE Small embedding fallback",
    capabilities: ["answer-relevance", "topic-tracking"],
    runtime: "pipeline",
    supportStatus: "ready",
    includedInManifest: false,
    approxRepositorySizeMb: null,
    expectedLatencyPerChunk:
      "Another local embedding fallback when we want a well-used English semantic model behind the same scorer contract.",
    evaluation: {
      latency: {
        rating: "strong",
        summary:
          "The model is frequently used for embeddings and remains pipeline-compatible for low-latency local scoring.",
      },
      memory: {
        rating: "strong",
        summary:
          "A practical fallback size for Electron if the default or base BGE options misbehave on some hardware.",
      },
      transcriptQuality: {
        rating: "moderate",
        summary:
          "Neutral for transcript quality because it only consumes transcribed text.",
      },
      compatibility: {
        rating: "strong",
        summary:
          "Hugging Face MCP reports transformers.js ONNX feature-extraction compatibility and English support.",
      },
    },
    notes:
      "Keep as a reliable English-only fallback under the same embeddings seam.",
  },
] satisfies readonly ModelMatrixEntry[];

/**
 * Full evaluation matrix documenting every candidate model considered.
 *
 * `approxRepositorySizeMb` reflects the full HF Hub repository footprint when
 * it has been measured. Runtime downloads are smaller because transformers.js
 * only fetches the files needed for the selected dtype.
 */
export const MODEL_EVALUATION_MATRIX = [
  ...ASR_MODEL_EVALUATIONS,
  ...ANSWER_RELEVANCE_MODEL_EVALUATIONS,
  {
    id: "onnx-community/distilbert-base-uncased-mnli-ONNX",
    task: "zero-shot-classification",
    dtype: "q8",
    priority: "required",
    label: "DistilBERT MNLI question and topic classifier",
    capabilities: ["question-detection", "topic-tracking", "rambling-detection"],
    runtime: "pipeline",
    supportStatus: "ready",
    includedInManifest: true,
    approxRepositorySizeMb: 817,
    expectedLatencyPerChunk:
      "Roughly 0.1-0.4s per transcript chunk, increasing with candidate-label count.",
    evaluation: {
      latency: {
        rating: "strong",
        summary:
          "Fast enough for per-chunk zero-shot classification with a small label set.",
      },
      memory: {
        rating: "moderate",
        summary:
          "Reasonable for a required text model, but still much heavier than the Moonshine ASR path.",
      },
      transcriptQuality: {
        rating: "moderate",
        summary:
          "Not an ASR model; transcript quality is neutral because it consumes text generated by another model.",
      },
      compatibility: {
        rating: "strong",
        summary:
          "Already integrated and reused for question detection and related text assessments.",
      },
    },
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
    evaluation: {
      latency: {
        rating: "moderate",
        summary:
          "Fast enough for optional engagement-style scoring, but slower than the required text classifier.",
      },
      memory: {
        rating: "weak",
        summary:
          "Large enough that it should remain optional until product value clearly justifies the extra RAM use.",
      },
      transcriptQuality: {
        rating: "moderate",
        summary:
          "Not an ASR model; transcript quality is neutral because it operates on raw audio emotion classes.",
      },
      compatibility: {
        rating: "moderate",
        summary:
          "Technically loadable through `pipeline()`, but still experimental at the product level.",
      },
    },
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
    evaluation: {
      latency: {
        rating: "moderate",
        summary:
          "Reasonable candidate latency, but the diarization post-processing path adds extra overhead.",
      },
      memory: {
        rating: "strong",
        summary:
          "Repository size is relatively small compared with the ASR alternatives.",
      },
      transcriptQuality: {
        rating: "moderate",
        summary:
          "Not an ASR model; transcript quality is neutral because the value here is speaker boundary detection.",
      },
      compatibility: {
        rating: "weak",
        summary:
          "Still requires low-level APIs and post-processing, so it is not compatible with the current preload manifest.",
      },
    },
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
    id: DEFAULT_TRANSCRIPTION_MODEL_ID,
    task: "automatic-speech-recognition",
    dtype: "q8",
    priority: "required",
    label: "Moonshine Base English transcription",
  },
  {
    id: "onnx-community/distilbert-base-uncased-mnli-ONNX",
    task: "zero-shot-classification",
    dtype: "q8",
    priority: "required",
    label: "DistilBERT MNLI question and topic classifier",
  },
  {
    id: DEFAULT_ANSWER_RELEVANCE_MODEL_ID,
    task: "feature-extraction",
    dtype: "q8",
    priority: "required",
    label: "BGE Small answer relevance embeddings",
  },
  {
    id: "onnx-community/wav2vec2-base-Speech_Emotion_Recognition-ONNX",
    task: "audio-classification",
    dtype: "q8",
    priority: "optional",
    label: "Wav2Vec2 speech emotion proxy",
  },
] satisfies readonly ModelEntry[];
