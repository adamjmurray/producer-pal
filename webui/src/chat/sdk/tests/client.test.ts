// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi, beforeEach } from "vitest";
import { type ChatClientConfig, type ChatMessage } from "#webui/chat/sdk/types";

// Mock streamText from ai
vi.mock(import("ai"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    streamText: vi.fn(),
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
import { ChatSdkClient, detectToolLimitReached } from "#webui/chat/sdk/client";

const MAX_TOOL_STEPS = 10;

/**
 * Send a message through a new client with mocked stream parts and return the
 * client (so callers can inspect post-stream state like toolLimitReached).
 * @param parts - Stream parts to emit
 * @returns The client after the stream is fully consumed
 */
async function sendAndGetClient(
  parts: Record<string, unknown>[],
): Promise<ChatSdkClient> {
  async function* iterate(): AsyncIterable<Record<string, unknown>> {
    for (const p of parts) yield p;
  }

  (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
    fullStream: iterate(),
  });

  const client = new ChatSdkClient("key", createConfig());

  for await (const _ of client.sendMessage("Hello")) {
    /* consume */
  }

  return client;
}

/**
 * Build a stream that completes the given number of steps and ends with the
 * given overall finishReason.
 * @param steps - Number of finish-step parts to emit
 * @param finishReason - finishReason for the final finish part
 * @returns Stream parts array
 */
function buildSteppedStream(
  steps: number,
  finishReason: string,
): Record<string, unknown>[] {
  const parts: Record<string, unknown>[] = [];

  for (let i = 0; i < steps; i++) {
    parts.push({ type: "finish-step" });
  }

  parts.push({ type: "finish", finishReason });

  return parts;
}

/**
 * Create a mock config.
 * @param overrides - Config overrides
 * @returns Mock ChatClientConfig
 */
function createConfig(overrides?: Partial<ChatClientConfig>): ChatClientConfig {
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
): Promise<ChatMessage[]> {
  async function* iterate(): AsyncIterable<Record<string, unknown>> {
    for (const p of parts) yield p;
  }

  (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
    fullStream: iterate(),
  });

  const client = new ChatSdkClient("key", createConfig());
  let last: ChatMessage[] = [];

  for await (const history of client.sendMessage(message)) {
    last = history;
  }

  return last;
}

/**
 * Send a message with full control over stream response and per-message overrides.
 * @param options - Send options
 * @param options.text - Text to yield in the stream (default: "response")
 * @param options.modelId - Model ID for the response promise
 * @param options.overrides - Per-message overrides
 * @returns Final chat history
 */
const DEFAULT_USAGE = {
  inputTokens: 10,
  inputTokenDetails: {
    noCacheTokens: 10,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  },
  outputTokens: 5,
  outputTokenDetails: { textTokens: 5, reasoningTokens: 0 },
  totalTokens: 15,
};

/**
 * Send a message with full control over stream response and per-message overrides.
 * The mock calls onStepFinish after streaming to simulate the AI SDK behavior.
 * @param options - Send options
 * @param options.text - Text to yield in the stream (default: "response")
 * @param options.modelId - Model ID for the response
 * @param options.overrides - Per-message overrides
 * @returns Final chat history
 */
async function sendWithResponse(
  options: {
    text?: string;
    modelId?: string;
    overrides?: Parameters<ChatSdkClient["sendMessage"]>[2];
  } = {},
): Promise<ChatMessage[]> {
  const text = options.text ?? "response";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock accessing SDK internals
  (streamText as ReturnType<typeof vi.fn>).mockImplementation((opts: any) => {
    async function* iterate(): AsyncIterable<Record<string, unknown>> {
      yield { type: "text-delta", text };
      // Simulate SDK calling onStepFinish after step completes
      opts.onStepFinish?.({
        usage: DEFAULT_USAGE,
        response: { modelId: options.modelId ?? "" },
      });
    }

    return { fullStream: iterate() };
  });

  const client = new ChatSdkClient("key", createConfig());
  let last: ChatMessage[] = [];

  for await (const history of client.sendMessage(
    "Hello",
    undefined,
    options.overrides,
  )) {
    last = history;
  }

  return last;
}

/**
 * Send a tool-call + tool-error pair and return the final history.
 * @param error - The error value to use in the tool-error part
 * @returns Final chat history
 */
async function sendToolError(error: unknown): Promise<ChatMessage[]> {
  return await sendWithParts([
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
      error,
    },
  ]);
}

/**
 * Send a message with pre-seeded chat history using an empty stream.
 * Returns the streamText call arguments for assertion.
 * @param chatHistory - Pre-seeded chat history
 * @param message - User message text
 * @returns The first call arguments passed to streamText
 */
async function sendWithHistory(
  chatHistory: ChatMessage[],
  message: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper accessing mock internals
): Promise<Record<string, any>> {
  async function* empty(): AsyncIterable<Record<string, unknown>> {}

  (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
    fullStream: empty(),
  });

  const client = new ChatSdkClient("key", createConfig({ chatHistory }));

  for await (const _ of client.sendMessage(message)) {
    /* consume */
  }

  return (streamText as ReturnType<typeof vi.fn>).mock.calls[0]![0];
}

describe("ChatSdkClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("initializes with empty chat history", () => {
      const client = new ChatSdkClient("key", createConfig());

      expect(client.chatHistory).toStrictEqual([]);
    });

    it("initializes with provided chat history", () => {
      const history = [{ role: "user" as const, content: "Hello" }];
      const client = new ChatSdkClient(
        "key",
        createConfig({ chatHistory: history }),
      );

      expect(client.chatHistory).toStrictEqual(history);
    });
  });

  describe("initialize", () => {
    it("calls createMcpTools with the MCP URL", async () => {
      const { createMcpTools } = await import("#webui/chat/sdk/mcp-tools");
      const client = new ChatSdkClient("key", createConfig());

      await client.initialize();

      expect(createMcpTools).toHaveBeenCalledWith(
        "http://localhost:3000/mcp",
        undefined,
      );
    });

    it("uses custom MCP URL from config", async () => {
      const { createMcpTools } = await import("#webui/chat/sdk/mcp-tools");
      const client = new ChatSdkClient(
        "key",
        createConfig({ mcpUrl: "http://custom:9000/mcp" }),
      );

      await client.initialize();

      expect(createMcpTools).toHaveBeenCalledWith(
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
      const last = await sendToolError("Connection failed");

      expect(last[1]!.toolResults![0]!.isError).toBe(true);
      expect(last[1]!.toolResults![0]!.result).toBe("Connection failed");
    });

    it("extracts message from Error objects in tool-error parts", async () => {
      const last = await sendToolError(new Error("bar|beat syntax error"));

      expect(last[1]!.toolResults![0]!.result).toBe("bar|beat syntax error");
    });

    it("converts non-string non-Error tool errors to string", async () => {
      const last = await sendToolError(42);

      expect(last[1]!.toolResults![0]!.result).toBe("42");
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

    it("processes tool-input-start for Chat Completions streaming", async () => {
      const last = await sendWithParts([
        {
          type: "tool-input-start",
          id: "tc1",
          toolName: "ppal-connect",
        },
      ]);

      expect(last[1]!.toolCalls).toStrictEqual([
        { id: "tc1", name: "ppal-connect", args: {} },
      ]);
    });

    it("deduplicates tool-call after tool-input-start with same ID", async () => {
      const last = await sendWithParts([
        {
          type: "tool-input-start",
          id: "tc1",
          toolName: "ppal-connect",
        },
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "ppal-connect",
          input: { key: "value" },
        },
      ]);

      // Should have exactly one tool call, updated with parsed args
      expect(last[1]!.toolCalls).toHaveLength(1);
      expect(last[1]!.toolCalls![0]).toStrictEqual({
        id: "tc1",
        name: "ppal-connect",
        args: { key: "value" },
      });
    });

    it("captures response model ID on assistant messages", async () => {
      const last = await sendWithResponse({
        text: "Hi",
        modelId: "gpt-4o-mini",
      });

      expect(last[1]!.responseModel).toBe("gpt-4o-mini");
    });

    it("skips responseModel when response has no modelId", async () => {
      const last = await sendWithResponse({ text: "Hi" });

      expect(last[1]!.responseModel).toBeUndefined();
    });

    it("captures usage on last assistant message", async () => {
      const last = await sendWithResponse({
        text: "Hi",
        modelId: "test-model",
      });

      expect(last[1]!.usage).toStrictEqual({
        inputTokens: 10,
        outputTokens: 5,
      });
    });

    it("attaches per-step usage to assistant messages", async () => {
      const stepUsage = {
        inputTokens: 100,
        inputTokenDetails: {
          noCacheTokens: 100,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokens: 50,
        outputTokenDetails: { textTokens: 40, reasoningTokens: 10 },
        totalTokens: 150,
      };

      (streamText as ReturnType<typeof vi.fn>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock accessing SDK internals
        (opts: any) => {
          async function* iterate(): AsyncIterable<Record<string, unknown>> {
            yield { type: "text-delta", text: "Hi" };
            opts.onStepFinish?.({
              usage: stepUsage,
              response: { modelId: "m" },
            });
          }

          return { fullStream: iterate() };
        },
      );

      const client = new ChatSdkClient("key", createConfig());
      let lastHistory: ChatMessage[] = [];

      for await (const history of client.sendMessage("Hello")) {
        lastHistory = history;
      }

      const assistantMsg = lastHistory.find((m) => m.role === "assistant");

      expect(assistantMsg?.usage).toStrictEqual({
        inputTokens: 100,
        outputTokens: 50,
        reasoningTokens: 10,
      });
    });

    it("ignores unrecognized stream part types", async () => {
      const last = await sendWithParts([
        { type: "text-delta", text: "Hi" },
        { type: "some-unknown-event" },
      ]);

      expect(last[1]!.content).toBe("Hi");
    });

    it("converts history with text-only assistant to model messages", async () => {
      const chatHistory: ChatMessage[] = [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
      ];

      const callArgs = await sendWithHistory(chatHistory, "Follow-up");

      // 3 messages: user, assistant (text-only), new user
      expect(callArgs.messages).toHaveLength(3);
      expect(callArgs.messages[1].content).toBe("Hello!");
    });

    it("skips isError messages when building model messages", async () => {
      const chatHistory: ChatMessage[] = [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Network error", isError: true },
      ];

      const callArgs = await sendWithHistory(chatHistory, "Try again");

      // 2 messages: user, new user (error skipped)
      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0].content).toBe("Hi");
      expect(callArgs.messages[1].content).toBe("Try again");
    });

    it("converts history with tool calls to model messages", async () => {
      // Pre-seed history with assistant message containing tool calls
      const chatHistory: ChatMessage[] = [
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

      const callArgs = await sendWithHistory(chatHistory, "What happened?");

      // 4 messages: user, assistant (with tool calls), tool (results), new user
      expect(callArgs.messages).toHaveLength(4);
      expect(callArgs.messages[1].role).toBe("assistant");
      expect(callArgs.messages[2].role).toBe("tool");
      expect(callArgs.messages[2].content[0].output).toStrictEqual({
        type: "text",
        value: "OK",
      });
    });

    it("synthesizes a canceled tool-result for a tool-call stopped mid-execution", async () => {
      // User pressed Stop after the tool-call streamed but before the result:
      // toolCalls present, toolResults missing. Sending again must still pair the
      // tool-call with a result, or Anthropic/OpenAI reject the request (400).
      const chatHistory: ChatMessage[] = [
        { role: "user", content: "Connect" },
        {
          role: "assistant",
          content: "Connecting",
          toolCalls: [{ id: "tc1", name: "ppal-connect", args: {} }],
          // no toolResults — stopped mid-tool
        },
      ];

      const callArgs = await sendWithHistory(chatHistory, "Retry");

      // user, assistant (tool-call), tool (synthesized result), new user
      expect(callArgs.messages).toHaveLength(4);
      expect(callArgs.messages[2].role).toBe("tool");
      expect(callArgs.messages[2].content).toHaveLength(1);
      expect(callArgs.messages[2].content[0].toolCallId).toBe("tc1");
      expect(callArgs.messages[2].content[0].output.value).toContain(
        "Canceled",
      );
    });

    it("backfills only the missing result when some tool-calls completed", async () => {
      // Two tools called; first returned, second interrupted by Stop.
      const chatHistory: ChatMessage[] = [
        { role: "user", content: "Do two things" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "tc1", name: "ppal-read-song", args: {} },
            { id: "tc2", name: "ppal-update-clip", args: {} },
          ],
          toolResults: [
            {
              id: "tc1",
              name: "ppal-read-song",
              args: {},
              result: "OK",
              isError: false,
            },
            // tc2 interrupted — no result
          ],
        },
      ];

      const callArgs = await sendWithHistory(chatHistory, "continue");

      const toolMsg = callArgs.messages[2];

      expect(toolMsg.role).toBe("tool");
      // One result per tool-call, in tool-call order, even though only one ran.
      expect(toolMsg.content).toHaveLength(2);
      expect(toolMsg.content[0].toolCallId).toBe("tc1");
      expect(toolMsg.content[0].output.value).toBe("OK");
      expect(toolMsg.content[1].toolCallId).toBe("tc2");
      expect(toolMsg.content[1].output.value).toContain("Canceled");
    });

    it("backfills a canceled result in history when the stream stops mid-tool", async () => {
      // Stream emits a tool-call then ends with no tool-result (Stop pressed
      // while the tool was running). The assistant message must not be left with
      // a dangling tool-call — the in-history reconcile fixes the next send AND
      // the perpetual-running UI state.
      const last = await sendWithParts([
        {
          type: "tool-call",
          toolCallId: "tc1",
          toolName: "ppal-connect",
          input: {},
        },
        // stream ends here — no tool-result arrives
      ]);

      const assistantMsg = last[1]!;

      expect(assistantMsg.toolCalls).toHaveLength(1);
      expect(assistantMsg.toolResults).toHaveLength(1);
      expect(assistantMsg.toolResults![0]!.id).toBe("tc1");
      expect(assistantMsg.toolResults![0]!.result).toContain("Canceled");
      expect(assistantMsg.toolResults![0]!.isError).toBe(false);
    });
  });

  describe("per-message overrides", () => {
    it("stamps overrides on user message when provided", async () => {
      const last = await sendWithResponse({
        modelId: "test-model",
        overrides: { thinking: "Max" },
      });

      const user = last.find((m) => m.role === "user");

      expect(user?.thinkingOverride).toBe("Max");

      // Assistant messages should NOT have overrides
      const assistant = last.find((m) => m.role === "assistant");

      expect(assistant?.thinkingOverride).toBeUndefined();
    });

    it("does not stamp overrides when none provided", async () => {
      const last = await sendWithResponse({ modelId: "test-model" });

      const user = last.find((m) => m.role === "user");

      expect(user?.thinkingOverride).toBeUndefined();
    });

    it("only stamps provided override fields", async () => {
      const last = await sendWithResponse({
        modelId: "test-model",
        overrides: { thinking: "Off" },
      });

      const user = last.find((m) => m.role === "user");

      expect(user?.thinkingOverride).toBe("Off");
    });
  });

  describe("toolLimitReached flag", () => {
    it("is true when the step limit is hit while wanting tools", async () => {
      const client = await sendAndGetClient(
        buildSteppedStream(MAX_TOOL_STEPS, "tool-calls"),
      );

      expect(client.toolLimitReached).toBe(true);
    });

    it("is false on a clean stop at the step limit", async () => {
      const client = await sendAndGetClient(
        buildSteppedStream(MAX_TOOL_STEPS, "stop"),
      );

      expect(client.toolLimitReached).toBe(false);
    });

    it("is false when fewer than the limit of steps complete", async () => {
      const client = await sendAndGetClient(
        buildSteppedStream(2, "tool-calls"),
      );

      expect(client.toolLimitReached).toBe(false);
    });

    it("is false when there is no finish part (e.g. aborted/error)", async () => {
      const client = await sendAndGetClient([
        { type: "finish-step" },
        { type: "finish-step" },
      ]);

      expect(client.toolLimitReached).toBe(false);
    });

    it("resets to false on a subsequent clean message", async () => {
      const client = await sendAndGetClient(
        buildSteppedStream(MAX_TOOL_STEPS, "tool-calls"),
      );

      expect(client.toolLimitReached).toBe(true);

      async function* clean(): AsyncIterable<Record<string, unknown>> {
        yield { type: "text-delta", text: "Done" };
        yield { type: "finish", finishReason: "stop" };
      }

      (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
        fullStream: clean(),
      });

      for await (const _ of client.sendMessage("again")) {
        /* consume */
      }

      expect(client.toolLimitReached).toBe(false);
    });
  });
});

describe("detectToolLimitReached", () => {
  it("returns true at the step limit with a tool-calls finishReason", () => {
    expect(detectToolLimitReached(MAX_TOOL_STEPS, "tool-calls")).toBe(true);
  });

  it("returns true above the step limit with tool-calls", () => {
    expect(detectToolLimitReached(MAX_TOOL_STEPS + 1, "tool-calls")).toBe(true);
  });

  it("returns false for a clean stop", () => {
    expect(detectToolLimitReached(MAX_TOOL_STEPS, "stop")).toBe(false);
  });

  it("returns false below the step limit", () => {
    expect(detectToolLimitReached(MAX_TOOL_STEPS - 1, "tool-calls")).toBe(
      false,
    );
  });

  it("returns false when finishReason is undefined (abort/error)", () => {
    expect(detectToolLimitReached(MAX_TOOL_STEPS, undefined)).toBe(false);
  });

  it("returns false for an error finishReason at the limit", () => {
    expect(detectToolLimitReached(MAX_TOOL_STEPS, "error")).toBe(false);
  });
});
