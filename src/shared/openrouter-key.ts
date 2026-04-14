import { z } from "zod";

export const OPENROUTER_KEY_CHANNELS = {
  getStatus: "openrouter-key:get-status",
  setKey: "openrouter-key:set",
  deleteKey: "openrouter-key:delete",
} as const;

export type OpenRouterKeyApiStatus = {
  readonly hasKey: boolean;
};

export type OpenRouterKeyBridge = {
  getKeyStatus(): Promise<OpenRouterKeyApiStatus>;
  setKey(key: string): Promise<void>;
  deleteKey(): Promise<void>;
};

export const setOpenRouterKeyRequestSchema = z.object({
  key: z.string().trim().min(1, "OpenRouter API key must be non-empty."),
});

export function normalizeSetOpenRouterKeyRequest(input: unknown): { readonly key: string } {
  return setOpenRouterKeyRequestSchema.parse(input);
}
