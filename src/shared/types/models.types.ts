import { AnthropicModelInfo, AnthropicModelInfoSchema } from "./anthropic.types";
import { OpenAiModelInfo, OpenAiModelInfoSchema } from "./openai.types";
import { GoogleModelInfo, GoogleModelInfoSchema } from "./gemini.types";
import { z } from "zod";


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