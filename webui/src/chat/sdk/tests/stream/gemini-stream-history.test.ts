// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildProviderOptions } from "#webui/chat/sdk/provider/provider-options";
import * as F from "./gemini-fixtures";
import {
  assistantTurns,
  chatViewParts,
  collectSdkWarnings,
  expectEmptyArgsStep,
  expectFailedToolRun,
  expectHttpFailure,
  expectStreamFailure,
  httpError,
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

// Raw `streamGenerateContent` chunks through the real @ai-sdk/google provider
// and streamText loop into chat history, and back out as the next request.

const THINKING = buildProviderOptions("gemini", "Default", F.GEMINI_3);

type Part = Record<string, unknown>;
type WireContent = { role: string; parts: Part[] };

/**
 * The `contents` of a recorded request body.
 * @param body - Request body
 * @returns The conversation Gemini was sent
 */
function contentsOf(body: Record<string, unknown>): WireContent[] {
  return body.contents as WireContent[];
}

const gemini = (model = F.GEMINI_3): ReturnType<typeof startChat> =>
  startChat({ provider: "gemini", model, providerOptions: THINKING });

// The SDK's replay warning is expected in places; keep it out of the log.
beforeEach(() => {
  collectSdkWarnings();
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreSdkWarnings();
});

describe("Gemini stream to history", () => {
  describe("thought summaries and text", () => {
    it("keeps thought summaries as reasoning and the answer as content", async () => {
      stubProviderFetch([F.THINKING_THEN_TEXT]);

      const history = await say(await gemini(), "Tempo?");
      const [turn, ...rest] = assistantTurns(history);

      expect(rest).toHaveLength(0);
      expect(turn).toStrictEqual({
        role: "assistant",
        content: "The set runs at 120 BPM.",
        reasoning: "**Reading the set**\n\nChecking the tempo.",
        reasoningParts: [
          { text: "**Reading the set**\n\nChecking the tempo." },
        ],
        usage: { inputTokens: 100, outputTokens: 50, reasoningTokens: 42 },
        responseModel: F.GEMINI_3,
      });
    });

    it("keeps the thought summary as one block and does not capture Gemini's signature", async () => {
      stubProviderFetch([F.THINKING_THEN_TEXT]);

      const turn = assistantTurns(await say(await gemini(), "Tempo?"))[0];

      expect(turn?.reasoningParts).toStrictEqual([
        { text: "**Reading the set**\n\nChecking the tempo." },
      ]);
    });

    it("counts thought tokens as reasoning tokens in the step's usage", async () => {
      stubProviderFetch([F.THINKING_THEN_TEXT]);

      const turn = assistantTurns(await say(await gemini(), "Tempo?"))[0];

      expect(turn?.usage).toStrictEqual({
        inputTokens: 100,
        outputTokens: 50,
        reasoningTokens: 42,
      });
    });

    it("shows the thought, then the answer, in the chat view", async () => {
      stubProviderFetch([F.THINKING_THEN_TEXT]);

      expect(chatViewParts(await say(await gemini(), "Tempo?"))).toStrictEqual([
        ["thought", "**Reading the set**\n\nChecking the tempo."],
        ["text", "The set runs at 120 BPM."],
      ]);
    });

    it("leaves reasoning unset when the model sends no thought summaries", async () => {
      stubProviderFetch([F.ANSWER_AFTER_TOOL]);

      const turn = assistantTurns(await say(await gemini(), "Hi"))[0];

      expect(turn).toStrictEqual({
        role: "assistant",
        content: "Tempo is 120.",
        usage: { inputTokens: 100, outputTokens: 4 },
        responseModel: F.GEMINI_3,
      });
    });

    it("ignores an empty text part that only carries a signature", async () => {
      stubProviderFetch([F.TRAILING_SIGNATURE]);

      const history = await say(await gemini(), "Done?");

      expect(assistantTurns(history)).toHaveLength(1);
      expect(assistantTurns(history)[0]?.content).toBe("All set.");
    });
  });

  describe("tool calls across steps", () => {
    it("stores the tool step and the answer as separate assistant turns", async () => {
      stubProviderFetch([F.THINKING_THEN_CALL, F.ANSWER_AFTER_TOOL]);

      const history = await say(await gemini(), "Tracks?");
      const [step, answer] = assistantTurns(history);
      const call = step?.toolCalls?.[0];

      expect(assistantTurns(history)).toHaveLength(2);
      expect(step).toStrictEqual({
        role: "assistant",
        content: "",
        reasoning: "Need the tracks.",
        reasoningParts: [{ text: "Need the tracks." }],
        toolCalls: [
          {
            id: expect.any(String),
            name: "ppal-read-live-set",
            args: { include: "t" },
          },
        ],
        toolResults: [
          {
            id: call?.id,
            name: "ppal-read-live-set",
            args: { include: "t" },
            result: [{ type: "text", text: "tempo 120" }],
            isError: false,
          },
        ],
        usage: { inputTokens: 100, outputTokens: 25, reasoningTokens: 20 },
        responseModel: F.GEMINI_3,
      });
      expect(answer).toStrictEqual({
        role: "assistant",
        content: "Tempo is 120.",
        usage: { inputTokens: 100, outputTokens: 4 },
        responseModel: F.GEMINI_3,
      });
    });

    it("sends the tool call's signature back within the turn", async () => {
      const seen = stubProviderFetch([
        F.THINKING_THEN_CALL,
        F.ANSWER_AFTER_TOOL,
      ]);

      await say(await gemini(), "Tracks?");

      const model = contentsOf(seen[1]?.body ?? {}).find(
        (c) => c.role === "model",
      );

      expect(model?.parts).toStrictEqual([
        { text: "Need the tracks.", thought: true },
        {
          functionCall: {
            id: expect.any(String),
            name: "ppal-read-live-set",
            args: { include: "t" },
          },
          thoughtSignature: F.SIGNATURE,
        },
      ]);
    });

    it("keeps parallel calls in one turn, each with its own result", async () => {
      stubProviderFetch([F.PARALLEL_CALLS, F.ANSWER_AFTER_TOOL]);

      const [step] = assistantTurns(await say(await gemini(), "Both"));

      expect(step?.toolCalls?.map((c) => c.args)).toStrictEqual([
        { include: "a" },
        { include: "b" },
      ]);
      expect(step?.toolResults?.map((r) => r.id)).toStrictEqual(
        step?.toolCalls?.map((c) => c.id),
      );
    });

    it("stores a call with no arguments as an empty args object", async () => {
      stubProviderFetch([F.NO_ARGS_CALL, F.ANSWER_AFTER_TOOL]);

      expectEmptyArgsStep(await say(await gemini(), "Go"));
    });

    it("records a failing tool as an error result and lets the model carry on", async () => {
      const seen = stubProviderFetch([F.FAILING_CALL, F.ANSWER_AFTER_TOOL]);

      const history = await say(await gemini(), "Edit");

      expectFailedToolRun(history);
      expect(
        JSON.stringify(contentsOf(seen[1]?.body ?? {}).at(-1)?.parts[0]),
      ).toContain("clip 7 not found");
    });

    it("flags the tool limit when the last allowed step still wants a tool", async () => {
      stubProviderFetch([F.THINKING_THEN_CALL]);

      const client = await startChat({
        provider: "gemini",
        model: F.GEMINI_3,
        maxSteps: 1,
      });

      expect(await toolLimitReachedAfter(client, "Tracks?")).toBe(true);
    });

    it("does not flag the limit when the model stops on its own", async () => {
      stubProviderFetch([F.THINKING_THEN_TEXT]);

      const client = await startChat({
        provider: "gemini",
        model: F.GEMINI_3,
        maxSteps: 1,
      });

      expect(await toolLimitReachedAfter(client, "Tempo?")).toBe(false);
    });
  });

  describe("replay on the next turn", () => {
    it("does not send thought summaries back, only the answer", async () => {
      const seen = stubProviderFetch([
        F.THINKING_THEN_TEXT,
        F.ANSWER_AFTER_TOOL,
      ]);
      const client = await gemini();

      await say(client, "Tempo?");
      await say(client, "Again");

      expect(contentsOf(seen[1]?.body ?? {})).toStrictEqual([
        { role: "user", parts: [{ text: "Tempo?" }] },
        { role: "model", parts: [{ text: "The set runs at 120 BPM." }] },
        { role: "user", parts: [{ text: "Again" }] },
      ]);
    });

    it("replays an earlier tool step with the skip-validator signature on Gemini 3", async () => {
      const warnings = collectSdkWarnings();
      const seen = stubProviderFetch([
        F.THINKING_THEN_CALL,
        F.ANSWER_AFTER_TOOL,
        F.THINKING_THEN_TEXT,
      ]);
      const client = await gemini();

      await say(client, "Tracks?");
      await say(client, "Again");

      const wire = contentsOf(seen[2]?.body ?? {});
      const stepCall = wire[1]?.parts[0] as {
        functionCall: { id: string; name: string };
        thoughtSignature: string;
      };
      const reply = wire[2]?.parts[0] as {
        functionResponse: { id: string; response: { content: string } };
      };

      expect(wire.map((c) => c.role)).toStrictEqual([
        "user",
        "model",
        "user",
        "model",
        "user",
      ]);
      expect(stepCall.functionCall.name).toBe("ppal-read-live-set");
      expect(stepCall.thoughtSignature).toBe(
        "skip_thought_signature_validator",
      );
      expect(reply.functionResponse.id).toBe(stepCall.functionCall.id);
      expect(reply.functionResponse.response.content).toContain("tempo 120");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("skip_thought_signature_validator");
    });

    it("sends no signature at all for an earlier tool step on Gemini 2.5", async () => {
      const warnings = collectSdkWarnings();
      const seen = stubProviderFetch([
        F.THINKING_THEN_CALL,
        F.ANSWER_AFTER_TOOL,
        F.THINKING_THEN_TEXT,
      ]);
      const client = await gemini(F.GEMINI_25);

      await say(client, "Tracks?");
      await say(client, "Again");

      const stepCall = contentsOf(seen[2]?.body ?? {})[1]?.parts[0];

      expect(stepCall).not.toHaveProperty("thoughtSignature");
      expect(warnings).toStrictEqual([]);
    });
  });

  describe("stops and failures", () => {
    it("keeps the text that arrived before the output limit cut the answer off", async () => {
      stubProviderFetch([F.CUT_OFF]);

      const history = await say(await gemini(), "Tracks?");

      expect(assistantTurns(history)[0]?.content).toBe("Tracks: Drums, Ba");
    });

    it.each([
      ["the safety filter stops the answer before any text", F.SAFETY_STOP],
      ["the prompt itself is blocked", F.BLOCKED],
    ])(
      "says the content filter stopped the answer when %s",
      async (_name, events) => {
        stubProviderFetch([events]);

        const history = await say(await gemini(), "Hmm");

        expect(history).toStrictEqual([
          { role: "user", content: "Hmm" },
          { role: "assistant", content: FILTER_NOTICE, isError: true },
        ]);
      },
    );

    it("throws the provider's message for an error inside the stream, keeping the text so far", async () => {
      stubProviderFetch([F.ERROR_MID_STREAM]);

      await expectStreamFailure(
        await gemini(),
        "The model is overloaded.",
        "The set has ",
      );
    });

    it("throws the API's message for an HTTP 429 and leaves only the user turn", async () => {
      await expectHttpFailure(
        gemini,
        429,
        F.RATE_LIMITED,
        "Quota exceeded for this model.",
      );
    });

    it("answers a retry of a failed turn without asking twice", async () => {
      const seen = stubProviderFetch([
        httpError(429, F.RATE_LIMITED),
        F.THINKING_THEN_TEXT,
      ]);
      const client = await gemini();

      await expect(say(client, "Tracks?")).rejects.toThrow(
        "Quota exceeded for this model.",
      );

      let last = client.chatHistory;

      for await (const history of client.resumeStream()) {
        last = history;
      }

      expect(contentsOf(seen[1]?.body ?? {})).toStrictEqual([
        { role: "user", parts: [{ text: "Tracks?" }] },
      ]);
      expect(assistantTurns(last)[0]?.content).toBe("The set runs at 120 BPM.");
    });
  });
});
