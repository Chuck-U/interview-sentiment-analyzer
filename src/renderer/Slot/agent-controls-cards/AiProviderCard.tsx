import type { CSSProperties } from "react";
import { useEffect, useMemo } from "react";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  type AiProvider,
  type AiProviderConfig,
} from "@/shared/ai-provider";
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

const PROVIDER_LABELS = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
} satisfies Record<AiProvider, string>;

const API_KEY_PLACEHOLDERS = {
  openai: "sk-...",
  anthropic: "sk-ant-...",
  google: "AIza...",
} satisfies Record<AiProvider, string>;

const MODEL_PLACEHOLDERS = {
  openai: "Choose an OpenAI model",
  anthropic: "Choose an Anthropic model",
  google: "Choose a Google model",
} satisfies Record<AiProvider, string>;

const DEFAULT_MODEL_VALUE = "__provider-default__";

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

  return (

    <div className="flex flex-col gap-[24px]">
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
              {AI_PROVIDERS.map((provider) => (
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

      <div className=" px-4 h-px bg-yellow-contrast/30 mx-3" />

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
