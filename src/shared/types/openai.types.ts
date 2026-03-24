import { z } from "zod";


export const OpenAiModelInfoSchema = z.object({
    id: z.string(),
    created: z.coerce.date(),
    owned_by: z.string(),
    object: z.string(),
});

export type OpenAiModelInfo = z.infer<typeof OpenAiModelInfoSchema>;
