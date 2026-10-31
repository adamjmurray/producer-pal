// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildProviderOptions } from "#webui/chat/sdk/provider/provider-options";
import * as F from "./anthropic-fixtures";
import {
  assistantTurns,
  collectSdkWarnings,
  expectHttpFailure,
  expectStreamFailure,
  liveSetStep,
  restoreSdkWarnings,
  say,
  startChat,
  stubProviderFetch,
  type RawEvent,
} from "./raw-stream-harness";

vi.mock(import("#webui/chat/sdk/mcp-tools"), async () => {
  const { fakeMcpTools } = await import("./fake-mcp-tools");

  return { createMcpTools: vi.fn(() => Promise.resolve(fakeMcpTools())) };
});

beforeEach(() => {
  collectSdkWarnings();
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreSdkWarnings();
});

const THINKING = buildProviderOptions("anthropic", "Default", F.CLAUDE);

const claude = (providerOptions = THINKING): ReturnType<typeof startChat> =>
  startChat({ provider: "anthropic", model: F.CLAUDE, providerOptions });

type Block = Record<string, unknown>;
type WireMessage = { role: string; content: Block[] };

/**
 * The `messages` of a recorded request body.
 * @param body - Request body
 * @returns The conversation Anthropic was sent
 */
const messagesOf = (body: Record<string, unknown>): WireMessage[] =>
  body.messages as WireMessage[];

/**
 * The block types of each assistant message in a request.
 * @param body - Request body
 * @returns One list of block types per assistant message
 */
const assistantBlocks = (body: Record<string, unknown>): string[][] =>
  messagesOf(body)
    .filter((m) => m.role === "assistant")
    .map((m) => m.content.map((b) => b.type as string));

/**
 * Run a turn, then a second, and return the second request's body.
 * @param first - Events for the first turn's answer
 * @returns What Anthropic was sent for the second turn
 */
async function secondRequest(
  first: RawEvent[],
): Promise<Record<string, unknown>> {
  const seen = stubProviderFetch([first, F.ANSWER_AFTER_TOOL], true);
  const client = await claude();

  await say(client, "Tempo?");
  await say(client, "Again");

  return seen[1]?.body ?? {};
}

describe("Anthropic stream to history", () => {
  describe("thinking blocks", () => {
    it("keeps the thinking text, its signature and the answer", async () => {
      stubProviderFetch([F.THINKING_THEN_TEXT], true);

      const turn = assistantTurns(await say(await claude(), "Tempo?"))[0];

      expect(turn).toStrictEqual({
        role: "assistant",
        content: "The set runs at 120 BPM.",
        reasoning: "Checking the tempo.",
        reasoningParts: [
          { text: "Checking the tempo.", signature: F.SIGNATURE },
        ],
        usage: { inputTokens: 100, outputTokens: 20, reasoningTokens: 12 },
        responseModel: F.CLAUDE,
      });
    });

    it("keeps each thinking block with its own signature and breaks between them", async () => {
      stubProviderFetch([F.TWO_THINKING_BLOCKS], true);

      const turn = assistantTurns(await say(await claude(), "Tempo?"))[0];

      expect(turn?.reasoning).toBe("Checking the tempo.\n\nWriting it up.");
      expect(turn?.reasoningParts).toStrictEqual([
        { text: "Checking the tempo.", signature: F.SIGNATURE },
        { text: "Writing it up.", signature: `${F.SIGNATURE}2` },
      ]);
    });

    it("keeps a redacted block as data with no text to show", async () => {
      stubProviderFetch([F.REDACTED_THEN_TEXT], true);

      const turn = assistantTurns(await say(await claude(), "Tempo?"))[0];

      expect(turn?.reasoningParts).toStrictEqual([
        { text: "", redactedData: F.REDACTED },
      ]);
      expect(turn).not.toHaveProperty("reasoning");
    });
  });

  describe("tool calls across steps", () => {
    it("builds the call from streamed input and answers it in a second turn", async () => {
      stubProviderFetch([F.THINKING_THEN_CALL, F.ANSWER_AFTER_TOOL], true);

      const [step, answer, ...rest] = assistantTurns(
        await say(await claude(), "Tracks?"),
      );

      expect(rest).toHaveLength(0);
      expect(step).toStrictEqual({
        role: "assistant",
        content: "",
        reasoning: "Need the tracks.",
        reasoningParts: [{ text: "Need the tracks.", signature: F.SIGNATURE }],
        ...liveSetStep("toolu_1"),
        usage: { inputTokens: 100, outputTokens: 25, reasoningTokens: 12 },
        responseModel: F.CLAUDE,
      });
      expect(answer).toStrictEqual({
        role: "assistant",
        content: "Tempo is 120.",
        usage: { inputTokens: 100, outputTokens: 8 },
        responseModel: F.CLAUDE,
      });
    });

    it("sends the signed thinking block back with the tool call within the turn", async () => {
      const seen = stubProviderFetch(
        [F.THINKING_THEN_CALL, F.ANSWER_AFTER_TOOL],
        true,
      );

      await say(await claude(), "Tracks?");

      expect(messagesOf(seen[1]?.body ?? {})[1]?.content).toStrictEqual([
        {
          type: "thinking",
          thinking: "Need the tracks.",
          signature: F.SIGNATURE,
        },
        {
          type: "tool_use",
          id: "toolu_1",
          name: "ppal-read-live-set",
          input: { include: "t" },
        },
      ]);
    });
  });

  describe("replay on the next turn", () => {
    it("re-sends the signed thinking block ahead of the answer while thinking is on", async () => {
      const body = await secondRequest(F.THINKING_THEN_TEXT);

      expect(messagesOf(body)[1]?.content).toStrictEqual([
        {
          type: "thinking",
          thinking: "Checking the tempo.",
          signature: F.SIGNATURE,
        },
        { type: "text", text: "The set runs at 120 BPM." },
      ]);
    });

    it("re-sends a redacted block as redacted thinking", async () => {
      const body = await secondRequest(F.REDACTED_THEN_TEXT);

      expect(messagesOf(body)[1]?.content).toStrictEqual([
        { type: "redacted_thinking", data: F.REDACTED },
        { type: "text", text: "120 BPM." },
      ]);
    });

    it("re-sends an earlier tool step's thinking block, call and result", async () => {
      const seen = stubProviderFetch(
        [F.THINKING_THEN_CALL, F.ANSWER_AFTER_TOOL, F.ANSWER_AFTER_TOOL],
        true,
      );
      const client = await claude();

      await say(client, "Tracks?");
      await say(client, "Again");

      expect(assistantBlocks(seen[2]?.body ?? {})).toStrictEqual([
        ["thinking", "tool_use"],
        ["text"],
      ]);
    });

    it("sends no thinking blocks once thinking is off", async () => {
      const seen = stubProviderFetch(
        [F.THINKING_THEN_TEXT, F.ANSWER_AFTER_TOOL],
        true,
      );
      const client = await claude();

      await say(client, "Tempo?");
      await startChat({
        provider: "anthropic",
        model: F.CLAUDE,
        chatHistory: client.chatHistory,
      }).then((off) => say(off, "Again"));

      expect(assistantBlocks(seen[1]?.body ?? {})).toStrictEqual([["text"]]);
    });
  });

  describe("failures", () => {
    it("throws the provider's message for an error inside the stream, keeping the text so far", async () => {
      stubProviderFetch([F.OVERLOADED_MID_STREAM], true);

      await expectStreamFailure(await claude(), "Overloaded", "The set has ");
    });

    it("throws the API's message for an HTTP 429 and leaves only the user turn", async () => {
      await expectHttpFailure(
        claude,
        429,
        F.RATE_LIMITED,
        "Number of requests exceeded.",
      );
    });
  });
});
