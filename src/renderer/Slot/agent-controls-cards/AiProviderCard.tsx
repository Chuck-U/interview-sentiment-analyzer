import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  RiEyeLine,
  RiEyeOffLine,
  RiRefreshLine,
  RiSaveLine,
} from "@remixicon/react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AI_PROVIDERS,
  type AiModelSnapshot,
  type AiProvider,
  type AiProviderConfig,
} from "@/shared/ai-provider";
import type { OpenRouterRelevanceConfig } from "@/shared/openrouter-relevance";
import { useAppDispatch, useAppSelector } from "@/renderer/store/hooks";
import {
  fetchAiProviderModels,
  loadAiProviderState,
  persistAiProviderApiKey,
  persistAiProviderModel,
  persistAiProviderSelection,
  syncAiProviderKeyStatus,
  setDraftApiKey,
  toggleApiKeyVisibility,
} from "@/renderer/store/slices/aiProviderSlice";

/** Chat / model provider list; OpenRouter is configured in its own section above. */
const CHAT_AI_PROVIDERS = AI_PROVIDERS.filter(
  (p): p is Exclude<AiProvider, "openrouter"> => p !== "openrouter",
);

const PROVIDER_LABELS = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  openrouter: "OpenRouter",
} satisfies Record<AiProvider, string>;

const API_KEY_PLACEHOLDERS = {
  openai: "sk-...",
  anthropic: "sk-ant-...",
  google: "AIza...",
  openrouter: "...",
} satisfies Record<AiProvider, string>;

const MODEL_PLACEHOLDERS = {
  openai: "Choose an OpenAI model",
  anthropic: "Choose an Anthropic model",
  google: "Choose a Google model",
  openrouter: "Choose an OpenRouter model",
} satisfies Record<AiProvider, string>;

const DEFAULT_MODEL_VALUE = "__provider-default__";

/** Sentinel for “use scorer default” in saved OpenRouter relevance config. */
const OPENROUTER_RELEVANCE_DEFAULT_MODEL_VALUE = "__openrouter-relevance-default__";

function getErrorMessage(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "message" in error
    && typeof error.message === "string"
    && error.message.trim().length > 0
  ) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "An unexpected error occurred.";
}

export function AiProviderCard() {
  const dispatch = useAppDispatch();
  const {
    config,
    draftApiKey,
    isApiKeyVisible,
    hasStoredKey,
    models,
    hasLoaded,
    isLoading,
    isSavingProvider,
    isSavingModel,
    isSavingApiKey,
    isRefreshingProviderData,
  } = useAppSelector((state) => state.aiProvider);
  const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;
  const selectedProvider = config.provider;
  const selectedProviderLabel = PROVIDER_LABELS[selectedProvider];

  const [openRouterDraftKey, setOpenRouterDraftKey] = useState("");
  const [openRouterKeyVisible, setOpenRouterKeyVisible] = useState(false);
  const [openRouterHasStoredKey, setOpenRouterHasStoredKey] = useState(false);
  const [openRouterStatusLoading, setOpenRouterStatusLoading] = useState(true);
  const [isSavingOpenRouterKey, setIsSavingOpenRouterKey] = useState(false);
  const [isRemovingOpenRouterKey, setIsRemovingOpenRouterKey] = useState(false);
  const [openRouterRelevanceConfig, setOpenRouterRelevanceConfig] = useState<
    OpenRouterRelevanceConfig
  >({});
  const [openRouterModels, setOpenRouterModels] = useState<readonly AiModelSnapshot[]>([]);
  const [isRefreshingOpenRouterModels, setIsRefreshingOpenRouterModels] = useState(false);
  const [isSavingOpenRouterRelevanceModel, setIsSavingOpenRouterRelevanceModel] = useState(false);

  const refreshOpenRouterKeyStatus = useCallback(async () => {
    setOpenRouterStatusLoading(true);
    try {
      const status = await window.electronApp.openRouterKey.getKeyStatus();
      setOpenRouterHasStoredKey(status.hasKey);
    } catch (error: unknown) {
      toast.error(`Unable to read OpenRouter key status. ${getErrorMessage(error)}`);
    } finally {
      setOpenRouterStatusLoading(false);
    }
  }, []);

  const loadOpenRouterRelevanceConfig = useCallback(async () => {
    try {
      const cfg = await window.electronApp.openRouterRelevance.getConfig();
      setOpenRouterRelevanceConfig(cfg);
    } catch (error: unknown) {
      toast.error(`Unable to load OpenRouter relevance settings. ${getErrorMessage(error)}`);
    }
  }, []);

  const selectedModelValue = config.modelId ?? DEFAULT_MODEL_VALUE;
  const hasSavedModelOutsideResults = useMemo(
    () =>
      config.modelId !== undefined
      && !models.some((model) => model.id === config.modelId),
    [config.modelId, models],
  );

  useEffect(() => {
    if (hasLoaded || isLoading) {
      return;
    }

    void dispatch(loadAiProviderState())
      .unwrap()
      .catch((error: unknown) => {
        toast.error(
          `Unable to load the AI provider configuration. ${getErrorMessage(error)}`,
        );
      });
  }, [dispatch, hasLoaded, isLoading]);

  useEffect(() => {
    void refreshOpenRouterKeyStatus();
  }, [refreshOpenRouterKeyStatus]);

  useEffect(() => {
    void loadOpenRouterRelevanceConfig();
  }, [loadOpenRouterRelevanceConfig]);

  useEffect(() => {
    if (!openRouterHasStoredKey) {
      setOpenRouterModels([]);
    }
  }, [openRouterHasStoredKey]);

  const openRouterRelevanceModelSelectValue =
    openRouterRelevanceConfig.modelId ?? OPENROUTER_RELEVANCE_DEFAULT_MODEL_VALUE;
  const hasSavedOpenRouterModelOutsideResults = useMemo(
    () =>
      openRouterRelevanceConfig.modelId !== undefined
      && !openRouterModels.some((m) => m.id === openRouterRelevanceConfig.modelId),
    [openRouterRelevanceConfig.modelId, openRouterModels],
  );

  useEffect(() => {
    if (!hasLoaded || isSavingProvider) {
      return;
    }
    if (config.provider !== "openrouter") {
      return;
    }
    void dispatch(persistAiProviderSelection("openai"))
      .unwrap()
      .then(() => dispatch(syncAiProviderKeyStatus("openai")).unwrap())
      .catch((error: unknown) => {
        toast.error(
          `Could not move primary provider off OpenRouter. ${getErrorMessage(error)}`,
        );
      });
  }, [dispatch, hasLoaded, isSavingProvider, config.provider]);

  async function handleProviderChange(nextProvider: AiProvider) {
    if (nextProvider === selectedProvider) {
      return;
    }

    try {
      await dispatch(persistAiProviderSelection(nextProvider)).unwrap();
      await dispatch(syncAiProviderKeyStatus(nextProvider)).unwrap();
    } catch (error) {
      toast.error(`Unable to save the AI provider. ${getErrorMessage(error)}`);
    }
  }

  async function handleModelChange(nextModelValue: string) {
    const nextConfig: AiProviderConfig = {
      provider: selectedProvider,
      modelId:
        nextModelValue === DEFAULT_MODEL_VALUE ? undefined : nextModelValue,
    };

    try {

      const savedConfig = await dispatch(
        persistAiProviderModel(nextConfig),
      ).unwrap();

      toast.success(
        savedConfig.modelId
          ? `Saved ${savedConfig.modelId} for ${selectedProviderLabel}.`
          : `Using ${selectedProviderLabel}'s default model.`,
      );
    } catch (error) {
      toast.error(`Unable to save the selected model. ${getErrorMessage(error)}`);
    }
  }

  async function handleSaveApiKey() {
    const normalizedKey = draftApiKey.trim();

    if (normalizedKey.length === 0) {
      toast.error("Enter an API key before saving.");
      return;
    }

    try {
      await dispatch(
        persistAiProviderApiKey({
          provider: selectedProvider,
          key: normalizedKey,
        }),
      ).unwrap();
      toast.success(`${selectedProviderLabel} API key saved.`);
    } catch (error) {
      toast.error(`Unable to save the API key. ${getErrorMessage(error)}`);
    }
  }

  function handleRefreshModels() {
    if (!hasStoredKey) {
      toast.error(`Save a ${selectedProviderLabel} API key before loading models.`);
      return;
    }

    void dispatch(fetchAiProviderModels(selectedProvider))
      .unwrap()
      .catch((error: unknown) => {
        toast.error(`Unable to load ${selectedProviderLabel} models. ${getErrorMessage(error)}`);
      });
  }

  async function fetchOpenRouterModels() {
    if (!openRouterHasStoredKey) {
      toast.error("Save an OpenRouter API key before loading models.");
      return;
    }

    setIsRefreshingOpenRouterModels(true);
    try {
      const list = await window.electronApp.aiProvider.listModels("openrouter");
      setOpenRouterModels(list);
    } catch (error: unknown) {
      toast.error(`Unable to load OpenRouter models. ${getErrorMessage(error)}`);
    } finally {
      setIsRefreshingOpenRouterModels(false);
    }
  }

  async function handleOpenRouterRelevanceModelChange(nextValue: string) {
    const modelId =
      nextValue === OPENROUTER_RELEVANCE_DEFAULT_MODEL_VALUE ? undefined : nextValue;

    setIsSavingOpenRouterRelevanceModel(true);
    try {
      await window.electronApp.openRouterRelevance.saveConfig({ modelId });
      const next = await window.electronApp.openRouterRelevance.getConfig();
      setOpenRouterRelevanceConfig(next);
      toast.success(
        modelId
          ? `Saved OpenRouter model ${modelId} for live answer relevance.`
          : "Using built-in default model for live answer relevance.",
      );
    } catch (error: unknown) {
      toast.error(`Unable to save OpenRouter model. ${getErrorMessage(error)}`);
    } finally {
      setIsSavingOpenRouterRelevanceModel(false);
    }
  }

  async function handleSaveOpenRouterKey() {
    const normalizedKey = openRouterDraftKey.trim();
    if (normalizedKey.length === 0) {
      toast.error("Enter an OpenRouter API key before saving.");
      return;
    }

    setIsSavingOpenRouterKey(true);
    try {
      await window.electronApp.openRouterKey.setKey(normalizedKey);
      setOpenRouterDraftKey("");
      await refreshOpenRouterKeyStatus();
      await loadOpenRouterRelevanceConfig();
      toast.success("OpenRouter API key saved.");
    } catch (error: unknown) {
      toast.error(`Unable to save the OpenRouter key. ${getErrorMessage(error)}`);
    } finally {
      setIsSavingOpenRouterKey(false);
    }
  }

  async function handleRemoveOpenRouterKey() {
    setIsRemovingOpenRouterKey(true);
    try {
      await window.electronApp.openRouterKey.deleteKey();
      setOpenRouterDraftKey("");
      await refreshOpenRouterKeyStatus();
      await loadOpenRouterRelevanceConfig();
      toast.success("OpenRouter API key removed.");
    } catch (error: unknown) {
      toast.error(`Unable to remove the OpenRouter key. ${getErrorMessage(error)}`);
    } finally {
      setIsRemovingOpenRouterKey(false);
    }
  }

  return (

    <div className="flex flex-col gap-[24px]" style={noDragStyle}>
      <div className="flex flex-col gap-3 rounded-md border gap-y-4 p-4 bg-ring/10 my-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-row items-center justify-between">
            <h3 className="text-sm font-semibold leading-none">OpenRouter</h3>
            <Badge variant={openRouterHasStoredKey ? "default" : "destructive"} className="text-md  leading-7">
              {openRouterHasStoredKey ? "Saved" : "Required"}
            </Badge></div>
          <span className="text-[10px] text-muted-foreground">
            API key for live answer relevance while recording. This is separate from the chat
            provider and model below.
          </span>
        </div>

        <div className="flex flex-col gap-4">

          <div className="flex flex-col gap-2" style={noDragStyle}>
            <InputGroup>
              <InputGroupInput
                id="openrouter-api-key"
                type={openRouterKeyVisible ? "text" : "password"}
                value={openRouterDraftKey}
                placeholder={API_KEY_PLACEHOLDERS.openrouter}
                onChange={(event) => {
                  setOpenRouterDraftKey(event.target.value);
                }}
                disabled={isSavingOpenRouterKey || isRemovingOpenRouterKey}
                aria-label="OpenRouter API key"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label={openRouterKeyVisible ? "Hide OpenRouter API key" : "Show OpenRouter API key"}
                  onClick={() => {
                    setOpenRouterKeyVisible((v) => !v);
                  }}
                  className={cn(
                    "size-6",
                    openRouterKeyVisible ? "text-yellow-indicator" : "text-foreground",
                  )}
                >
                  {openRouterKeyVisible ? (
                    <RiEyeOffLine data-icon="inline-end" />
                  ) : (
                    <RiEyeLine data-icon="inline-end" />
                  )}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {openRouterHasStoredKey ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      isSavingOpenRouterKey
                      || isRemovingOpenRouterKey
                      || openRouterStatusLoading
                    }
                    onClick={() => {
                      void handleRemoveOpenRouterKey();
                    }}
                  >
                    Remove key
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    isSavingOpenRouterKey
                    || isRemovingOpenRouterKey
                    || openRouterDraftKey.trim().length === 0
                  }
                  onClick={() => {
                    void handleSaveOpenRouterKey();
                  }}
                >
                  <RiSaveLine data-icon="inline-start" />
                  Save key
                </Button>
              </div>
            </div>
          </div>

          <div className="border-t border-yellow-contrast/20 pt-4">
            <div className="flex items-center justify-between gap-3" style={noDragStyle}>
              <Label htmlFor="openrouter-relevance-model-select">Live scoring model</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={
                  !openRouterHasStoredKey
                  || isRefreshingOpenRouterModels
                  || openRouterStatusLoading
                }
                onClick={() => {
                  void fetchOpenRouterModels();
                }}
              >
                <RiRefreshLine data-icon="inline-start" />
                Refresh
              </Button>
            </div>

            {isRefreshingOpenRouterModels ? (
              <Skeleton className="mt-2 h-8 w-full rounded-md" />
            ) : (
              <div className="mt-2" style={noDragStyle}>
                <Select
                  value={openRouterRelevanceModelSelectValue}
                  onValueChange={(value) => {
                    void handleOpenRouterRelevanceModelChange(value);
                  }}
                  disabled={
                    !openRouterHasStoredKey
                    || isSavingOpenRouterRelevanceModel
                    || openRouterStatusLoading
                  }
                >
                  <SelectTrigger
                    id="openrouter-relevance-model-select"
                    className="w-full border border-yellow-a9/30 border-2"
                  >
                    <SelectValue
                      placeholder={
                        openRouterHasStoredKey
                          ? MODEL_PLACEHOLDERS.openrouter
                          : "Save an OpenRouter key to choose a model"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={OPENROUTER_RELEVANCE_DEFAULT_MODEL_VALUE}>
                        Built-in default
                      </SelectItem>
                      {hasSavedOpenRouterModelOutsideResults && openRouterRelevanceConfig.modelId ? (
                        <SelectItem value={openRouterRelevanceConfig.modelId}>
                          {openRouterRelevanceConfig.modelId} (saved)
                        </SelectItem>
                      ) : null}
                      {openRouterModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}

            <span className="mt-2 block text-sm text-muted-foreground">
              {openRouterHasStoredKey
                ? openRouterModels.length > 0
                  ? `Loaded ${openRouterModels.length} OpenRouter models for live scoring.`
                  : "Refresh to load models from OpenRouter (uses the key above)."
                : "Save an OpenRouter API key to configure the live scoring model."}
            </span>
          </div>
        </div>
      </div>


      <div className="flex flex-col gap-3 rounded-md border gap-y-4 p-4 bg-ring/10 my-5">

        <Label htmlFor="ai-provider-select">Provider</Label>
        <Select
          value={selectedProvider}
          onValueChange={(value) => {
            void handleProviderChange(value as AiProvider);
          }}
          disabled={!hasLoaded || isSavingProvider}

        >
          <SelectTrigger id="ai-provider-select" className="w-full border border-yellow-a9/30 active:border-yellow-a9/50 border-2">
            <SelectValue placeholder="Choose a provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup className="from-yellow-11/30 to-yellow-11/20 bg-gradient-to-b">
              {CHAT_AI_PROVIDERS.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {PROVIDER_LABELS[provider]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-row items-center justify-start gap-1">
              <h3 className="text-sm font-medium text-nowrap leading-7">API key</h3>
            </div>
            <Badge variant={hasStoredKey ? "default" : "secondary"} className="text-md  leading-7">
              {hasStoredKey ? "Saved" : "Empty"}
            </Badge>
          </div>

          <div className="flex flex-col gap-2" style={noDragStyle}>
            <InputGroup>
              <InputGroupInput
                id="ai-provider-api-key"
                type={isApiKeyVisible ? "text" : "password"}
                value={draftApiKey}
                placeholder={API_KEY_PLACEHOLDERS[selectedProvider]}
                onChange={(event) => {
                  dispatch(setDraftApiKey(event.target.value));
                }}
                disabled={isSavingApiKey}
                aria-label={`${selectedProviderLabel} API key`}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label={isApiKeyVisible ? "Hide API key" : "Show API key"}
                  onClick={() => {
                    dispatch(toggleApiKeyVisibility());
                  }}
                  className={cn("size-6", isApiKeyVisible ? "text-yellow-indicator" : "text-foreground")}
                >
                  {isApiKeyVisible ? (
                    <RiEyeOffLine data-icon="inline-end" />
                  ) : (
                    <RiEyeLine data-icon="inline-end" />
                  )}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>

            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Enter a new key to replace the stored {selectedProviderLabel} credential.
              </p>
              <Button
                type="button"
                size="sm"
                disabled={isSavingApiKey || draftApiKey.trim().length === 0}
                onClick={() => {
                  void handleSaveApiKey();
                }}
              >
                <RiSaveLine data-icon="inline-start" />
                Save key
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 mx-2 border-t my-5">
        <div className="flex items-center justify-between gap-3" style={noDragStyle}>
          <Label htmlFor="ai-provider-model-select">Model</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasStoredKey || isRefreshingProviderData}
            onClick={handleRefreshModels}
          >
            <RiRefreshLine data-icon="inline-start" />
            Refresh
          </Button>
        </div>

        {isRefreshingProviderData ? (
          <Skeleton className="h-8 w-full rounded-md" />
        ) : (
          <div style={noDragStyle}>
            <Select
              value={selectedModelValue}
              onValueChange={(value) => {
                void handleModelChange(value);
              }}
              disabled={!hasStoredKey || isSavingModel}
            >
              <SelectTrigger id="ai-provider-model-select" className="w-full">
                <SelectValue
                  placeholder={
                    hasStoredKey
                      ? MODEL_PLACEHOLDERS[selectedProvider]
                      : "Save an API key to load models"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={DEFAULT_MODEL_VALUE}>
                    Provider default
                  </SelectItem>
                  {hasSavedModelOutsideResults && config.modelId ? (
                    <SelectItem value={config.modelId}>
                      {config.modelId} (saved)
                    </SelectItem>
                  ) : null}
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        )}

        <span className="text-sm text-muted-foreground">
          {hasStoredKey
            ? models.length > 0
              ? `Loaded ${models.length} ${selectedProviderLabel} models.`
              : `No models are loaded yet for ${selectedProviderLabel}.`
            : `Save a ${selectedProviderLabel} API key to fetch its models.`}
        </span>
      </div>
    </div>
  );
}
