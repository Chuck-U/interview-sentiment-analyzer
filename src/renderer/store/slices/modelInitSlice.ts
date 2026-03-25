import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type {
  ModelInitProgressPayload,
  ModelInitStatusSnapshot,
  ModelStatus,
} from "@/shared/model-init";

export type ModelInitSliceState = {
  readonly overall: ModelInitStatusSnapshot["overall"];
  readonly models: Readonly<
    Record<string, { readonly status: ModelStatus; readonly progress: number }>
  >;
  readonly errorMessage?: string;
};

const initialState: ModelInitSliceState = {
  overall: "idle",
  models: {},
};

export const startModelInit = createAsyncThunk(
  "modelInit/start",
  async (_, { dispatch, rejectWithValue }) => {
    const unsubProgress = window.electronApp.modelInit.onProgress(
      (payload: ModelInitProgressPayload) => {
        dispatch(modelInitSlice.actions.progressReceived(payload));
      },
    );

    const unsubReady = window.electronApp.modelInit.onReady(() => {
      dispatch(modelInitSlice.actions.allReady());
    });

    const unsubError = window.electronApp.modelInit.onError((message: string) => {
      dispatch(modelInitSlice.actions.initError(message));
    });

    try {
      await window.electronApp.modelInit.startInit();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return rejectWithValue(message);
    } finally {
      unsubProgress();
      unsubReady();
      unsubError();
    }
  },
);

const modelInitSlice = createSlice({
  name: "modelInit",
  initialState,
  reducers: {
    progressReceived(state, action: PayloadAction<ModelInitProgressPayload>) {
      const { modelId, status, progress } = action.payload;
      state.models = {
        ...state.models,
        [modelId]: { status, progress },
      };
      if (state.overall === "idle") {
        state.overall = "downloading";
      }
    },
    allReady(state) {
      state.overall = "ready";
    },
    initError(state, action: PayloadAction<string>) {
      state.overall = "error";
      state.errorMessage = action.payload;
    },
  },
  extraReducers(builder) {
    builder.addCase(startModelInit.pending, (state) => {
      state.overall = "downloading";
      state.errorMessage = undefined;
    });
    builder.addCase(startModelInit.rejected, (state, action) => {
      state.overall = "error";
      state.errorMessage =
        typeof action.payload === "string"
          ? action.payload
          : "Model initialization failed";
    });
  },
});

export const { progressReceived, allReady, initError } =
  modelInitSlice.actions;

export default modelInitSlice.reducer;
