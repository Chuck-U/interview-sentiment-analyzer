import { z } from "zod";

export const GoogleModelInfoSchema = z.object({
    name: z.string(),
    baseModelId: z.string(),
    version: z.string(),
    displayName: z.string(),
    description: z.string(),
    inputTokenLimit: z.number().positive(),
    outputTokenLimit: z.number().positive(),
    supportedGenerationMethods: z.array(z.string()),
    thinking: z.boolean(),
    temperature: z.number(),
    maxTemperature: z.number(),
    topP: z.number(),
    topK: z.number(),
});

export type GoogleModelInfo = z.infer<typeof GoogleModelInfoSchema>;
