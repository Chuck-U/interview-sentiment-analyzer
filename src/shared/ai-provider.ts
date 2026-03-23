import { z } from "zod";

export const AI_PROVIDERS = ["openai", "anthropic", "google"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

export type AiProviderConfig = {
  readonly provider: AiProvider;
  readonly modelId?: string;
};

export type AiModelSnapshot = {
  readonly id: string;
  readonly name: string;
};

export type AiProviderApiKeyStatus = {
  readonly hasKey: boolean;
};

export const DEFAULT_AI_PROVIDER_CONFIG: AiProviderConfig = {
  provider: "openai",
};

export const aiProviderConfigSchema = z.object({
  provider: z.enum(AI_PROVIDERS).default("openai"),
  modelId: z.string().trim().min(1).optional(),
});

const aiModelSnapshotSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

export const AI_PROVIDER_CHANNELS = {
  getConfig: "ai-provider:get-config",
  setConfig: "ai-provider:set-config",
  getApiKey: "ai-provider:get-api-key",
  setApiKey: "ai-provider:set-api-key",
  deleteApiKey: "ai-provider:delete-api-key",
  listModels: "ai-provider:list-models",
} as const;

export type AiProviderBridge = {
  getConfig(): Promise<AiProviderConfig>;
  setConfig(config: AiProviderConfig): Promise<AiProviderConfig>;
  getApiKeyStatus(provider: AiProvider): Promise<AiProviderApiKeyStatus>;
  setApiKey(provider: AiProvider, key: string): Promise<void>;
  deleteApiKey(provider: AiProvider): Promise<void>;
  listModels(provider: AiProvider): Promise<readonly AiModelSnapshot[]>;
};

export function normalizeAiProviderConfig(input: unknown): AiProviderConfig {
  return aiProviderConfigSchema.parse(input);
}

export function safeParseAiProviderConfig(
  input: unknown,
): ReturnType<typeof aiProviderConfigSchema.safeParse> {
  return aiProviderConfigSchema.safeParse(input);
}

export function normalizeAiProviderModels(
  input: unknown,
): readonly AiModelSnapshot[] {
  return z.array(aiModelSnapshotSchema).parse(input);
}
