import { log } from "../../../lib/logger";
import {
  ANSWER_TOPIC_TOOL_PARAMETERS_JSON_SCHEMA,
  answerTopicToolResultSchema,
  REPORT_ANSWER_TOPIC_TOOL_NAME,
} from "../../../shared/openrouter-answer-topic";
import type {
  AnswerRelevanceScorerDescriptor,
  ScoreAnswerRelevanceInput,
  ScoreAnswerRelevanceResult,
} from "../../application/use-cases/detect-live-answer-relevance";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Default: fast, tool-capable; override with OPENROUTER_MODEL. */
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

const MAX_TOOL_OUTPUT_TOKENS = 384;

const SYSTEM_PROMPT = `You judge whether a spoken interview answer stays on topic relative to the interviewer's question.

Rules:
- The user message contains the QUESTION (anchor) and the ANSWER (transcript). Base your judgment only on that text.
- Call the tool exactly once with your final judgment.
- offTopicPoints must be verbatim substrings copied from the ANSWER transcript (short phrases or sentences). Use an empty array when onTopic is true or when there are no clear off-topic excerpts.
- Small talk, unrelated anecdotes, or ignoring the question counts as off-topic.
- Partial relevance with some drift: set onTopic false if the answer largely does not address the question; if it substantially addresses it with minor tangents, onTopic may be true with optional brief offTopicPoints for the tangents.`;

export type OpenRouterAnswerUsage = {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly cachedTokens?: number;
};

export type CreateOpenRouterAnswerRelevanceScorerDependencies = {
  readonly apiKey: string;
  readonly model?: string;
  readonly fetchImpl?: typeof fetch;
};

type StreamChunk = {
  readonly choices?: ReadonlyArray<{
    readonly delta?: {
      readonly tool_calls?: ReadonlyArray<{
        readonly index?: number;
        readonly id?: string;
        readonly function?: { readonly name?: string; readonly arguments?: string };
      }>;
    };
    readonly finish_reason?: string | null;
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly prompt_tokens_details?: { readonly cached_tokens?: number };
  };
  readonly id?: string;
  readonly model?: string;
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function onTopicToRelevanceScore(onTopic: boolean): number {
  return onTopic ? 0.88 : 0.12;
}

function mergeToolCallArguments(
  parts: ReadonlyArray<{ readonly index: number; readonly id?: string; readonly arguments: string }>,
): { readonly id?: string; readonly arguments: string } | null {
  if (parts.length === 0) {
    return null;
  }
  const sorted = [...parts].sort((a, b) => a.index - b.index);
  return {
    id: sorted.find((p) => p.id)?.id,
    arguments: sorted.map((p) => p.arguments).join(""),
  };
}

function parseSseDataLines(body: string): string[] {
  const lines: string[] = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data:")) {
      const data = trimmed.slice(5).trim();
      if (data.length > 0 && data !== "[DONE]") {
        lines.push(data);
      }
    }
  }
  return lines;
}

async function streamOpenRouterToolCall(input: {
  readonly apiKey: string;
  readonly model: string;
  readonly userContent: string;
  readonly abortSignal?: AbortSignal;
  readonly fetchImpl: typeof fetch;
}): Promise<{
  readonly toolArgs: string;
  readonly usage?: OpenRouterAnswerUsage;
  readonly providerRequestId?: string;
  readonly modelId?: string;
}> {
  const body = {
    model: input.model,
    stream: true,
    max_tokens: MAX_TOOL_OUTPUT_TOKENS,
    stream_options: { include_usage: true },
    tools: [
      {
        type: "function",
        function: {
          name: REPORT_ANSWER_TOPIC_TOOL_NAME,
          description:
            "Report whether the answer is on topic and quote off-topic spans from the answer transcript.",
          parameters: ANSWER_TOPIC_TOOL_PARAMETERS_JSON_SCHEMA,
        },
      },
    ],
    tool_choice: {
      type: "function",
      function: { name: REPORT_ANSWER_TOPIC_TOOL_NAME },
    },
    messages: [
      {
        role: "system",
        content: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
      },
      {
        role: "user",
        content: input.userContent,
      },
    ],
  };

  const response = await input.fetchImpl(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/interview-sentiment-analyzer",
      "X-Title": "Interview Sentiment Analyzer",
    },
    body: JSON.stringify(body),
    signal: input.abortSignal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter HTTP ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`,
    );
  }

  if (!response.body) {
    throw new Error("OpenRouter response missing body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const toolCallParts = new Map<
    number,
    { readonly index: number; id?: string; arguments: string }
  >();
  let lastUsage: StreamChunk["usage"];
  let providerRequestId: string | undefined;
  let modelId: string | undefined;

  const processSseBlock = (block: string): void => {
    const jsonLines = parseSseDataLines(block);
    for (const jsonStr of jsonLines) {
      let parsed: StreamChunk;
      try {
        parsed = JSON.parse(jsonStr) as StreamChunk;
      } catch {
        continue;
      }
      if (parsed.id) {
        providerRequestId = parsed.id;
      }
      if (parsed.model) {
        modelId = parsed.model;
      }
      if (parsed.usage) {
        lastUsage = parsed.usage;
      }
      const delta = parsed.choices?.[0]?.delta;
      const toolCalls = delta?.tool_calls;
      if (!toolCalls) {
        continue;
      }
      for (const tc of toolCalls) {
        const index = typeof tc.index === "number" ? tc.index : 0;
        const prev = toolCallParts.get(index);
        const nextArgs = (prev?.arguments ?? "") + (tc.function?.arguments ?? "");
        toolCallParts.set(index, {
          index,
          id: tc.id ?? prev?.id,
          arguments: nextArgs,
        });
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      processSseBlock(block);
    }
    if (done) {
      if (buffer.trim().length > 0) {
        processSseBlock(buffer);
      }
      break;
    }
  }

  const merged = mergeToolCallArguments([...toolCallParts.values()]);
  if (!merged?.arguments) {
    throw new Error("OpenRouter stream ended without tool call arguments");
  }

  const usage: OpenRouterAnswerUsage | undefined = lastUsage
    ? {
        promptTokens: lastUsage.prompt_tokens,
        completionTokens: lastUsage.completion_tokens,
        cachedTokens: lastUsage.prompt_tokens_details?.cached_tokens,
      }
    : undefined;

  return {
    toolArgs: merged.arguments,
    usage,
    providerRequestId,
    modelId,
  };
}

export function createOpenRouterAnswerRelevanceScorer(
  dependencies: CreateOpenRouterAnswerRelevanceScorerDependencies,
): (input: ScoreAnswerRelevanceInput) => Promise<ScoreAnswerRelevanceResult> {
  const model = dependencies.model ?? DEFAULT_OPENROUTER_MODEL;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const scorer: AnswerRelevanceScorerDescriptor = {
    kind: "external-provider",
    providerId: "openrouter",
    modelId: model,
  };

  return async (input: ScoreAnswerRelevanceInput): Promise<ScoreAnswerRelevanceResult> => {
    const userContent = `QUESTION (anchor):\n${input.questionText.trim()}\n\nANSWER (transcript to judge):\n${input.answerWindowText.trim()}`;

    try {
      const { toolArgs, usage, providerRequestId, modelId } =
        await streamOpenRouterToolCall({
          apiKey: dependencies.apiKey,
          model,
          userContent,
          abortSignal: input.abortSignal,
          fetchImpl,
        });

      const rawJson: unknown = JSON.parse(toolArgs);
      const parsed = answerTopicToolResultSchema.safeParse(rawJson);
      if (!parsed.success) {
        log.ger({
          type: "warn",
          message: "[openrouter] answer topic tool parse failed",
          data: { issues: parsed.error.flatten() },
        });
        return {
          relevanceScore: 0.5,
          scorer,
        };
      }

      const { onTopic, offTopicPoints } = parsed.data;
      return {
        relevanceScore: clampScore(onTopicToRelevanceScore(onTopic)),
        scorer,
        onTopic,
        offTopicPoints: [...offTopicPoints],
        usage,
        modelId,
        providerRequestId,
      };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }
      log.ger({
        type: "warn",
        message: "[openrouter] answer relevance request failed",
        data: {
          error: err instanceof Error ? err.message : String(err),
        },
      });
      return {
        relevanceScore: 0.5,
        scorer,
      };
    }
  };
}
