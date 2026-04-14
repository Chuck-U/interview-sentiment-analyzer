import { z } from "zod";

export const OPENROUTER_RELEVANCE_CHANNELS = {
  getConfig: "openrouter-relevance:get-config",
  saveConfig: "openrouter-relevance:save-config",
} as const;

export type OpenRouterRelevanceConfig = {
  /** OpenRouter model id (e.g. `openai/gpt-4o-mini`) for live answer relevance. */
  readonly modelId?: string;
};

export const DEFAULT_OPEN_ROUTER_RELEVANCE_CONFIG: OpenRouterRelevanceConfig = {};

export const openRouterRelevanceConfigSchema = z.object({
  modelId: z.string().trim().min(1).optional(),
});

export function normalizeOpenRouterRelevanceConfig(
  input: unknown,
): OpenRouterRelevanceConfig {
  return openRouterRelevanceConfigSchema.parse(
    input === null || input === undefined ? {} : input,
  );
}

export type OpenRouterRelevanceBridge = {
  getConfig(): Promise<OpenRouterRelevanceConfig>;
  saveConfig(config: OpenRouterRelevanceConfig): Promise<OpenRouterRelevanceConfig>;
};
