export const MODEL_INIT_CHANNELS = {
  startInit: "model-init:start",
  getStatus: "model-init:get-status",
} as const;

export const MODEL_INIT_EVENT_CHANNELS = {
  progress: "model-init:progress",
  ready: "model-init:ready",
  error: "model-init:error",
} as const;

export type ModelStatus = "pending" | "downloading" | "ready" | "error";

export type ModelInitProgressPayload = {
  readonly modelId: string;
  readonly status: ModelStatus;
  readonly progress: number;
};

export type ModelInitStatusSnapshot = {
  readonly overall: "idle" | "downloading" | "ready" | "error";
  readonly models: Readonly<
    Record<string, { readonly status: ModelStatus; readonly progress: number }>
  >;
};

export type ModelInitBridge = {
  startInit(): Promise<void>;
  getStatus(): Promise<ModelInitStatusSnapshot>;
  onProgress(listener: (payload: ModelInitProgressPayload) => void): () => void;
  onReady(listener: () => void): () => void;
  onError(listener: (message: string) => void): () => void;
};
