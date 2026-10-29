// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { jsonSchema, stepCountIs, streamText, type ToolSet } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildModelMessages } from "#webui/chat/sdk/build-model-messages";
import { resetOpenRouterReasoningCache } from "#webui/chat/sdk/provider/openrouter-reasoning";
import { createProviderModel } from "#webui/chat/sdk/provider/provider-factories";
import { buildProviderOptions } from "#webui/chat/sdk/provider/provider-options";
import { reasoningReplayFor } from "#webui/chat/sdk/reasoning-replay";
import { handleStreamPart } from "#webui/chat/sdk/streaming/stream-part-handlers";
import { type ChatMessage } from "#webui/chat/sdk/types";

// Real option builders, message builder, OpenRouter provider and request
// rewrite; only `fetch` is stubbed. Checks which earlier reasoning reaches the
// wire body, and that a replayed step matches what the SDK sent within a turn.

const SONNET = "anthropic/claude-sonnet-5.5";
const HAIKU = "anthropic/claude-haiku-5.5";
const GPT = "openai/gpt-6.1-terra";
const DETAIL = {
  type: "reasoning.text",
  text: "pondering",
  format: "anthropic-claude-v1",
  signature: "sig-1",
  index: 0,
};
const LIST = {
  data: [
    { id: SONNET, reasoning: { mandatory: true } },
    { id: HAIKU, reasoning: { mandatory: false } },
    { id: GPT, reasoning: { mandatory: false } },
  ],
};

const toolStep = (details: unknown[] | null): ChatMessage => ({
  role: "assistant",
  content: "",
  ...(details ? { reasoning: "pondering" } : {}),
  ...(details ? { openrouterReasoningDetails: details as never } : {}),
  responseModel: SONNET,
  toolCalls: [{ id: "tc1", name: "ppal-connect", args: {} }],
  toolResults: [
    { id: "tc1", name: "ppal-connect", args: {}, result: "ok", isError: false },
  ],
});
const HISTORY: ChatMessage[] = [
  { role: "user", content: "Connect" },
  toolStep([DETAIL]),
  { role: "assistant", content: "Connected", responseModel: SONNET },
  { role: "user", content: "Next" },
];

type WireMessage = {
  role: string;
  reasoning?: string;
  reasoning_details?: Array<Record<string, unknown>>;
};

/**
 * Stub fetch: serve the model list, record request bodies, and answer chat
 * requests with the given replies in order (then a 500).
 * @param replies - SSE bodies for successive chat requests
 * @returns The recorded chat request bodies
 */
function stubFetch(replies: string[] = []): Array<{ messages: WireMessage[] }> {
  const bodies: Array<{ messages: WireMessage[] }> = [];

  vi.stubGlobal(
    "fetch",
    vi.fn((url: unknown, init?: RequestInit) => {
      if (url === "https://openrouter.ai/api/v1/models") {
        return Promise.resolve(Response.json(LIST));
      }

      bodies.push(JSON.parse(init?.body as string) as never);

      const reply = replies[bodies.length - 1];

      return Promise.resolve(
        reply == null
          ? new Response("{}", { status: 500 })
          : new Response(reply, {
              headers: { "content-type": "text/event-stream" },
            }),
      );
    }),
  );

  return bodies;
}

/**
 * Send `history` through the real SDK as the chat client would.
 * @param history - Chat history to convert
 * @param model - Request model
 * @param level - UI thinking level
 * @returns The messages array of the OpenRouter request body
 */
async function wireMessages(
  history: ChatMessage[],
  model: string,
  level: string,
): Promise<WireMessage[]> {
  const bodies = stubFetch();
  const providerOptions = buildProviderOptions("openrouter", level, model);
  const result = streamText({
    model: createProviderModel("openrouter", model, "test-key"),
    maxRetries: 0,
    messages: buildModelMessages(
      history,
      reasoningReplayFor(providerOptions, model),
    ),
    providerOptions,
    onError: () => {},
  });

  for await (const part of result.stream) {
    void part;
  }

  return bodies[0]?.messages ?? [];
}

const assistants = (messages: WireMessage[]): WireMessage[] =>
  messages.filter((m) => m.role === "assistant");

describe("OpenRouter reasoning re-sent on the wire", () => {
  beforeEach(() => {
    resetOpenRouterReasoningCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["Default", "Max"])(
    "sends the signed details on the earlier step at %s",
    async (level) => {
      const sent = assistants(await wireMessages(HISTORY, SONNET, level));

      expect(sent[0]!.reasoning).toBe("pondering");
      expect(sent[0]!.reasoning_details).toStrictEqual([DETAIL]);
      expect(sent[1]!.reasoning_details).toBeUndefined();
    },
  );

  it("still sends them at Off on a model that can't turn reasoning off", async () => {
    const sent = assistants(await wireMessages(HISTORY, SONNET, "Off"));

    expect(sent[0]!.reasoning_details).toStrictEqual([DETAIL]);
  });

  it("sends nothing at Off on a Claude model that can turn reasoning off", async () => {
    const history = HISTORY.map((m) =>
      m.role === "assistant" ? { ...m, responseModel: HAIKU } : m,
    );
    const sent = assistants(await wireMessages(history, HAIKU, "Off"));

    expect(sent.map((m) => [m.reasoning, m.reasoning_details])).toStrictEqual([
      [undefined, undefined],
      [undefined, undefined],
    ]);
  });

  it.each([
    ["a non-Claude model", GPT],
    ["a different Claude model", HAIKU],
  ])("sends nothing after a switch to %s", async (_name, model) => {
    const sent = assistants(await wireMessages(HISTORY, model, "Default"));

    expect(sent.map((m) => m.reasoning_details)).toStrictEqual([
      undefined,
      undefined,
    ]);
  });

  it("sends details only for the steps that have them", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Connect" },
      toolStep(null),
      { role: "assistant", content: "Plain", responseModel: SONNET },
      { role: "user", content: "More" },
      toolStep([DETAIL]),
      { role: "assistant", content: "Done", responseModel: SONNET },
      { role: "user", content: "Next" },
    ];
    const sent = assistants(await wireMessages(history, SONNET, "Default"));

    expect(sent.map((m) => m.reasoning_details)).toStrictEqual([
      undefined,
      undefined,
      [DETAIL],
      undefined,
    ]);
  });
});

describe("a replayed step matches the one the SDK sent within the turn", () => {
  beforeEach(() => {
    resetOpenRouterReasoningCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sse = (...chunks: unknown[]): string =>
    chunks
      .map((c) => `data: ${JSON.stringify(c)}\n\n`)
      .join("")
      .concat("data: [DONE]\n\n");
  const chunk = (delta: unknown, finish: string | null = null): unknown => ({
    id: "gen-1",
    object: "chat.completion.chunk",
    created: 1,
    model: SONNET,
    provider: "Anthropic",
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  const TOOL_STEP = sse(
    chunk({
      role: "assistant",
      content: "",
      reasoning: "pond",
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "pond",
          format: "anthropic-claude-v1",
          index: 0,
        },
      ],
    }),
    chunk({
      reasoning: "ering",
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "ering",
          signature: "sig-1",
          format: "anthropic-claude-v1",
          index: 0,
        },
      ],
    }),
    chunk({
      tool_calls: [
        {
          index: 0,
          id: "tc1",
          type: "function",
          function: { name: "ppal-connect", arguments: "{}" },
        },
      ],
    }),
    chunk({}, "tool_calls"),
  );
  const ANSWER_STEP = sse(
    chunk({ role: "assistant", content: "Connected" }),
    chunk({}, "stop"),
  );
  const tools: ToolSet = {
    "ppal-connect": {
      description: "Connect",
      inputSchema: jsonSchema({ type: "object", properties: {} }),
      execute: () => Promise.resolve("ok"),
    },
  };

  it("sends the same assistant message the SDK built for the second step", async () => {
    const bodies = stubFetch([TOOL_STEP, ANSWER_STEP, ANSWER_STEP]);
    const providerOptions = buildProviderOptions(
      "openrouter",
      "Default",
      SONNET,
    );
    const model = createProviderModel("openrouter", SONNET, "test-key");
    const first = streamText({
      model,
      maxRetries: 0,
      messages: [{ role: "user", content: "Connect" }],
      tools,
      stopWhen: stepCountIs(2),
      providerOptions,
    });
    const step: ChatMessage = { role: "assistant", content: "" };

    for await (const part of first.stream) {
      if (part.type === "finish-step") {
        break;
      }

      handleStreamPart(part.type, part as never, step);
    }

    // Drain the rest so the SDK's own second request is recorded.
    for await (const part of first.stream) {
      void part;
    }

    step.responseModel = SONNET;
    expect(step.openrouterReasoningDetails).toBeDefined();

    // The same step, replayed from history on the next turn.
    const replay = streamText({
      model,
      maxRetries: 0,
      messages: buildModelMessages(
        [
          { role: "user", content: "Connect" },
          step,
          { role: "user", content: "Next" },
        ],
        reasoningReplayFor(providerOptions, SONNET),
      ),
      tools,
      providerOptions,
    });

    for await (const part of replay.stream) {
      void part;
    }

    const inTurn = assistants(bodies[1]!.messages)[0]!;
    const replayed = assistants(bodies[2]!.messages)[0]!;

    expect(inTurn.reasoning_details).toBeDefined();
    expect(replayed).toStrictEqual(inTurn);
  });
});
