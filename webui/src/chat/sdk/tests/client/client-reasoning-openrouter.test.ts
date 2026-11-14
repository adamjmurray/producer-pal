// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * OpenRouter→Claude reasoning: capturing the step's signed `reasoning_details`
 * off the stream, and re-sending them on later turns ONLY while OpenRouter
 * reasoning is on. Re-sending keeps the cached prefix stable across turns.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { type ChatClientConfig, type ChatMessage } from "#webui/chat/sdk/types";

vi.mock(import("ai"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    streamText: vi.fn(),
    generateText: vi.fn(),
  };
});

vi.mock(import("#webui/chat/sdk/mcp-tools"), () => ({
  createMcpTools: vi.fn().mockResolvedValue({ tools: {}, mcpClient: {} }),
}));

vi.mock(import("#webui/utils/mcp-url"), () => ({
  getMcpUrl: vi.fn(() => "http://localhost:3000/mcp"),
}));

import { streamText } from "ai";
import { ChatSdkClient } from "#webui/chat/sdk/client";
import {
  createConfig,
  mockStreamParts,
  sendWithParts,
} from "#webui/chat/sdk/tests/client-test-helpers";

const SIGNED = {
  type: "reasoning.text",
  text: "pondering",
  format: "anthropic-claude-v1",
  signature: "sig-1",
  index: 0,
};
const REDACTED = {
  type: "reasoning.encrypted",
  data: "blob",
  format: "anthropic-claude-v1",
  index: 1,
};
const THINKING_ON = { openrouter: { reasoning: { effort: "medium" } } };

/**
 * Send a message with pre-seeded history and an empty stream, returning the
 * model messages streamText was called with.
 * @param chatHistory - Pre-seeded chat history
 * @param providerOptions - Provider options forwarded to the client config
 * @param overrides - Other client config overrides
 * @returns The messages passed to streamText
 */
async function sentMessages(
  chatHistory: ChatMessage[],
  providerOptions?: ChatClientConfig["providerOptions"],
  overrides: Partial<ChatClientConfig> = {},
): Promise<Array<{ content: unknown }>> {
  mockStreamParts([]);

  const client = new ChatSdkClient(
    "key",
    createConfig({ chatHistory, providerOptions, ...overrides }),
  );

  for await (const _ of client.sendMessage("Next")) {
    /* consume */
  }

  const args = (streamText as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
    messages: Array<{ content: unknown }>;
  };

  return args.messages;
}

const withDetails = (
  overrides: Partial<ChatMessage> = {},
): [ChatMessage, ChatMessage] => [
  { role: "user", content: "Think hard" },
  {
    role: "assistant",
    content: "Done",
    reasoning: "pondering",
    openrouterReasoningDetails: [SIGNED],
    responseModel: "test",
    ...overrides,
  },
];

describe("ChatSdkClient OpenRouter reasoning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("capture from the stream", () => {
    it("keeps signed details from reasoning-end", async () => {
      const last = await sendWithParts([
        { type: "reasoning-start" },
        { type: "reasoning-delta", text: "pondering" },
        {
          type: "reasoning-end",
          providerMetadata: { openrouter: { reasoning_details: [SIGNED] } },
        },
        { type: "text-delta", text: "Answer" },
      ]);

      expect(last[1]!.openrouterReasoningDetails).toStrictEqual([SIGNED]);
    });

    it("keeps signed and redacted details from the first tool call", async () => {
      const last = await sendWithParts([
        { type: "reasoning-start" },
        { type: "reasoning-delta", text: "pondering" },
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "ppal-connect",
          input: {},
          providerMetadata: {
            openrouter: { reasoning_details: [SIGNED, REDACTED] },
          },
        },
      ]);

      expect(last[1]!.openrouterReasoningDetails).toStrictEqual([
        SIGNED,
        REDACTED,
      ]);
    });

    it.each([
      ["empty", []],
      ["unsigned", [{ ...SIGNED, signature: undefined }]],
      ["a non-Claude format", [{ ...SIGNED, format: "google-gemini-v1" }]],
      ["partly unsigned", [SIGNED, { ...SIGNED, signature: "" }]],
      ["redacted without data", [{ ...REDACTED, data: undefined }]],
      ["an unknown type", [{ ...SIGNED, type: "reasoning.summary" }]],
      ["not an object", [null]],
    ])("drops details that are %s", async (_name, details) => {
      const last = await sendWithParts([
        {
          type: "reasoning-end",
          providerMetadata: { openrouter: { reasoning_details: details } },
        },
        { type: "text-delta", text: "Answer" },
      ]);

      expect(last[1]!.openrouterReasoningDetails).toBeUndefined();
    });

    it("leaves a tool call without metadata alone", async () => {
      const last = await sendWithParts([
        { type: "tool-call", toolCallId: "tc1", toolName: "t", input: {} },
      ]);

      expect(last[1]!.openrouterReasoningDetails).toBeUndefined();
    });

    const reasoningEnd = (details: unknown[]): Record<string, unknown> => ({
      type: "reasoning-end",
      providerMetadata: { openrouter: { reasoning_details: details } },
    });
    const toolCall = (details?: unknown[]): Record<string, unknown> => ({
      type: "tool-call",
      toolCallId: "tc1",
      toolName: "t",
      input: {},
      providerMetadata: details
        ? { openrouter: { reasoning_details: details } }
        : undefined,
    });

    // Within a turn the SDK sends a non-empty tool-call list in preference to
    // the reasoning block's, so the saved copy has to follow the same rule.
    it("lets a tool call's invalid list replace the reasoning block's", async () => {
      const last = await sendWithParts([
        reasoningEnd([SIGNED]),
        toolCall([{ ...SIGNED, signature: undefined }]),
      ]);

      expect(last[1]!.openrouterReasoningDetails).toBeUndefined();
    });

    it("lets a tool call's list replace the reasoning block's", async () => {
      const other = { ...SIGNED, signature: "sig-2" };
      const last = await sendWithParts([
        reasoningEnd([SIGNED]),
        toolCall([other]),
      ]);

      expect(last[1]!.openrouterReasoningDetails).toStrictEqual([other]);
    });

    it("keeps the tool call's list over a later reasoning-end", async () => {
      const other = { ...SIGNED, signature: "sig-2" };
      const last = await sendWithParts([
        toolCall([other]),
        reasoningEnd([SIGNED]),
      ]);

      expect(last[1]!.openrouterReasoningDetails).toStrictEqual([other]);
    });

    it("falls back to the reasoning block's when the tool call's list is empty", async () => {
      const last = await sendWithParts([toolCall([]), reasoningEnd([SIGNED])]);

      expect(last[1]!.openrouterReasoningDetails).toStrictEqual([SIGNED]);
    });
  });

  describe("re-emission gating", () => {
    it("re-sends the details as one reasoning part when OpenRouter thinking is on", async () => {
      const messages = await sentMessages(withDetails(), THINKING_ON);

      expect(messages[1]!.content).toStrictEqual([
        {
          type: "reasoning",
          text: "pondering",
          providerOptions: { openrouter: { reasoning_details: [SIGNED] } },
        },
        { type: "text", text: "Done" },
      ]);
    });

    it("re-sends them ahead of tool calls", async () => {
      const messages = await sentMessages(
        withDetails({
          content: "",
          toolCalls: [{ id: "tc1", name: "ppal-connect", args: {} }],
        }),
        THINKING_ON,
      );

      expect(messages[1]!.content).toStrictEqual([
        {
          type: "reasoning",
          text: "pondering",
          providerOptions: { openrouter: { reasoning_details: [SIGNED] } },
        },
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "ppal-connect",
          input: {},
        },
      ]);
    });

    it("still offers the details with reasoning off; the request rewrite drops them", async () => {
      const messages = await sentMessages(withDetails(), {
        openrouter: { reasoning: { effort: "none" } },
      });

      expect(messages[1]!.content).toHaveLength(2);
    });

    it("sends plain content with no OpenRouter options", async () => {
      const messages = await sentMessages(withDetails(), undefined);

      expect(messages[1]!.content).toBe("Done");
    });

    it("does not send OpenRouter details on the direct Anthropic path", async () => {
      const messages = await sentMessages(withDetails(), {
        anthropic: { thinking: { type: "adaptive" } },
      });

      expect(messages[1]!.content).toBe("Done");
    });

    it.each([
      ["another model", "anthropic/claude-haiku-5.5"],
      ["no model", undefined],
    ])(
      "sends plain content for a step from %s",
      async (_name, responseModel) => {
        const messages = await sentMessages(
          withDetails({ responseModel }),
          THINKING_ON,
        );

        expect(messages[1]!.content).toBe("Done");
      },
    );

    it("accepts a dated variant of the request's model", async () => {
      const messages = await sentMessages(
        withDetails({ responseModel: "test-20260101" }),
        THINKING_ON,
      );

      expect(messages[1]!.content).toHaveLength(2);
    });

    it("matches the step's model when the config names its model by id", async () => {
      const model = "anthropic/claude-sonnet-5.5";
      const messages = await sentMessages(
        withDetails({ responseModel: model }),
        THINKING_ON,
        { model },
      );

      expect(messages[1]!.content).toHaveLength(2);
    });

    it("re-sends only the steps that have details", async () => {
      const [user, withSig] = withDetails();
      const messages = await sentMessages(
        [
          user,
          withSig,
          { role: "user", content: "More" },
          { role: "assistant", content: "Plain", responseModel: "test" },
          { role: "user", content: "More" },
          {
            ...withSig,
            openrouterReasoningDetails: [{ ...SIGNED, signature: "sig-9" }],
          },
        ],
        THINKING_ON,
      );
      const contents = messages
        .filter((m) => (m as { role?: string }).role === "assistant")
        .map((m) => (Array.isArray(m.content) ? m.content.length : m.content));

      expect(contents).toStrictEqual([2, "Plain", 2]);
    });

    it("leaves a message without details as plain content", async () => {
      const messages = await sentMessages(
        withDetails({ openrouterReasoningDetails: undefined }),
        THINKING_ON,
      );

      expect(messages[1]!.content).toBe("Done");
    });

    it("drops a reasoning-only turn instead of sending it empty", async () => {
      const messages = await sentMessages(
        withDetails({ content: "" }),
        THINKING_ON,
      );

      // Only the (merged) user turns remain.
      expect(messages).toHaveLength(1);
    });
  });
});
