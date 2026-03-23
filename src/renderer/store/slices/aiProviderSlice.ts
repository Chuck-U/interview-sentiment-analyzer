import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";

import {
  DEFAULT_AI_PROVIDER_CONFIG,
  type AiModelSnapshot,
  type AiProvider,
  type AiProviderConfig,
} from "@/shared/ai-provider";

type AiProviderState = {
  readonly config: AiProviderConfig;
  readonly draftApiKey: string;
  readonly isApiKeyVisible: boolean;
  readonly hasStoredKey: boolean;
  readonly models: readonly AiModelSnapshot[];
  readonly hasLoaded: boolean;
  readonly isLoading: boolean;
  readonly isSavingProvider: boolean;
  readonly isSavingModel: boolean;
  readonly isSavingApiKey: boolean;
  readonly isRefreshingProviderData: boolean;
  readonly errorMessage: string | null;
};

type ProviderDataSnapshot = {
  readonly provider: AiProvider;
  readonly hasStoredKey: boolean;
  readonly models: readonly AiModelSnapshot[];
};

type ProviderDataError = {
  readonly provider: AiProvider;
  readonly message: string;
};

function getErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
}

async function loadProviderData(
  provider: AiProvider,
): Promise<ProviderDataSnapshot> {
  const apiKeyStatus =
    await window.electronApp.aiProvider.getApiKeyStatus(provider);

  if (!apiKeyStatus.hasKey) {
    return {
      provider,
      hasStoredKey: false,
      models: [],
    };
  }

  const models = await window.electronApp.aiProvider.listModels(provider);

  return {
    provider,
    hasStoredKey: true,
    models,
  };
}

export const loadAiProviderState = createAsyncThunk<
  {
    readonly config: AiProviderConfig;
    readonly providerData: ProviderDataSnapshot;
  },
  void,
  { readonly rejectValue: string }
>(
  "aiProvider/load",
  async (_, { rejectWithValue }) => {
    try {
      const config = await window.electronApp.aiProvider.getConfig();
      const providerData = await loadProviderData(config.provider);

      return {
        config,
        providerData,
      };
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Unable to load the AI provider configuration."),
      );
    }
  },
);

export const refreshAiProviderData = createAsyncThunk<
  ProviderDataSnapshot,
  AiProvider,
  { readonly rejectValue: ProviderDataError }
>(
  "aiProvider/refreshProviderData",
  async (provider, { rejectWithValue }) => {
    try {
      return await loadProviderData(provider);
    } catch (error) {
      return rejectWithValue({
        provider,
        message: getErrorMessage(
          error,
          "Unable to load the AI provider models.",
        ),
      });
    }
  },
);

export const persistAiProviderSelection = createAsyncThunk<
  {
    readonly config: AiProviderConfig;
    readonly providerData: ProviderDataSnapshot;
  },
  AiProvider,
  { readonly rejectValue: string }
>(
  "aiProvider/persistProviderSelection",
  async (provider, { rejectWithValue }) => {
    try {
      const config = await window.electronApp.aiProvider.setConfig({
        provider,
      });
      const providerData = await loadProviderData(config.provider);

      return {
        config,
        providerData,
      };
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Unable to save the AI provider."),
      );
    }
  },
);

export const persistAiProviderModel = createAsyncThunk<
  AiProviderConfig,
  AiProviderConfig,
  { readonly rejectValue: string }
>(
  "aiProvider/persistModel",
  async (config, { rejectWithValue }) => {
    try {
      return await window.electronApp.aiProvider.setConfig(config);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Unable to save the selected model."),
      );
    }
  },
);

export const persistAiProviderApiKey = createAsyncThunk<
  ProviderDataSnapshot,
  {
    readonly provider: AiProvider;
    readonly key: string;
  },
  { readonly rejectValue: string }
>(
  "aiProvider/persistApiKey",
  async ({ provider, key }, { rejectWithValue }) => {
    try {
      await window.electronApp.aiProvider.setApiKey(provider, key);

      return await loadProviderData(provider);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, "Unable to save the API key."),
      );
    }
  },
);

const initialState: AiProviderState = {
  config: DEFAULT_AI_PROVIDER_CONFIG,
  draftApiKey: "",
  isApiKeyVisible: false,
  hasStoredKey: false,
  models: [],
  hasLoaded: false,
  isLoading: false,
  isSavingProvider: false,
  isSavingModel: false,
  isSavingApiKey: false,
  isRefreshingProviderData: false,
  errorMessage: null,
};

function applyProviderData(
  state: {
    config: AiProviderConfig;
    hasStoredKey: boolean;
    models: readonly AiModelSnapshot[];
  },
  providerData: ProviderDataSnapshot,
) {
  if (state.config.provider !== providerData.provider) {
    return;
  }

  state.hasStoredKey = providerData.hasStoredKey;
  state.models = [...providerData.models];
}

const aiProviderSlice = createSlice({
  name: "aiProvider",
  initialState,
  reducers: {
    setDraftApiKey(state, action: PayloadAction<string>) {
      state.draftApiKey = action.payload;
    },
    setApiKeyVisible(state, action: PayloadAction<boolean>) {
      state.isApiKeyVisible = action.payload;
    },
    toggleApiKeyVisibility(state) {
      state.isApiKeyVisible = !state.isApiKeyVisible;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(loadAiProviderState.pending, (state) => {
        state.isLoading = true;
        state.errorMessage = null;
      })
      .addCase(loadAiProviderState.fulfilled, (state, action) => {
        state.isLoading = false;
        state.hasLoaded = true;
        state.config = action.payload.config;
        state.hasStoredKey = action.payload.providerData.hasStoredKey;
        state.models = [...action.payload.providerData.models];
      })
      .addCase(loadAiProviderState.rejected, (state, action) => {
        state.isLoading = false;
        state.hasLoaded = true;
        state.errorMessage =
          action.payload ?? "Unable to load the AI provider configuration.";
      })
      .addCase(refreshAiProviderData.pending, (state) => {
        state.isRefreshingProviderData = true;
        state.errorMessage = null;
      })
      .addCase(refreshAiProviderData.fulfilled, (state, action) => {
        state.isRefreshingProviderData = false;
        applyProviderData(state, action.payload);
      })
      .addCase(refreshAiProviderData.rejected, (state, action) => {
        state.isRefreshingProviderData = false;

        if (action.payload) {
          if (state.config.provider === action.payload.provider) {
            state.hasStoredKey = false;
            state.models = [];
          }

          state.errorMessage = action.payload.message;
          return;
        }

        state.errorMessage = "Unable to load the AI provider models.";
      })
      .addCase(persistAiProviderSelection.pending, (state) => {
        state.isSavingProvider = true;
        state.errorMessage = null;
      })
      .addCase(persistAiProviderSelection.fulfilled, (state, action) => {
        state.isSavingProvider = false;
        state.config = action.payload.config;
        state.draftApiKey = "";
        state.isApiKeyVisible = false;
        state.hasStoredKey = action.payload.providerData.hasStoredKey;
        state.models = [...action.payload.providerData.models];
      })
      .addCase(persistAiProviderSelection.rejected, (state, action) => {
        state.isSavingProvider = false;
        state.errorMessage = action.payload ?? "Unable to save the AI provider.";
      })
      .addCase(persistAiProviderModel.pending, (state) => {
        state.isSavingModel = true;
        state.errorMessage = null;
      })
      .addCase(persistAiProviderModel.fulfilled, (state, action) => {
        state.isSavingModel = false;
        state.config = action.payload;
      })
      .addCase(persistAiProviderModel.rejected, (state, action) => {
        state.isSavingModel = false;
        state.errorMessage =
          action.payload ?? "Unable to save the selected model.";
      })
      .addCase(persistAiProviderApiKey.pending, (state) => {
        state.isSavingApiKey = true;
        state.errorMessage = null;
      })
      .addCase(persistAiProviderApiKey.fulfilled, (state, action) => {
        state.isSavingApiKey = false;
        state.draftApiKey = "";
        state.isApiKeyVisible = false;
        applyProviderData(state, action.payload);
      })
      .addCase(persistAiProviderApiKey.rejected, (state, action) => {
        state.isSavingApiKey = false;
        state.errorMessage = action.payload ?? "Unable to save the API key.";
      });
  },
});

export const {
  setDraftApiKey,
  setApiKeyVisible,
  toggleApiKeyVisibility,
} = aiProviderSlice.actions;

export default aiProviderSlice.reducer;
