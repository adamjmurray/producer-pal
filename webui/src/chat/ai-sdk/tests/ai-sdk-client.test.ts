// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  type AiSdkClientConfig,
  type AiSdkMessage,
} from "#webui/chat/ai-sdk/ai-sdk-types";

// Mock streamText from ai
vi.mock(import("ai"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    streamText: vi.fn(),
  };
});

// Mock MCP tools
vi.mock(import("#webui/chat/ai-sdk/mcp-tools"), () => ({
  createAiSdkMcpTools: vi.fn().mockResolvedValue({ tools: {}, mcpClient: {} }),
}));

// Mock getMcpUrl
vi.mock(import("#webui/utils/mcp-url"), () => ({
  getMcpUrl: vi.fn(() => "http://localhost:3000/mcp"),
}));

import { streamText } from "ai";
import { AiSdkClient } from "#webui/chat/ai-sdk/ai-sdk-client";

/**
 * Create a mock config.
 * @param overrides - Config overrides
 * @returns Mock AiSdkClientConfig
 */
function createConfig(
  overrides?: Partial<AiSdkClientConfig>,
): AiSdkClientConfig {
  return {
    model: {
      modelId: "test",
      provider: "openai",
      specificationVersion: "v3",
    } as never,
    showThoughts: false,
    ...overrides,
  };
}

/**
 * Send a message through a new client with mocked stream parts.
 * Returns the final chat history snapshot.
 * @param parts - Stream parts to emit
 * @param message - User message text
 * @returns Final chat history
 */
async function sendWithParts(
  parts: Record<string, unknown>[],
  message = "Hello",
): Promise<AiSdkMessage[]> {
  async function* iterate(): AsyncIterable<Record<string, unknown>> {
    for (const p of parts) yield p;
  }

  (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
    fullStream: iterate(),
  });

  const client = new AiSdkClient("key", createConfig());
  let last: AiSdkMessage[] = [];

  for await (const history of client.sendMessage(message)) {
    last = history;
  }

  return last;
}

describe("AiSdkClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("initializes with empty chat history", () => {
      const client = new AiSdkClient("key", createConfig());

      expect(client.chatHistory).toStrictEqual([]);
    });

    it("initializes with provided chat history", () => {
      const history = [{ role: "user" as const, content: "Hello" }];
      const client = new AiSdkClient(
        "key",
        createConfig({ chatHistory: history }),
      );

      expect(client.chatHistory).toStrictEqual(history);
    });
  });

  describe("initialize", () => {
    it("calls createAiSdkMcpTools with the MCP URL", async () => {
      const { createAiSdkMcpTools } =
        await import("#webui/chat/ai-sdk/mcp-tools");
      const client = new AiSdkClient("key", createConfig());

      await client.initialize();

      expect(createAiSdkMcpTools).toHaveBeenCalledWith(
        "http://localhost:3000/mcp",
        undefined,
      );
    });

    it("uses custom MCP URL from config", async () => {
      const { createAiSdkMcpTools } =
        await import("#webui/chat/ai-sdk/mcp-tools");
      const client = new AiSdkClient(
        "key",
        createConfig({ mcpUrl: "http://custom:9000/mcp" }),
      );

      await client.initialize();

      expect(createAiSdkMcpTools).toHaveBeenCalledWith(
        "http://custom:9000/mcp",
        undefined,
      );
    });
  });

  describe("sendMessage", () => {
    it("adds user message and yields initial history", async () => {
      const last = await sendWithParts([]);

      expect(last).toStrictEqual([{ role: "user", content: "Hello" }]);
    });

    it("processes text-delta stream parts", async () => {
      const last = await sendWithParts([
        { type: "text-delta", text: "Hi" },
        { type: "text-delta", text: " there" },
      ]);

      expect(last).toHaveLength(2);
      expect(last[1]!.content).toBe("Hi there");
    });

    it("processes reasoning-delta stream parts", async () => {
      const last = await sendWithParts([
        { type: "reasoning-delta", text: "Think" },
        { type: "reasoning-delta", text: "ing" },
        { type: "text-delta", text: "Answer" },
      ]);

      expect(last[1]!.reasoning).toBe("Thinking");
      expect(last[1]!.content).toBe("Answer");
    });

    it("processes tool-call stream parts", async () => {
      const last = await sendWithParts([
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "ppal-connect",
          input: {},
        },
      ]);

      expect(last[1]!.toolCalls).toStrictEqual([
        { id: "tc1", name: "ppal-connect", args: {} },
      ]);
    });

    it("processes tool-result stream parts", async () => {
      const last = await sendWithParts([
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "ppal-connect",
          input: {},
        },
        {
          type: "tool-result",
          toolCallId: "tc1",
          toolName: "ppal-connect",
          input: {},
          output: "Connected",
        },
      ]);

      expect(last[1]!.toolResults).toStrictEqual([
        {
          id: "tc1",
          name: "ppal-connect",
          args: {},
          result: "Connected",
          isError: false,
        },
      ]);
    });

    it("processes tool-error stream parts", async () => {
      const last = await sendWithParts([
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "ppal-connect",
          input: {},
        },
        {
          type: "tool-error",
          toolCallId: "tc1",
          toolName: "ppal-connect",
          input: {},
          error: "Connection failed",
        },
      ]);

      expect(last[1]!.toolResults![0]!.isError).toBe(true);
      expect(last[1]!.toolResults![0]!.result).toBe("Connection failed");
    });

    it("creates new assistant message on start-step", async () => {
      const last = await sendWithParts([
        { type: "text-delta", text: "First" },
        { type: "start-step", messageId: "m2" },
        { type: "text-delta", text: "Second" },
      ]);

      // Should have: user, first assistant, second assistant
      expect(last).toHaveLength(3);
      expect(last[1]!.content).toBe("First");
      expect(last[2]!.content).toBe("Second");
    });

    it("ignores unrecognized stream part types", async () => {
      const last = await sendWithParts([
        { type: "text-delta", text: "Hi" },
        { type: "some-unknown-event" },
      ]);

      expect(last[1]!.content).toBe("Hi");
    });

    it("converts history with text-only assistant to model messages", async () => {
      const chatHistory: AiSdkMessage[] = [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
      ];

      async function* empty(): AsyncIterable<Record<string, unknown>> {}

      (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
        fullStream: empty(),
      });

      const client = new AiSdkClient("key", createConfig({ chatHistory }));

      for await (const _ of client.sendMessage("Follow-up")) {
        /* consume */
      }

      const callArgs = (streamText as ReturnType<typeof vi.fn>).mock
        .calls[0]![0];

      // 3 messages: user, assistant (text-only), new user
      expect(callArgs.messages).toHaveLength(3);
      expect(callArgs.messages[1].content).toBe("Hello!");
    });

    it("converts history with tool calls to model messages", async () => {
      // Pre-seed history with assistant message containing tool calls
      const chatHistory: AiSdkMessage[] = [
        { role: "user", content: "Connect" },
        {
          role: "assistant",
          content: "Connecting",
          toolCalls: [{ id: "tc1", name: "ppal-connect", args: {} }],
          toolResults: [
            {
              id: "tc1",
              name: "ppal-connect",
              args: {},
              result: "OK",
              isError: false,
            },
          ],
        },
      ];

      async function* empty(): AsyncIterable<Record<string, unknown>> {}

      (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
        fullStream: empty(),
      });

      const client = new AiSdkClient("key", createConfig({ chatHistory }));
      const results = [];

      for await (const history of client.sendMessage("What happened?")) {
        results.push(history);
      }

      // Verifies buildModelMessages handled tool-call history
      expect(streamText).toHaveBeenCalled();
      const callArgs = (streamText as ReturnType<typeof vi.fn>).mock
        .calls[0]![0];

      // 4 messages: user, assistant (with tool calls), tool (results), new user
      expect(callArgs.messages).toHaveLength(4);
      expect(callArgs.messages[1].role).toBe("assistant");
      expect(callArgs.messages[2].role).toBe("tool");
      expect(callArgs.messages[2].content[0].output).toStrictEqual({
        type: "text",
        value: "OK",
      });
    });
  });
});
