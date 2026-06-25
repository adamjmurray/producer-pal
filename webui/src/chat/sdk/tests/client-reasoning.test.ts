// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Focused coverage for adaptive-thinking reasoning handling: capturing the
 * Anthropic signature off the stream into `reasoningParts`, and re-emitting the
 * signed block on later turns ONLY when the request enables thinking. Re-sending
 * the signed thinking block keeps the request prefix byte-stable so the
 * conversation (incl. the ppal-connect skills result) stays prompt-cached.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { type ChatClientConfig, type ChatMessage } from "#webui/chat/sdk/types";

// Mock streamText from ai
vi.mock(import("ai"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    streamText: vi.fn(),
    generateText: vi.fn(),
  };
});

// Mock MCP tools
vi.mock(import("#webui/chat/sdk/mcp-tools"), () => ({
  createMcpTools: vi.fn().mockResolvedValue({ tools: {}, mcpClient: {} }),
}));

// Mock getMcpUrl
vi.mock(import("#webui/utils/mcp-url"), () => ({
  getMcpUrl: vi.fn(() => "http://localhost:3000/mcp"),
}));

import { streamText } from "ai";
import { ChatSdkClient } from "#webui/chat/sdk/client";

/**
 * Create a mock config.
 * @param overrides - Config overrides
 * @returns Mock ChatClientConfig
 */
function createConfig(overrides?: Partial<ChatClientConfig>): ChatClientConfig {
  return {
    model: {
      modelId: "test",
      provider: "anthropic",
      specificationVersion: "v3",
    } as never,
    showThoughts: false,
    ...overrides,
  };
}

/**
 * Send a message through a new client with mocked stream parts.
 * @param parts - Stream parts to emit
 * @returns Final chat history
 */
async function sendWithParts(
  parts: Record<string, unknown>[],
): Promise<ChatMessage[]> {
  async function* iterate(): AsyncIterable<Record<string, unknown>> {
    for (const p of parts) yield p;
  }

  (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
    fullStream: iterate(),
  });

  const client = new ChatSdkClient("key", createConfig());
  let last: ChatMessage[] = [];

  for await (const history of client.sendMessage("Hello")) {
    last = history;
  }

  return last;
}

/**
 * Send a message with pre-seeded chat history and an empty stream, returning the
 * arguments streamText was called with (so the built model messages can be asserted).
 * @param chatHistory - Pre-seeded chat history
 * @param providerOptions - Provider options forwarded to the client config
 * @returns The first call arguments passed to streamText
 */
async function sendWithHistory(
  chatHistory: ChatMessage[],
  providerOptions?: ChatClientConfig["providerOptions"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper accessing mock internals
): Promise<Record<string, any>> {
  async function* empty(): AsyncIterable<Record<string, unknown>> {}

  (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
    fullStream: empty(),
  });

  const client = new ChatSdkClient(
    "key",
    createConfig({ chatHistory, providerOptions }),
  );

  for await (const _ of client.sendMessage("Next")) {
    /* consume */
  }

  return (streamText as ReturnType<typeof vi.fn>).mock.calls[0]![0];
}

const SIGNED_ASSISTANT: ChatMessage = {
  role: "assistant",
  content: "Done",
  reasoning: "pondering",
  reasoningParts: [{ text: "pondering", signature: "sig-1" }],
};

describe("ChatSdkClient reasoning (adaptive thinking)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("signature capture from the stream", () => {
    it("captures a signature from reasoning-end onto the reasoning block", async () => {
      const last = await sendWithParts([
        { type: "reasoning-start" },
        { type: "reasoning-delta", text: "Think" },
        {
          type: "reasoning-end",
          providerMetadata: { anthropic: { signature: "sig-1" } },
        },
        { type: "text-delta", text: "Answer" },
      ]);

      expect(last[1]!.reasoning).toBe("Think");
      expect(last[1]!.reasoningParts).toStrictEqual([
        { text: "Think", signature: "sig-1" },
      ]);
    });

    it("captures redactedData from a reasoning-start part", async () => {
      const last = await sendWithParts([
        {
          type: "reasoning-start",
          providerMetadata: { anthropic: { redactedData: "blob" } },
        },
        { type: "text-delta", text: "Answer" },
      ]);

      expect(last[1]!.reasoningParts).toStrictEqual([
        { text: "", redactedData: "blob" },
      ]);
    });

    it("retains a turn whose only content is a redacted thinking block", async () => {
      // reasoning-start with redactedData then finish, no deltas/text/tool-calls.
      // The redacted block must keep the assistant turn in history rather than
      // being silently dropped with its captured redactedData.
      const last = await sendWithParts([
        {
          type: "reasoning-start",
          providerMetadata: { anthropic: { redactedData: "blob" } },
        },
        { type: "finish" },
      ]);

      expect(last).toHaveLength(2);
      expect(last[1]!.role).toBe("assistant");
      expect(last[1]!.reasoningParts).toStrictEqual([
        { text: "", redactedData: "blob" },
      ]);
    });

    it("does not retain an empty turn from a bare reasoning-start", async () => {
      // reasoning-start with no redactedData and nothing following must NOT push
      // an empty assistant message (a normal start is followed by deltas/text).
      const last = await sendWithParts([
        { type: "reasoning-start" },
        { type: "finish" },
      ]);

      expect(last).toHaveLength(1);
      expect(last[0]!.role).toBe("user");
    });

    it("ignores reasoning metadata when there is no reasoning block yet", async () => {
      // reasoning-end with no preceding start/delta: nothing to attach to, no throw.
      const last = await sendWithParts([
        {
          type: "reasoning-end",
          providerMetadata: { anthropic: { signature: "sig-x" } },
        },
        { type: "text-delta", text: "Answer" },
      ]);

      expect(last[1]!.reasoningParts).toBeUndefined();
      expect(last[1]!.content).toBe("Answer");
    });
  });

  describe("re-emission gating", () => {
    it("re-emits signed reasoning blocks when the request enables thinking", async () => {
      const callArgs = await sendWithHistory(
        [{ role: "user", content: "Think hard" }, SIGNED_ASSISTANT],
        { anthropic: { thinking: { type: "adaptive" } } },
      );

      // assistant content becomes structured parts with the signed reasoning first
      expect(callArgs.messages[1].content).toStrictEqual([
        {
          type: "reasoning",
          text: "pondering",
          providerOptions: { anthropic: { signature: "sig-1" } },
        },
        { type: "text", text: "Done" },
      ]);
    });

    it("keeps assistant content a plain string when thinking is disabled", async () => {
      // No providerOptions → thinking disabled → reasoning must NOT be re-sent
      // (the API rejects reasoning content when thinking is off).
      const callArgs = await sendWithHistory([
        { role: "user", content: "Think hard" },
        SIGNED_ASSISTANT,
      ]);

      expect(callArgs.messages[1].content).toBe("Done");
    });
  });
});
