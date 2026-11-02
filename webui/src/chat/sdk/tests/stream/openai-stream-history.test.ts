// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildProviderOptions } from "#webui/chat/sdk/provider/provider-options";
import * as F from "./openai-fixtures";
import {
  assistantTurns,
  chatViewParts,
  collectSdkWarnings,
  expectEmptyArgsStep,
  expectFailedToolRun,
  expectHttpFailure,
  expectParallelCalls,
  expectStreamFailure,
  httpError,
  liveSetStep,
  restoreSdkWarnings,
  say,
  startChat,
  stubProviderFetch,
  toolLimitReachedAfter,
  FILTER_NOTICE,
} from "./raw-stream-harness";

vi.mock(import("#webui/chat/sdk/mcp-tools"), async () => {
  const { fakeMcpTools } = await import("./fake-mcp-tools");

  return { createMcpTools: vi.fn(() => Promise.resolve(fakeMcpTools())) };
});

const OPTIONS = buildProviderOptions("openai", "Default", F.GPT);

const gpt = (): ReturnType<typeof startChat> =>
  startChat({ provider: "openai", model: F.GPT, providerOptions: OPTIONS });

type WireItem = Record<string, unknown>;

/**
 * The `input` items of a recorded request body.
 * @param body - Request body
 * @returns What OpenAI was sent as the conversation
 */
function inputOf(body: Record<string, unknown>): WireItem[] {
  return body.input as WireItem[];
}

/**
 * Stub the Responses API (with `event:` lines, as the real one writes).
 * @param replies - One reply per expected request
 * @returns The recorded requests
 */
const stubResponses = (
  replies: Parameters<typeof stubProviderFetch>[0],
): ReturnType<typeof stubProviderFetch> => stubProviderFetch(replies, true);

beforeEach(() => {
  collectSdkWarnings();
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreSdkWarnings();
});

describe("OpenAI Responses stream to history", () => {
  describe("reasoning summaries and text", () => {
    it("keeps the summary as reasoning and the answer as content", async () => {
      stubResponses([F.THINKING_THEN_TEXT]);

      const history = await say(await gpt(), "Tempo?");
      const turns = assistantTurns(history);

      expect(turns).toHaveLength(1);
      expect(turns[0]).toStrictEqual({
        role: "assistant",
        content: "The set runs at 120 BPM.",
        reasoning: "**Reading the set**\n\nChecking the tempo.",
        reasoningParts: [
          { text: "**Reading the set**\n\nChecking the tempo." },
        ],
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          reasoningTokens: 42,
          cacheReadTokens: 60,
        },
        responseModel: F.GPT,
      });
    });

    it("asks for summaries and records reasoning and cached tokens in the usage", async () => {
      const seen = stubResponses([F.THINKING_THEN_TEXT]);

      const turn = assistantTurns(await say(await gpt(), "Tempo?"))[0];

      expect(seen[0]?.body.reasoning).toStrictEqual({
        summary: "auto",
      });
      expect(turn?.usage).toStrictEqual({
        inputTokens: 100,
        outputTokens: 50,
        reasoningTokens: 42,
        cacheReadTokens: 60,
      });
    });

    it("shows the summary, then the answer, in the chat view", async () => {
      stubResponses([F.THINKING_THEN_TEXT]);

      expect(chatViewParts(await say(await gpt(), "Tempo?"))).toStrictEqual([
        ["thought", "**Reading the set**\n\nChecking the tempo."],
        ["text", "The set runs at 120 BPM."],
      ]);
    });

    it("breaks between summary parts so the next title does not run into the last sentence", async () => {
      stubResponses([F.TWO_SUMMARY_PARTS]);

      const turn = assistantTurns(await say(await gpt(), "Tempo?"))[0];

      expect(turn?.reasoning).toBe(
        "**Reading the set**\n\nChecking the tempo.\n\n**Writing it up**\n\nKeeping it short.",
      );
      expect(turn?.reasoningParts).toHaveLength(2);
    });

    it("drops encrypted reasoning: no text shown, nothing stored, nothing sent back", async () => {
      const seen = stubResponses([F.ENCRYPTED_REASONING, F.ANSWER_AFTER_TOOL]);
      const client = await gpt();
      const history = await say(client, "Tempo?");

      await say(client, "Again");

      const turn = assistantTurns(history)[0];

      expect(turn?.content).toBe("120 BPM.");
      expect(turn).not.toHaveProperty("reasoning");
      expect(JSON.stringify(history)).not.toContain(F.ENCRYPTED);
      expect(
        inputOf(seen[1]?.body ?? {}).map((item) => item.role),
      ).toStrictEqual(["user", "assistant", "user"]);
      expect(JSON.stringify(seen[1]?.body)).not.toContain(F.ENCRYPTED);
    });
  });

  describe("tool calls across steps", () => {
    it("stores the tool step and the answer as separate assistant turns", async () => {
      stubResponses([F.THINKING_THEN_CALL, F.ANSWER_AFTER_TOOL]);

      const [step, answer, ...rest] = assistantTurns(
        await say(await gpt(), "Tracks?"),
      );

      expect(rest).toHaveLength(0);
      expect(step).toStrictEqual({
        role: "assistant",
        content: "",
        reasoning: "Need the tracks.",
        reasoningParts: [{ text: "Need the tracks." }],
        ...liveSetStep("call_1"),
        usage: {
          inputTokens: 100,
          outputTokens: 25,
          reasoningTokens: 20,
          cacheReadTokens: 60,
        },
        responseModel: F.GPT,
      });
      expect(answer).toStrictEqual({
        role: "assistant",
        content: "Tempo is 120.",
        usage: { inputTokens: 100, outputTokens: 4, cacheReadTokens: 60 },
        responseModel: F.GPT,
      });
    });

    it("sends the reasoning item and call back within the turn", async () => {
      const seen = stubResponses([F.THINKING_THEN_CALL, F.ANSWER_AFTER_TOOL]);

      await say(await gpt(), "Tracks?");

      expect(inputOf(seen[1]?.body ?? {}).slice(1)).toStrictEqual([
        { type: "item_reference", id: "rs_2" },
        {
          type: "function_call",
          call_id: "call_1",
          name: "ppal-read-live-set",
          arguments: '{"include":"t"}',
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: '[{"type":"text","text":"tempo 120"}]',
        },
      ]);
    });

    it("keeps parallel calls in one turn, each with its own result", async () => {
      stubResponses([F.PARALLEL_CALLS, F.ANSWER_AFTER_TOOL]);

      expectParallelCalls(await say(await gpt(), "Both"));
    });

    it("stores a call with an empty argument string as an empty args object", async () => {
      stubResponses([F.NO_ARGS_CALL, F.ANSWER_AFTER_TOOL]);

      expectEmptyArgsStep(await say(await gpt(), "Go"));
    });

    it("records a failing tool as an error result and lets the model carry on", async () => {
      const seen = stubResponses([F.FAILING_CALL, F.ANSWER_AFTER_TOOL]);

      const history = await say(await gpt(), "Edit");

      expectFailedToolRun(history);
      expect(JSON.stringify(inputOf(seen[1]?.body ?? {}).at(-1))).toContain(
        "clip 7 not found",
      );
    });

    it("flags the tool limit when the last allowed step still wants a tool", async () => {
      stubResponses([F.THINKING_THEN_CALL]);

      const client = await startChat({
        provider: "openai",
        model: F.GPT,
        maxSteps: 1,
      });

      expect(await toolLimitReachedAfter(client, "Tracks?")).toBe(true);
    });
  });

  describe("replay on the next turn", () => {
    it("sends earlier turns as plain messages with no reasoning or item references", async () => {
      const seen = stubResponses([F.THINKING_THEN_TEXT, F.ANSWER_AFTER_TOOL]);
      const client = await gpt();

      await say(client, "Tempo?");
      await say(client, "Again");

      expect(inputOf(seen[1]?.body ?? {})).toStrictEqual([
        { role: "user", content: [{ type: "input_text", text: "Tempo?" }] },
        { role: "assistant", content: "The set runs at 120 BPM." },
        { role: "user", content: [{ type: "input_text", text: "Again" }] },
      ]);
    });

    it("replays an earlier tool step as a call and its output, without the reasoning item", async () => {
      const seen = stubResponses([
        F.THINKING_THEN_CALL,
        F.ANSWER_AFTER_TOOL,
        F.THINKING_THEN_TEXT,
      ]);
      const client = await gpt();

      await say(client, "Tracks?");
      await say(client, "Again");

      const wire = inputOf(seen[2]?.body ?? {});

      expect(wire.map((i) => i.type ?? i.role)).toStrictEqual([
        "user",
        "function_call",
        "function_call_output",
        "assistant",
        "user",
      ]);
      expect(wire[1]?.call_id).toBe("call_1");
      expect(wire[2]?.call_id).toBe("call_1");
      expect(JSON.stringify(wire)).not.toContain("rs_2");
    });

    it("re-sends a failed tool call's result exactly as it went within its turn", async () => {
      const seen = stubResponses([
        F.FAILING_CALL,
        F.ANSWER_AFTER_TOOL,
        F.ANSWER_AFTER_TOOL,
      ]);
      const client = await gpt();

      await say(client, "Edit");
      await say(client, "Again");

      const withinTurn = inputOf(seen[1]?.body ?? {});

      expect(JSON.stringify(withinTurn.at(-1))).toContain("clip 7 not found");
      expect(
        inputOf(seen[2]?.body ?? {}).slice(0, withinTurn.length),
      ).toStrictEqual(withinTurn);
    });
  });

  describe("stops and failures", () => {
    it("keeps the text that arrived before the output limit cut the answer off", async () => {
      stubResponses([F.CUT_OFF]);

      const history = await say(await gpt(), "Tracks?");

      expect(assistantTurns(history)[0]?.content).toBe("Tracks: Drums, Ba");
    });

    it("says the content filter stopped the answer when it ends the response with no output", async () => {
      stubResponses([F.FILTERED]);

      const history = await say(await gpt(), "Hmm");

      expect(history).toStrictEqual([
        { role: "user", content: "Hmm" },
        { role: "assistant", content: FILTER_NOTICE, isError: true },
      ]);
    });

    it.each([
      ["response.failed", F.FAILED_MID_STREAM, "The server had an error."],
      ["an error event", F.ERROR_EVENT, "Rate limit reached for this model."],
    ])(
      "throws the provider's message for %s, keeping the text so far",
      async (_name, events, message) => {
        stubResponses([events]);

        await expectStreamFailure(await gpt(), message, "The set has ");
      },
    );

    it("throws the API's message for an HTTP 429 and leaves only the user turn", async () => {
      await expectHttpFailure(
        gpt,
        429,
        F.RATE_LIMITED,
        "Rate limit reached for requests.",
      );
    });

    it("answers a retry of a failed turn without asking twice", async () => {
      const seen = stubResponses([
        httpError(429, F.RATE_LIMITED),
        F.THINKING_THEN_TEXT,
      ]);
      const client = await gpt();

      await expect(say(client, "Tracks?")).rejects.toThrow(
        "Rate limit reached for requests.",
      );

      let last = client.chatHistory;

      for await (const history of client.resumeStream()) {
        last = history;
      }

      expect(inputOf(seen[1]?.body ?? {})).toStrictEqual([
        { role: "user", content: [{ type: "input_text", text: "Tracks?" }] },
      ]);
      expect(assistantTurns(last)[0]?.content).toBe("The set runs at 120 BPM.");
    });
  });
});
