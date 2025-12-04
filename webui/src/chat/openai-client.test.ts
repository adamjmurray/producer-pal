import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import {
  extractReasoningFromDelta,
  OpenAIClient,
  type OpenAIAssistantMessageWithReasoning,
} from "./openai-client";
import type { OpenAIToolCall } from "#webui/types/messages";

describe("extractReasoningFromDelta", () => {
  it("should return empty string for regular content (not reasoning)", () => {
    const delta = {
      content: "Hello",
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);
    expect(result).toBe("");
  });

  it("should return empty string for empty delta", () => {
    const delta =
      {} as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);
    expect(result).toBe("");
  });

  it("should extract reasoning from reasoning_content (OpenAI format)", () => {
    const delta = {
      reasoning_content: "Thinking about the problem...",
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);
    expect(result).toBe("Thinking about the problem...");
  });

  it("should extract reasoning from reasoning_details (OpenRouter format)", () => {
    const delta = {
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "Let me analyze this step by step.",
          index: 0,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);
    expect(result).toBe("Let me analyze this step by step.");
  });

  it("should extract multiple reasoning details chunks", () => {
    const delta = {
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "First, ",
          index: 0,
        },
        {
          type: "reasoning.text",
          text: "I need to understand the requirements.",
          index: 1,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);
    expect(result).toBe("First, I need to understand the requirements.");
  });

  it("should ignore non-text reasoning details", () => {
    const delta = {
      reasoning_details: [
        {
          type: "reasoning.summary",
          summary: "This should be ignored",
          index: 0,
        },
        {
          type: "reasoning.text",
          text: "This should be included",
          index: 1,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);
    expect(result).toBe("This should be included");
  });

  it("should prioritize reasoning_content over reasoning_details", () => {
    const delta = {
      reasoning_content: "From reasoning_content",
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "From reasoning_details",
          index: 0,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);
    expect(result).toBe("From reasoning_content");
  });

  it("should ignore regular content and only extract reasoning", () => {
    const delta = {
      content: "Response: ",
      reasoning_content: "After careful thought, ",
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);
    expect(result).toBe("After careful thought, ");
  });

  it("should ignore regular content when reasoning_details present", () => {
    const delta = {
      content: "Answer: ",
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "Based on my analysis, ",
          index: 0,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);
    expect(result).toBe("Based on my analysis, ");
  });

  it("should handle real-world OpenRouter minimax-m2 chunk structure", () => {
    // This is based on the actual chunk structure from OpenRouter's minimax-m2:free model
    const delta = {
      role: "assistant",
      content: "",
      reasoning_details: [
        {
          type: "reasoning.text",
          text: 'The user has just greeted me with "hi". They haven\'t asked me to connect to Ableton Live yet, so I should respond as Producer Pal and ask if they want to connect.',
          index: 0,
          format: null,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);
    expect(result).toBe(
      'The user has just greeted me with "hi". They haven\'t asked me to connect to Ableton Live yet, so I should respond as Producer Pal and ask if they want to connect.',
    );
  });

  it("should extract reasoning even when content is empty (common in reasoning models)", () => {
    const delta = {
      content: "",
      reasoning_details: [
        {
          type: "reasoning.text",
          text: "Reasoning text when content is empty",
          index: 0,
        },
      ],
    } as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta;

    const result = extractReasoningFromDelta(delta);
    expect(result).toBe("Reasoning text when content is empty");
  });
});

describe("OpenAIClient constructor", () => {
  it("initializes with default chat history when not provided", () => {
    const client = new OpenAIClient("test-key", {
      model: "gpt-4",
    });
    expect(client.chatHistory).toEqual([]);
  });

  it("uses provided chat history", () => {
    const history = [{ role: "user" as const, content: "Hello" }];
    const client = new OpenAIClient("test-key", {
      model: "gpt-4",
      chatHistory: history,
    });
    expect(client.chatHistory).toEqual(history);
  });

  it("adds system message when provided and history is empty", () => {
    const client = new OpenAIClient("test-key", {
      model: "gpt-4",
      systemInstruction: "You are a helpful assistant.",
    });
    expect(client.chatHistory).toHaveLength(1);
    expect(client.chatHistory[0]).toEqual({
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

    const toolCallsMap = new Map<number, OpenAIToolCall>([
      [
        0,
        {
          id: "call_123",
          type: "function",
          function: {
            name: "search",
            arguments: '{"query": "incomplete',
          },
        },
      ],
    ]);

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap,
      "",
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

    const toolCallsMap = new Map<number, OpenAIToolCall>([
      [
        0,
        {
          id: "call_123",
          type: "function",
          function: {
            name: "search",
            arguments: '{"query": "test"}',
          },
        },
      ],
    ]);

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap,
      "",
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

    const toolCallsMap = new Map<number, OpenAIToolCall>([
      [
        0,
        {
          id: "call_123",
          type: "function",
          function: {
            name: "search",
            arguments: '{"query": "test"}',
          },
        },
      ],
    ]);

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap,
      "",
      "tool_calls", // finish_reason indicates tool calls are complete
    );

    expect(result.tool_calls).toBeDefined();
    expect(result.tool_calls).toHaveLength(1);
    const toolCall = result.tool_calls?.[0];
    expect(toolCall?.id).toBe("call_123");
    if (toolCall?.type === "function") {
      expect(toolCall.function.name).toBe("search");
      expect(toolCall.function.arguments).toBe('{"query": "test"}');
    }
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
      "",
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
      "",
      "tool_calls",
    );

    expect(result.tool_calls).toBeUndefined();
  });

  it("should include reasoning_details when reasoning text is provided", () => {
    client = createTestClient();

    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "Answer",
    };

    const toolCallsMap = new Map<number, OpenAIToolCall>();

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap,
      "Thinking about this carefully...",
      "stop",
    );

    expect(result.reasoning_details).toBeDefined();
    expect(result.reasoning_details).toHaveLength(1);
    const reasoning = result.reasoning_details?.[0];
    expect(reasoning?.type).toBe("reasoning.text");
    expect(reasoning?.text).toBe("Thinking about this carefully...");
    expect(reasoning?.index).toBe(0);
  });

  it("should not include reasoning_details when reasoning text is empty", () => {
    client = createTestClient();

    const currentMessage: OpenAIAssistantMessageWithReasoning = {
      role: "assistant",
      content: "Answer",
    };

    const toolCallsMap = new Map<number, OpenAIToolCall>();

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap,
      "",
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

    const toolCallsMap = new Map<number, OpenAIToolCall>([
      [
        0,
        {
          id: "call_xyz",
          type: "function",
          function: {
            name: "analyze",
            arguments: '{"data": "test"}',
          },
        },
      ],
    ]);

    const result = client.buildStreamMessage(
      currentMessage,
      toolCallsMap,
      "I need to analyze this data...",
      "tool_calls",
    );

    expect(result.tool_calls).toBeDefined();
    expect(result.tool_calls).toHaveLength(1);
    expect(result.reasoning_details).toBeDefined();
    const reasoning = result.reasoning_details?.[0];
    expect(reasoning?.text).toBe("I need to analyze this data...");
  });
});
