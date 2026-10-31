// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as F from "./chat-completions-fixtures";
import {
  assistantTurns,
  collectSdkWarnings,
  expectFailedToolRun,
  expectHttpFailure,
  expectParallelCalls,
  expectStreamFailure,
  liveSetStep,
  restoreSdkWarnings,
  say,
  startChat,
  stubProviderFetch,
  toolLimitReachedAfter,
} from "./raw-stream-harness";

vi.mock(import("#webui/chat/sdk/mcp-tools"), async () => {
  const { fakeMcpTools } = await import("./fake-mcp-tools");

  return { createMcpTools: vi.fn(() => Promise.resolve(fakeMcpTools())) };
});

type Route = "lmstudio" | "custom" | "ollama";
type Wire = Array<Record<string, unknown>>;

// LM Studio and custom servers use @ai-sdk/openai-compatible, which reads the
// model's thinking. Ollama uses @ai-sdk/openai's chat model, which ignores it.
const USAGE = { inputTokens: 100, outputTokens: 50, reasoningTokens: 42 };

const THINKING_ROUTES: Route[] = ["lmstudio", "custom"];
const ALL_ROUTES: Route[] = [...THINKING_ROUTES, "ollama"];

const chat = (
  provider: Route,
  options: { maxSteps?: number } = {},
): ReturnType<typeof startChat> =>
  startChat({
    provider,
    model: F.LOCAL_MODEL,
    baseUrl: provider === "custom" ? "https://llm.example.test/v1" : undefined,
    ...options,
  });

/**
 * The `messages` of a recorded request body.
 * @param body - Request body
 * @returns The conversation the server was sent
 */
const messagesOf = (body: Record<string, unknown>): Wire =>
  body.messages as Wire;

beforeEach(() => {
  collectSdkWarnings();
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreSdkWarnings();
});

describe.each(THINKING_ROUTES)("%s stream to history", (route) => {
  it.each(["reasoning_content", "reasoning"])(
    "reads thinking from the `%s` field",
    async (field) => {
      stubProviderFetch([F.thinkingThenText(field)]);

      const turn = assistantTurns(await say(await chat(route), "Tempo?"))[0];

      expect(turn).toStrictEqual({
        role: "assistant",
        content: "The set runs at 120 BPM.",
        reasoning: "Checking the tempo.",
        reasoningParts: [{ text: "Checking the tempo." }],
        usage: USAGE,
        responseModel: F.LOCAL_MODEL,
      });
    },
  );

  it("sends the thinking back within the turn but not on the next one", async () => {
    const seen = stubProviderFetch([
      F.THINKING_THEN_CALL,
      F.ANSWER_AFTER_TOOL,
      F.ANSWER_AFTER_TOOL,
    ]);
    const client = await chat(route);

    await say(client, "Tracks?");
    await say(client, "Again");

    const within = messagesOf(seen[1]?.body ?? {})[1];
    const later = messagesOf(seen[2]?.body ?? {})[1];

    expect(within?.reasoning_content).toBe("Need the tracks.");
    expect(later).not.toHaveProperty("reasoning_content");
  });
});

describe("ollama stream to history", () => {
  it("shows no thinking: the chat model ignores the reasoning field", async () => {
    stubProviderFetch([F.thinkingThenText("reasoning")]);

    const turn = assistantTurns(await say(await chat("ollama"), "Tempo?"))[0];

    expect(turn?.content).toBe("The set runs at 120 BPM.");
    expect(turn).not.toHaveProperty("reasoning");
  });
});

describe.each(ALL_ROUTES)("%s chat completions stream to history", (route) => {
  it("stores text, usage and the response model", async () => {
    stubProviderFetch([F.ANSWER_AFTER_TOOL]);

    const turn = assistantTurns(await say(await chat(route), "Hi"))[0];

    expect(turn).toStrictEqual({
      role: "assistant",
      content: "Tempo is 120.",
      usage: USAGE,
      responseModel: F.LOCAL_MODEL,
    });
  });

  it("builds a call from streamed argument pieces and answers it in a second turn", async () => {
    stubProviderFetch([F.CALL, F.ANSWER_AFTER_TOOL]);

    const [step, answer, ...rest] = assistantTurns(
      await say(await chat(route), "Tracks?"),
    );

    expect(rest).toHaveLength(0);
    expect(step).toStrictEqual({
      role: "assistant",
      content: "",
      ...liveSetStep("call_1"),
      usage: USAGE,
      responseModel: F.LOCAL_MODEL,
    });
    expect(answer).toStrictEqual({
      role: "assistant",
      content: "Tempo is 120.",
      usage: USAGE,
      responseModel: F.LOCAL_MODEL,
    });
  });

  it("keeps parallel calls in one turn, each with its own result", async () => {
    stubProviderFetch([F.PARALLEL_CALLS, F.ANSWER_AFTER_TOOL]);

    expectParallelCalls(await say(await chat(route), "Both"));
  });

  it("records a failing tool as an error result and lets the model carry on", async () => {
    const seen = stubProviderFetch([F.FAILING_CALL, F.ANSWER_AFTER_TOOL]);

    const history = await say(await chat(route), "Edit");

    expectFailedToolRun(history);
    expect(JSON.stringify(messagesOf(seen[1]?.body ?? {}).at(-1))).toContain(
      "clip 7 not found",
    );
  });

  it("replays an earlier tool step as a call and its result, then the answer", async () => {
    const seen = stubProviderFetch([
      F.CALL,
      F.ANSWER_AFTER_TOOL,
      F.ANSWER_AFTER_TOOL,
    ]);
    const client = await chat(route);

    await say(client, "Tracks?");
    await say(client, "Again");

    const wire = messagesOf(seen[2]?.body ?? {});

    expect(wire.map((m) => m.role)).toStrictEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
      "user",
    ]);
    expect(wire[1]?.tool_calls).toStrictEqual([
      {
        id: "call_1",
        type: "function",
        function: { name: "ppal-read-live-set", arguments: '{"include":"t"}' },
      },
    ]);
    expect(wire[2]?.tool_call_id).toBe("call_1");
  });

  it("flags the tool limit when the last allowed step still wants a tool", async () => {
    stubProviderFetch([F.CALL]);

    const client = await chat(route, { maxSteps: 1 });

    expect(await toolLimitReachedAfter(client, "Tracks?")).toBe(true);
  });

  it("keeps the text that arrived before the output limit cut the answer off", async () => {
    stubProviderFetch([F.CUT_OFF]);

    const history = await say(await chat(route), "Tracks?");

    expect(assistantTurns(history)[0]?.content).toBe("Tracks: Drums, Ba");
  });

  it("finishes a stream that ends without the [DONE] marker", async () => {
    stubProviderFetch([F.NO_DONE_MARKER]);

    const history = await say(await chat(route), "Tempo?");

    expect(assistantTurns(history)[0]?.content).toBe("120 BPM.");
  });

  it("throws the server's message for an error inside the stream, keeping the text so far", async () => {
    stubProviderFetch([F.ERROR_MID_STREAM]);

    await expectStreamFailure(
      await chat(route),
      "The model crashed.",
      "The set has ",
    );
  });

  it("throws the server's message for an HTTP 429 and leaves only the user turn", async () => {
    await expectHttpFailure(
      () => chat(route),
      429,
      F.RATE_LIMITED,
      "Too many requests.",
    );
  });
});
