import { z } from "zod";

export interface CapabilitySupport {
    supported: boolean;
}


export interface ContextManagementCapability {
    clear_thinking_20251015: CapabilitySupport;
    clear_tool_uses_20250919: CapabilitySupport;
    compact_20260112: CapabilitySupport;
    supported: boolean;
}


export interface AnthropicEffortCapability {
    high: CapabilitySupport;
    low: CapabilitySupport;
    max: CapabilitySupport;
    medium: CapabilitySupport;
    supported: boolean;
}


export interface AnthropicThinkingTypes {
    adaptive: CapabilitySupport;
    enabled: CapabilitySupport;
}


export interface ThinkingCapability {
    supported: boolean;
    types: AnthropicThinkingTypes;
}


export interface AnthropicModelCapabilities {
    batch: CapabilitySupport;
    citations: CapabilitySupport;
    code_execution: CapabilitySupport;
    context_management: ContextManagementCapability;
    effort: AnthropicEffortCapability;
    image_input: CapabilitySupport;
    pdf_input: CapabilitySupport;
    structured_outputs: CapabilitySupport;
    thinking: ThinkingCapability;
}





export const AnthropicModelCapabilitiesSchema = z.object({
    batch: z.object({ supported: z.boolean() }),
    citations: z.object({ supported: z.boolean() }),
    code_execution: z.object({ supported: z.boolean() }),
    context_management: z.object({
        clear_thinking_20251015: z.object({ supported: z.boolean() }),
        clear_tool_uses_20250919: z.object({ supported: z.boolean() }),
        compact_20260112: z.object({ supported: z.boolean() }),
        supported: z.boolean(),
    }),
    effort: z.object({
        high: z.object({ supported: z.boolean() }),
        low: z.object({ supported: z.boolean() }),
        max: z.object({ supported: z.boolean() }),
        medium: z.object({ supported: z.boolean() }),
        supported: z.boolean(),
    }),
    image_input: z.object({ supported: z.boolean() }),
    pdf_input: z.object({ supported: z.boolean() }),
    structured_outputs: z.object({ supported: z.boolean() }),
    thinking: z.object({
        supported: z.boolean(),
        types: z.object({
            adaptive: z.object({ supported: z.boolean() }),
            enabled: z.object({ supported: z.boolean() }),
        }),
    }),
});

export const AnthropicModelInfoSchema = z.object({
    id: z.string(),
    capabilities: AnthropicModelCapabilitiesSchema,
    created_at: z.coerce.date(),
    display_name: z.string(),
    max_input_tokens: z.number().positive(),
    max_tokens: z.number().positive(),
    type: z.literal("model"),
});

export type AnthropicModelInfo = z.infer<typeof AnthropicModelInfoSchema>;


export interface AnthropicListModelsResponse {
    data: AnthropicModelInfo[];
    first_id: string;
    has_more: boolean;
    last_id: string;
}

export interface AnthropicListModelsQueryParams {
    after_id?: string;
    before_id?: string;
    limit?: number; // Default: 20, valid range: 1..1000
}
