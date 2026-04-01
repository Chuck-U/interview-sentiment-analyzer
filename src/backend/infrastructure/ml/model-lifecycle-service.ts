import "./transformers-env";

import { pipeline, type ProgressInfo } from "@huggingface/transformers";

import { log } from "../../../lib/logger";
import {
  MODEL_MANIFEST,
  type ModelEntry,
} from "../../../shared/model-manifest";
import type {
  ModelInitProgressPayload,
  ModelInitStatusSnapshot,
  ModelStatus,
} from "../../../shared/model-init";

/**
 * Opaque pipeline handle. Do not use `Awaited<ReturnType<typeof pipeline>>` here:
 * transformers' `pipeline` overloads produce a union that exceeds TS's representation limit.
 */
type PipelineInstance = unknown;

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

function summarizeProgressInfo(info: ProgressInfo): Record<string, unknown> {
  const base: Record<string, unknown> = {
    status: info.status,
  };
  if ("progress" in info && typeof info.progress === "number") {
    base.progress = Math.round(info.progress);
  }
  if ("file" in info && info.file !== undefined) {
    base.file = info.file;
  }
  if ("name" in info && info.name !== undefined) {
    base.name = info.name;
  }
  return base;
}

async function initModel(
  entry: ModelEntry,
  onProgress?: ProgressCallback,
): Promise<PipelineInstance> {
  const existing = pipelineCache.get(entry.id);
  if (existing) {
    log.ger({
      type: "info",
      message: "Pipeline promise reused (already loading or built)",
      data: { modelId: entry.id, task: entry.task },
    });
    return existing;
  }

  log.ger({
    type: "info",
    message: "Starting model pipeline load (download if missing, then cache under userData)",
    data: {
      modelId: entry.id,
      task: entry.task,
      dtype: entry.dtype,
    },
  });

  updateModelState(entry.id, { status: "downloading", progress: 0 }, onProgress);

  const pipelinePromise = pipeline(entry.task, entry.id, {
    dtype: entry.dtype as "q8",
    progress_callback: (info: ProgressInfo) => {
      if (info.status === "progress") {
        const pct = Math.round(info.progress);
        updateModelState(entry.id, { progress: pct }, onProgress);
      } else {
        log.ger({
          type: "info",
          message: "Transformers load / cache activity",
          data: { modelId: entry.id, ...summarizeProgressInfo(info) },
        });
      }
    },
  });

  pipelineCache.set(entry.id, pipelinePromise);

  try {
    const result = await pipelinePromise;
    updateModelState(entry.id, { status: "ready", progress: 100 }, onProgress);
    log.ger({
      type: "info",
      message: "Model pipeline ready (ONNX loaded; artifacts on disk cache when applicable)",
      data: { modelId: entry.id, task: entry.task },
    });
    return result;
  } catch (err) {
    pipelineCache.delete(entry.id);
    const message = err instanceof Error ? err.message : String(err);
    updateModelState(
      entry.id,
      { status: "error", error: message },
      onProgress,
    );
    log.ger({
      type: "error",
      message: "Model pipeline failed",
      data: { modelId: entry.id, task: entry.task, error: message },
    });
    throw err;
  }
}

export async function initAll(onProgress?: ProgressCallback): Promise<void> {
  overallStatus = "downloading";

  log.ger({
    type: "info",
    message: "initAll: loading manifest models",
    data: { count: MODEL_MANIFEST.length, modelIds: MODEL_MANIFEST.map((e) => e.id) },
  });

  for (const entry of MODEL_MANIFEST) {
    ensureModelState(entry.id);
  }

  const results = await Promise.allSettled(
    MODEL_MANIFEST.map((entry) => initModel(entry, onProgress)),
  );

  const hasError = results.some((r) => r.status === "rejected");
  overallStatus = hasError ? "error" : "ready";

  const failures: { readonly modelId: string | undefined; readonly reason: string }[] =
    [];
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    if (r?.status === "rejected") {
      failures.push({
        modelId: MODEL_MANIFEST[i]?.id,
        reason: String(r.reason),
      });
    }
  }

  log.ger({
    type: hasError ? "warn" : "info",
    message: hasError
      ? "initAll finished with one or more model load failures"
      : "initAll finished; all manifest pipelines ready",
    data: {
      overallStatus,
      failureCount: failures.length,
      failures,
    },
  });
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
  if (cached) {
    return cached;
  }

  const entry = MODEL_MANIFEST.find((m) => m.id === modelId);
  if (!entry) {
    throw new Error(`Model "${modelId}" is not in MODEL_MANIFEST`);
  }

  return initModel(entry);
}
