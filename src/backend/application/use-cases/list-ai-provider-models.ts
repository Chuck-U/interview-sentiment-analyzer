import type {
  AiModelSnapshot,
  AiProvider,
} from "../../../shared/ai-provider";
import {
  AnthropicModelListResponseSchema,
  GoogleModelListResponseSchema,
  OpenAiModelListResponseSchema,
} from "../../../shared/types/models.types";

export type ListAiProviderModelsRequest = {
  readonly provider: AiProvider;
  readonly apiKey: string;
};

export type ListAiProviderModelsDependencies = {
  readonly fetch: typeof fetch;
};

async function fetchJsonOrThrow(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetchFn(url, init);

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    const detail = responseText.trim();
    const suffix = detail ? `: ${detail}` : "";

    throw new Error(
      `AI provider request failed (${response.status} ${response.statusText})${suffix}`,
    );
  }

  return response.json() as Promise<unknown>;
}

function sortModelsByName(
  models: readonly AiModelSnapshot[],
): readonly AiModelSnapshot[] {
  return [...models].sort((left, right) => left.name.localeCompare(right.name));
}

async function listOpenAiModels(
  dependencies: ListAiProviderModelsDependencies,
  apiKey: string,
): Promise<readonly AiModelSnapshot[]> {
  const payload = await fetchJsonOrThrow(
    dependencies.fetch,
    "https://api.openai.com/v1/models",
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );
  const result = OpenAiModelListResponseSchema.parse(payload);

  return sortModelsByName(
    result.data.map((model) => ({
      id: model.id,
      name: model.id,
    })),
  );
}

async function listAnthropicModels(
  dependencies: ListAiProviderModelsDependencies,
  apiKey: string,
): Promise<readonly AiModelSnapshot[]> {
  const payload = await fetchJsonOrThrow(
    dependencies.fetch,
    "https://api.anthropic.com/v1/models",
    {
      headers: {
        "x-api-key": apiKey,
      },
    },
  );
  const result = AnthropicModelListResponseSchema.parse(payload);

  return sortModelsByName(
    result.data.map((model) => ({
      id: model.id,
      name: model.display_name ?? model.id,
    })),
  );
}

async function listGoogleModels(
  dependencies: ListAiProviderModelsDependencies,
  apiKey: string,
): Promise<readonly AiModelSnapshot[]> {
  const payload = await fetchJsonOrThrow(
    dependencies.fetch,
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    {},
  );
  const result = GoogleModelListResponseSchema.parse(payload);

  return sortModelsByName(
    result.models.map((model) => ({
      id: model.name,
      name: model.displayName ?? model.name,
    })),
  );
}

export function createListAiProviderModelsUseCase(
  dependencies: ListAiProviderModelsDependencies,
) {
  return async function listAiProviderModels(
    request: ListAiProviderModelsRequest,
  ): Promise<readonly AiModelSnapshot[]> {
    switch (request.provider) {
      case "openai":
        return listOpenAiModels(dependencies, request.apiKey);
      case "anthropic":
        return listAnthropicModels(dependencies, request.apiKey);
      case "google":
        return listGoogleModels(dependencies, request.apiKey);
      default: {
        const exhaustiveProvider: never = request.provider;
        throw new Error(
          `Unsupported AI provider: ${String(exhaustiveProvider)}`,
        );
      }
    }
  };
}
