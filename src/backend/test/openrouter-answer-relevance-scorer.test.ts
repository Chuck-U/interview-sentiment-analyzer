import assert from "node:assert/strict";
import test from "node:test";

import { createOpenRouterAnswerRelevanceScorer } from "../infrastructure/openrouter/openrouter-answer-relevance-scorer";

function sseResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

test("OpenRouter scorer parses streamed tool call arguments", async () => {
  const toolArgs = JSON.stringify({
    onTopic: false,
    offTopicPoints: ["I mostly talked about movies."],
  });
  const deltaPayload = JSON.stringify({
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_test",
              function: {
                name: "report_answer_topic",
                arguments: toolArgs,
              },
            },
          ],
        },
      },
    ],
  });

  const fetchImpl = async (): Promise<Response> =>
    sseResponse([`data: ${deltaPayload}\n\n`, "data: [DONE]\n\n"]);

  const scorer = createOpenRouterAnswerRelevanceScorer({
    apiKey: "test-key",
    model: "mock/model",
    fetchImpl,
  });

  const result = await scorer({
    questionText: "Tell me about your last project.",
    answerWindowText: "I mostly talked about movies.",
  });

  assert.equal(result.onTopic, false);
  assert.deepEqual(result.offTopicPoints, ["I mostly talked about movies."]);
  assert.ok(result.relevanceScore < 0.5);
  assert.equal(result.scorer?.providerId, "openrouter");
});
