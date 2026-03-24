/**
 * Shared @huggingface/transformers environment configuration.
 *
 * Import this module at the top of every worker that uses transformers.js
 * (model-init.worker.ts, inference.worker.ts) so they all share the same
 * cache and runtime settings.
 *
 * WASM Threading Strategy — single-threaded (default)
 * ─────────────────────────────────────────────────────
 * We default to single-threaded ONNX WASM for stability: no SharedArrayBuffer
 * requirement, no need for Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy
 * response headers, and no Vite dev-server header changes.
 *
 * To opt into multi-threaded mode later:
 *  1. Set `numThreads` below to the desired thread count (e.g. navigator.hardwareConcurrency).
 *  2. In electron/main/index.ts, uncomment the `onHeadersReceived` block that injects
 *     Cross-Origin-Opener-Policy: same-origin
 *     Cross-Origin-Embedder-Policy: require-corp
 *  3. In vite.config.ts, uncomment the `server.headers` block with the same two headers.
 *
 * Cache isolation
 * ───────────────
 * @huggingface/transformers v3 does not expose a `cacheKey` property on `env`.
 * Models are stored in the browser Cache API under their Hugging Face model IDs.
 * If explicit cache-bucket isolation is needed in the future, set
 * `env.useCustomCache = true` and supply a `customCache` that wraps
 * `caches.open('isa-models-v1')`.
 */

import { env } from "@huggingface/transformers";

env.allowRemoteModels = true;

env.useBrowserCache = true;

env.allowLocalModels = false;

if (!env.backends.onnx.wasm) {
  (env.backends.onnx as Record<string, unknown>).wasm = {};
}

const wasmEnv = env.backends.onnx.wasm as Record<string, unknown>;

wasmEnv.numThreads = 1;

wasmEnv.wasmPaths = "/";

export { env };
