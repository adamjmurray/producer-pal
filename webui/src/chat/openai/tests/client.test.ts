// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  OpenAIClient,
  type OpenAIAssistantMessageWithReasoning,
  type ReasoningDetail,
} from "#webui/chat/openai/client";
import type { OpenAIToolCall } from "#webui/types/messages";
import { createToolCallsMap } from "#webui/test-utils/openai-client-test-helpers";

// Mock MCP SDK
// @ts-expect-error vi.mock partial implementation
vi.mock(import("@modelcontextprotocol/sdk/client/index.js"), () => ({
  Client: class MockClient {
    connect = vi.fn();
    close = vi.fn();
    listTools = vi.fn();
    callTool = vi.fn();
  },
}));

vi.mock(import("@modelcontextprotocol/sdk/client/streamableHttp.js"), () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

// Note: extractReasoningFromDelta tests are in openai-reasoning-helpers.test.ts

describe("OpenAIClient constructor", () => {
  it("initializes with default chat history when not provided", () => {
    const client = new OpenAIClient("test-key", {
      model: "gpt-4",
    });

    expect(client.chatHistory).toStrictEqual([]);
  });

  it("uses provided chat history", () => {
    const history = [{ role: "user" as const, content: "Hello" }];
    const client = new OpenAIClient("test-key", {
      model: "gpt-4",
      chatHistory: history,
    });

    expect(client.chatHistory).toStrictEqual(history);
  });

  it("adds system message when provided and history is empty", () => {
    const client = new OpenAIClient("test-key", {
      model: "gpt-4",
      systemInstruction: "You are a helpful assistant.",
    });

    expect(client.chatHistory).toHaveLength(1);
    expect(client.chatHistory[0]).toStrictEqual({
      role: "system",
      content: "You are a helpful assistant.",
    });
  });

  it("does not add system message when history already has messages", () => {
    const client = new OpenAIClient("test-key", {
      model: "gpt-4",
      systemInstruction: "You are a helpful assistant.",
      chatHistory: [{ role: "user", content: "Hello" }],
    });

    // Should not add system message since history is not empty
    expect(client.chatHistory).toHaveLength(1);
    expect(client.chatHistory[0]?.role).toBe("user");
  });

  it("stores config correctly", () => {
    const config = {
      model: "gpt-4",
      temperature: 0.7,
      reasoningEffort: "high" as const,
    };
    const client = new OpenAIClient("test-key", config);

    expect(client.config.model).toBe("gpt-4");
    expect(client.config.temperature).toBe(0.7);
    expect(client.config.reasoningEffort).toBe("high");
  });

  it("initializes mcpClient as null", () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });

    expect(client.mcpClient).toBeNull();
  });

  it("configures OpenAI client with custom baseUrl", () => {
    const client = new OpenAIClient("test-key", {
      model: "gpt-4",
      baseUrl: "https://api.mistral.ai/v1",
    });

    // The client should be created (we can't easily inspect internal state,
    // but we can verify it doesn't throw)
    expect(client.ai).toBeDefined();
  });

  it("uses default OpenAI baseUrl when not provided", () => {
    const client = new OpenAIClient("test-key", {
      model: "gpt-4",
    });

    expect(client.ai).toBeDefined();
  });
});

describe("OpenAIClient.initialize", () => {
  it("sets mcpClient after initialization", async () => {
    const client = new OpenAIClient("test-key", { model: "gpt-4" });

    expect(client.mcpClient).toBeNull();

    await client.initialize();

    // After initialization, mcpClient should be set (via mocked MCP SDK)
    expect(client.mcpClient).toBeDefined();
    expect(client.mcpClient).not.toBeNull();
  });
});

describe("OpenAIClient.buildStreamMessage", () => {
  let client: OpenAIClient;

  // Helper to create a client instance for testing
  function createTestClient(): OpenAIClient {
    return new OpenAIClient("test-key", {
      model: "gpt-4",
      chatHistory: [],
    });
  }

  it("should not include tool_calls when finish_reason is null (streaming in progress)", () => {
    client = createTestClient();

    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "Thinking...",
    };

    const toolCallsMap = createToolCallsMap("search", '{"query": "incomplete');

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap as Map<number, OpenAIToolCall>,
      new Map<string, ReasoningDetail>(),
      null, // finish_reason is null during streaming
    );

    expect(result.tool_calls).toBeUndefined();
    expect(result.content).toBe("Thinking...");
  });

  it("should not include tool_calls when finish_reason is 'stop'", () => {
    client = createTestClient();

    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "Here's the answer",
    };
    const toolCallsMap = createToolCallsMap("search", '{"query": "test"}');

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap as Map<number, OpenAIToolCall>,
      new Map<string, ReasoningDetail>(),
      "stop",
    );

    expect(result.tool_calls).toBeUndefined();
    expect(result.content).toBe("Here's the answer");
  });

  it("should include tool_calls when finish_reason is 'tool_calls'", () => {
    client = createTestClient();

    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "",
    };
    const toolCallsMap = createToolCallsMap("search", '{"query": "test"}');

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap as Map<number, OpenAIToolCall>,
      new Map<string, ReasoningDetail>(),
      "tool_calls", // finish_reason indicates tool calls are complete
    );

    expect(result.tool_calls).toBeDefined();
    expect(result.tool_calls).toHaveLength(1);
    const toolCall = result.tool_calls?.[0];

    expect(toolCall?.id).toBe("call_123");
    expect(toolCall?.type).toBe("function");

    const functionToolCall = toolCall as {
      function: { name: string; arguments: string };
    };

    expect(functionToolCall.function.name).toBe("search");
    expect(functionToolCall.function.arguments).toBe('{"query": "test"}');
  });

  it("should include multiple tool_calls when finish_reason is 'tool_calls'", () => {
    client = createTestClient();

    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "",
    };

    const toolCallsMap = new Map<number, OpenAIToolCall>([
      [
        0,
        {
          id: "call_1",
          type: "function",
          function: {
            name: "search",
            arguments: '{"query": "foo"}',
          },
        },
      ],
      [
        1,
        {
          id: "call_2",
          type: "function",
          function: {
            name: "calculate",
            arguments: '{"expression": "2+2"}',
          },
        },
      ],
    ]);

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap,
      new Map<string, ReasoningDetail>(),
      "tool_calls",
    );

    expect(result.tool_calls).toBeDefined();
    expect(result.tool_calls).toHaveLength(2);
  });

  it("should not include tool_calls when finish_reason is 'tool_calls' but map is empty", () => {
    client = createTestClient();

    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "Response",
    };

    const toolCallsMap = new Map<number, OpenAIToolCall>();

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap,
      new Map<string, ReasoningDetail>(),
      "tool_calls",
    );

    expect(result.tool_calls).toBeUndefined();
  });

  it("should include reasoning_details when reasoning blocks are provided", () => {
    client = createTestClient();

    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "Answer",
    };

    const toolCallsMap = new Map<number, OpenAIToolCall>();
    const reasoningDetailsMap = new Map<string, ReasoningDetail>([
      [
        "reasoning.text-0",
        {
          type: "reasoning.text",
          text: "Thinking about this carefully...",
          index: 0,
        },
      ],
    ]);

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap,
      reasoningDetailsMap,
      "stop",
    );

    expect(result.reasoning_details).toBeDefined();
    expect(result.reasoning_details).toHaveLength(1);
    const reasoning = result.reasoning_details?.[0];

    expect(reasoning?.type).toBe("reasoning.text");
    expect(reasoning?.text).toBe("Thinking about this carefully...");
    expect(reasoning?.index).toBe(0);
  });

  it("should not include reasoning_details when map is empty", () => {
    client = createTestClient();

    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "Answer",
    };

    const toolCallsMap = new Map<number, OpenAIToolCall>();

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap,
      new Map<string, ReasoningDetail>(),
      "stop",
    );

    expect(result.reasoning_details).toBeUndefined();
  });

  it("should include both tool_calls and reasoning when both are present", () => {
    client = createTestClient();

    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "",
    };
    const toolCallsMap = createToolCallsMap(
      "analyze",
      '{"data": "test"}',
      "call_xyz",
    );
    const reasoningDetailsMap = new Map<string, ReasoningDetail>([
      [
        "reasoning.text-0",
        {
          type: "reasoning.text",
          text: "I need to analyze this data...",
          index: 0,
        },
      ],
    ]);

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap as Map<number, OpenAIToolCall>,
      reasoningDetailsMap,
      "tool_calls",
    );

    expect(result.tool_calls).toBeDefined();
    expect(result.tool_calls).toHaveLength(1);
    expect(result.reasoning_details).toBeDefined();
    const reasoning = result.reasoning_details?.[0];

    expect(reasoning?.text).toBe("I need to analyze this data...");
  });

  /**
   * OpenRouter sends an extra "usage" chunk after finish_reason: "tool_calls".
   * This extra chunk has finish_reason: null, which could clear tool_calls if not handled.
   *
   * The streaming loop in processStreamAndUpdateHistory tracks a `toolCallsFinalized` flag
   * and continues passing "tool_calls" as the finishReason after it's been received.
   *
   * This test documents the expected behavior: buildStreamMessage is stateless and depends
   * on the caller to pass the correct finishReason. The streaming loop is responsible for
   * maintaining the finalized state.
   */
  it("should demonstrate that tool_calls inclusion depends on finishReason passed by caller", () => {
    client = createTestClient();

    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "I'll help you.",
    };
    const toolCallsMap = createToolCallsMap("ppal-connect", "{}", "call_abc");

    const emptyReasoningMap = new Map<string, ReasoningDetail>();

    // Simulating streaming chunks:
    // Chunk 1-2: Tool calls accumulating, finish_reason: null
    const streamingResult = client.buildStreamMessage(
      currentMessage,
      toolCallsMap as Map<number, OpenAIToolCall>,
      emptyReasoningMap,
      null, // Still streaming
    );

    expect(streamingResult.tool_calls).toBeUndefined();

    // Chunk 3: finish_reason: "tool_calls" - tool_calls should be included
    const finalizedResult = client.buildStreamMessage(
      currentMessage,
      toolCallsMap as Map<number, OpenAIToolCall>,
      emptyReasoningMap,
      "tool_calls", // Finalized
    );

    expect(finalizedResult.tool_calls).toBeDefined();
    expect(finalizedResult.tool_calls).toHaveLength(1);

    // Chunk 4 (OpenRouter usage chunk): finish_reason: null again
    // The streaming loop preserves "tool_calls" via toolCallsFinalized flag,
    // so it would pass "tool_calls" here instead of null
    const preservedResult = client.buildStreamMessage(
      currentMessage,
      toolCallsMap as Map<number, OpenAIToolCall>,
      emptyReasoningMap,
      "tool_calls", // Streaming loop passes "tool_calls" (not null) after finalization
    );

    expect(preservedResult.tool_calls).toBeDefined();
    expect(preservedResult.tool_calls).toHaveLength(1);
  });

  it("should preserve all fields from reasoning blocks including id and format", () => {
    client = createTestClient();

    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "Answer",
    };

    const toolCallsMap = new Map<number, OpenAIToolCall>();
    const reasoningDetailsMap = new Map<string, ReasoningDetail>([
      [
        "reasoning.text-0",
        {
          type: "reasoning.text",
          text: "Thinking...",
          index: 0,
          id: "block_123",
          format: "json",
        },
      ],
    ]);

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap,
      reasoningDetailsMap,
      "stop",
    );

    expect(result.reasoning_details).toBeDefined();
    const reasoning = result.reasoning_details?.[0];

    expect(reasoning?.id).toBe("block_123");
    expect(reasoning?.format).toBe("json");
  });

  it("should sort reasoning blocks by index", () => {
    client = createTestClient();

    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "Answer",
    };

    const toolCallsMap = new Map<number, OpenAIToolCall>();
    // Add blocks out of order in the map
    const reasoningDetailsMap = new Map<string, ReasoningDetail>([
      ["reasoning.text-2", { type: "reasoning.text", text: "Third", index: 2 }],
      ["reasoning.text-0", { type: "reasoning.text", text: "First", index: 0 }],
      [
        "reasoning.text-1",
        { type: "reasoning.text", text: "Second", index: 1 },
      ],
    ]);

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap,
      reasoningDetailsMap,
      "stop",
    );

    expect(result.reasoning_details).toBeDefined();
    expect(result.reasoning_details).toHaveLength(3);
    expect(result.reasoning_details?.[0]?.text).toBe("First");
    expect(result.reasoning_details?.[1]?.text).toBe("Second");
    expect(result.reasoning_details?.[2]?.text).toBe("Third");
  });
});
