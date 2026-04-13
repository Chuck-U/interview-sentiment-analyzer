import { z } from "zod";

/** OpenAI-compatible tool name for on-topic judgment (OpenRouter). */
export const REPORT_ANSWER_TOPIC_TOOL_NAME = "report_answer_topic" as const;

/**
 * Structured tool output: whether the answer addresses the question and
 * verbatim off-topic excerpts from the **answer transcript** (not raw audio).
 */
export const answerTopicToolResultSchema = z.object({
  onTopic: z.boolean(),
  offTopicPoints: z.array(z.string()),
});

export type AnswerTopicToolResult = z.infer<typeof answerTopicToolResultSchema>;

/** JSON Schema for `tools[].function.parameters` (hand-authored; mirrors Zod). */
export const ANSWER_TOPIC_TOOL_PARAMETERS_JSON_SCHEMA = {
  type: "object",
  properties: {
    onTopic: { type: "boolean" },
    offTopicPoints: {
      type: "array",
      items: { type: "string" },
      description:
        "Verbatim quotes copied from the candidate answer transcript only.",
    },
  },
  required: ["onTopic", "offTopicPoints"],
} as const;
