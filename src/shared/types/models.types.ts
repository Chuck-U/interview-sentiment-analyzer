import { z } from "zod";
import { AnthropicModelInfoSchema, type AnthropicModelInfo } from "./anthropic.types";
import { GoogleModelInfoSchema, type GoogleModelInfo } from "./gemini.types";
import { OpenAiModelInfoSchema, type OpenAiModelInfo } from "./openai.types";

export type ModelInfo = AnthropicModelInfo | OpenAiModelInfo | GoogleModelInfo | null;

export const modelInfoSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("anthropic"),
    data: AnthropicModelInfoSchema,
  }),
  z.object({
    type: z.literal("openai"),
    data: OpenAiModelInfoSchema,
  }),
  z.object({
    type: z.literal("gemini"),
    data: GoogleModelInfoSchema,
  }),
]);

export const OpenAiModelListResponseSchema = z.object({
  data: z.array(OpenAiModelInfoSchema.pick({ id: true })),
});

export const AnthropicModelListResponseSchema = z.object({
  data: z.array(AnthropicModelInfoSchema.pick({ id: true, display_name: true })),
});

export const GoogleModelListResponseSchema = z.object({
  models: z.array(GoogleModelInfoSchema.pick({ name: true, displayName: true })),
});

export type OpenAiModelListResponse = z.infer<typeof OpenAiModelListResponseSchema>;
export type AnthropicModelListResponse = z.infer<typeof AnthropicModelListResponseSchema>;
export type GoogleModelListResponse = z.infer<typeof GoogleModelListResponseSchema>;