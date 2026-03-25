import "./transformers-env";

import { pipeline, type ProgressInfo } from "@huggingface/transformers";

import {
  MODEL_MANIFEST,
  type ModelEntry,
} from "../../../shared/model-manifest";
import type {
  ModelInitProgressPayload,
  ModelInitStatusSnapshot,
  ModelStatus,
} from "../../../shared/model-init";

type PipelineInstance = Awaited<ReturnType<typeof pipeline>>;

type ProgressCallback = (payload: ModelInitProgressPayload) => void;

type ModelState = {
  status: ModelStatus;
  progress: number;
  error?: string;
};

const pipelineCache = new Map<string, Promise<PipelineInstance>>();
const modelStates = new Map<string, ModelState>();

let overallStatus: ModelInitStatusSnapshot["overall"] = "idle";

function ensureModelState(modelId: string): ModelState {
  let state = modelStates.get(modelId);
  if (!state) {
    state = { status: "pending", progress: 0 };
    modelStates.set(modelId, state);
  }
  return state;
}

function updateModelState(
  modelId: string,
  update: Partial<ModelState>,
  onProgress?: ProgressCallback,
): void {
  const state = ensureModelState(modelId);
  Object.assign(state, update);
  onProgress?.({
    modelId,
    status: state.status,
    progress: state.progress,
  });
}

async function initModel(
  entry: ModelEntry,
  onProgress?: ProgressCallback,
): Promise<PipelineInstance> {
  const existing = pipelineCache.get(entry.id);
  if (existing) return existing;

  updateModelState(entry.id, { status: "downloading", progress: 0 }, onProgress);

  const pipelinePromise = pipeline(entry.task, entry.id, {
    dtype: entry.dtype as "q8",
    progress_callback: (info: ProgressInfo) => {
      if (info.status === "progress") {
        const pct = Math.round(info.progress);
        updateModelState(entry.id, { progress: pct }, onProgress);
      }
    },
  });

  pipelineCache.set(entry.id, pipelinePromise);

  try {
    const result = await pipelinePromise;
    updateModelState(entry.id, { status: "ready", progress: 100 }, onProgress);
    return result;
  } catch (err) {
    pipelineCache.delete(entry.id);
    const message = err instanceof Error ? err.message : String(err);
    updateModelState(
      entry.id,
      { status: "error", error: message },
      onProgress,
    );
    throw err;
  }
}

export async function initAll(onProgress?: ProgressCallback): Promise<void> {
  overallStatus = "downloading";

  for (const entry of MODEL_MANIFEST) {
    ensureModelState(entry.id);
  }

  const results = await Promise.allSettled(
    MODEL_MANIFEST.map((entry) => initModel(entry, onProgress)),
  );

  const hasError = results.some((r) => r.status === "rejected");
  overallStatus = hasError ? "error" : "ready";
}

export function getStatus(): ModelInitStatusSnapshot {
  const models: Record<string, { status: ModelStatus; progress: number }> = {};
  for (const entry of MODEL_MANIFEST) {
    const state = modelStates.get(entry.id);
    models[entry.id] = state
      ? { status: state.status, progress: state.progress }
      : { status: "pending", progress: 0 };
  }
  return { overall: overallStatus, models };
}

export async function getPipeline(
  modelId: string,
): Promise<PipelineInstance> {
  const cached = pipelineCache.get(modelId);
  if (cached) return cached;

  const entry = MODEL_MANIFEST.find((m) => m.id === modelId);
  if (!entry) {
    throw new Error(`Model "${modelId}" is not in MODEL_MANIFEST`);
  }

  return initModel(entry);
}
