// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createStreamState,
  extractReasoningText,
  processStreamEvent,
} from "#webui/chat/openai/responses-streaming";
import {
  type ResponsesConversationItem,
  type ResponsesOutputItem,
  type ResponsesStreamEvent,
} from "#webui/types/responses-api";

describe("createStreamState", () => {
  it("creates fresh state with empty values", () => {
    const state = createStreamState();

    expect(state.currentContent).toBe("");
    expect(state.currentReasoning).toBe("");
    expect(state.pendingFunctionCalls.size).toBe(0);
    expect(state.toolResults.size).toBe(0);
    expect(state.hasToolCalls).toBe(false);
    expect(state.outputItems).toStrictEqual([]);
    expect(state.streamingItemIndex).toBeNull();
  });
});

describe("extractReasoningText", () => {
  it("returns empty string for non-reasoning items", () => {
    const item = { type: "message" } as ResponsesOutputItem;

    expect(extractReasoningText(item)).toBe("");
  });

  it("extracts string summary", () => {
    const item = {
      type: "reasoning",
      summary: "My reasoning",
    } as unknown as ResponsesOutputItem;

    expect(extractReasoningText(item)).toBe("My reasoning");
  });

  it("extracts array summary", () => {
    const item = {
      type: "reasoning",
      summary: [{ text: "Step 1" }, { text: "Step 2" }],
    } as unknown as ResponsesOutputItem;

    expect(extractReasoningText(item)).toBe("Step 1\nStep 2");
  });

  it("handles array summary with missing text", () => {
    const item = {
      type: "reasoning",
      summary: [{ text: "Has text" }, {}, { text: "Also text" }],
    } as unknown as ResponsesOutputItem;

    expect(extractReasoningText(item)).toBe("Has text\nAlso text");
  });

  it("falls back to text property", () => {
    const item = {
      type: "reasoning",
      text: "Fallback text",
    } as unknown as ResponsesOutputItem;

    expect(extractReasoningText(item)).toBe("Fallback text");
  });

  it("returns empty string when no text found", () => {
    const item = { type: "reasoning" } as unknown as ResponsesOutputItem;

    expect(extractReasoningText(item)).toBe("");
  });
});

describe("processStreamEvent", () => {
  const createMockMcpClient = () => ({
    callTool: vi.fn().mockResolvedValue({ content: { result: "ok" } }),
  });

  it("handles reasoning delta and updates conversation", async () => {
    const state = createStreamState();
    const conversation: ResponsesConversationItem[] = [];
    const event: ResponsesStreamEvent = {
      type: "response.reasoning.delta",
      delta: { text: "thinking..." },
    };

    await processStreamEvent(event, state, createMockMcpClient(), conversation);

    expect(state.currentReasoning).toBe("thinking...");
    expect(conversation).toHaveLength(1);
    expect(conversation[0]).toMatchObject({
      type: "message",
      role: "assistant",
      content: "thinking...",
    });
    expect(state.streamingItemIndex).toBe(0);
  });

  it("handles reasoning delta with string delta", async () => {
    const state = createStreamState();
    const conversation: ResponsesConversationItem[] = [];
    const event: ResponsesStreamEvent = {
      type: "response.reasoning.delta",
      delta: "direct string",
    };

    await processStreamEvent(event, state, createMockMcpClient(), conversation);

    expect(state.currentReasoning).toBe("direct string");
    expect(conversation[0]).toMatchObject({ content: "direct string" });
  });

  it("handles output text delta and updates conversation", async () => {
    const state = createStreamState();
    const conversation: ResponsesConversationItem[] = [];
    const event: ResponsesStreamEvent = {
      type: "response.output_text.delta",
      delta: { text: "Hello" },
    };

    await processStreamEvent(event, state, createMockMcpClient(), conversation);

    expect(state.currentContent).toBe("Hello");
    expect(conversation).toHaveLength(1);
    expect(conversation[0]).toMatchObject({
      type: "message",
      role: "assistant",
      content: "Hello",
    });
  });

  it("accumulates multiple text deltas in same streaming message", async () => {
    const state = createStreamState();
    const conversation: ResponsesConversationItem[] = [];
    const mcpClient = createMockMcpClient();

    await processStreamEvent(
      { type: "response.output_text.delta", delta: { text: "Hello " } },
      state,
      mcpClient,
      conversation,
    );
    await processStreamEvent(
      { type: "response.output_text.delta", delta: { text: "world" } },
      state,
      mcpClient,
      conversation,
    );

    expect(state.currentContent).toBe("Hello world");
    // Should still be one message, not two
    expect(conversation).toHaveLength(1);
    expect(conversation[0]).toMatchObject({ content: "Hello world" });
  });

  it("handles output item added for function_call", async () => {
    const state = createStreamState();
    const event: ResponsesStreamEvent = {
      type: "response.output_item.added",
      item: {
        id: "item_1",
        type: "function_call",
        name: "get_weather",
        call_id: "call_123",
      },
    };

    await processStreamEvent(event, state, createMockMcpClient(), []);

    expect(state.hasToolCalls).toBe(true);
    expect(state.pendingFunctionCalls.get("item_1")).toStrictEqual({
      name: "get_weather",
      call_id: "call_123",
    });
  });

  it("ignores non-function_call items", async () => {
    const state = createStreamState();
    const event: ResponsesStreamEvent = {
      type: "response.output_item.added",
      item: { id: "item_1", type: "message" },
    };

    await processStreamEvent(event, state, createMockMcpClient(), []);

    expect(state.hasToolCalls).toBe(false);
    expect(state.pendingFunctionCalls.size).toBe(0);
  });

  it("handles function call arguments done", async () => {
    const state = createStreamState();

    state.pendingFunctionCalls.set("item_1", {
      name: "get_weather",
      call_id: "call_123",
    });
    const mcpClient = createMockMcpClient();

    const event: ResponsesStreamEvent = {
      type: "response.function_call_arguments.done",
      item_id: "item_1",
      arguments: '{"city":"NYC"}',
    };

    await processStreamEvent(event, state, mcpClient, []);

    expect(mcpClient.callTool).toHaveBeenCalledWith({
      name: "get_weather",
      arguments: { city: "NYC" },
    });
    expect(state.toolResults.get("call_123")).toBe('{"result":"ok"}');
  });

  it("skips function call if not in pending", async () => {
    const state = createStreamState();
    const mcpClient = createMockMcpClient();

    const event: ResponsesStreamEvent = {
      type: "response.function_call_arguments.done",
      item_id: "unknown_item",
      arguments: "{}",
    };

    await processStreamEvent(event, state, mcpClient, []);

    expect(mcpClient.callTool).not.toHaveBeenCalled();
  });

  it("skips function call if missing item_id or arguments", async () => {
    const state = createStreamState();
    const mcpClient = createMockMcpClient();

    await processStreamEvent(
      { type: "response.function_call_arguments.done" },
      state,
      mcpClient,
      [],
    );

    expect(mcpClient.callTool).not.toHaveBeenCalled();
  });

  it("handles response completed", async () => {
    const state = createStreamState();

    state.toolResults.set("call_1", '{"result":"done"}');
    const conversation: ResponsesConversationItem[] = [];

    const event: ResponsesStreamEvent = {
      type: "response.completed",
      response: {
        output: [
          { type: "message", id: "msg_1", role: "assistant", content: [] },
        ],
      },
    };

    await processStreamEvent(event, state, createMockMcpClient(), conversation);

    // Output items added to conversation
    expect(conversation).toHaveLength(2);
    expect(conversation[0]).toMatchObject({ type: "message" });
    // Tool result added
    expect(conversation[1]).toStrictEqual({
      type: "function_call_output",
      call_id: "call_1",
      output: '{"result":"done"}',
    });
  });

  it("handles response completed without output", async () => {
    const state = createStreamState();
    const conversation: ResponsesConversationItem[] = [];

    const event: ResponsesStreamEvent = {
      type: "response.completed",
      response: {},
    };

    await processStreamEvent(event, state, createMockMcpClient(), conversation);

    expect(conversation).toHaveLength(0);
  });

  it("removes streaming placeholder on response completed", async () => {
    const state = createStreamState();
    const conversation: ResponsesConversationItem[] = [];
    const mcpClient = createMockMcpClient();

    // First, simulate text streaming which creates a streaming message
    await processStreamEvent(
      { type: "response.output_text.delta", delta: { text: "Streaming..." } },
      state,
      mcpClient,
      conversation,
    );

    expect(conversation).toHaveLength(1);
    expect(state.streamingItemIndex).toBe(0);

    // Then response completes - streaming placeholder should be removed
    await processStreamEvent(
      {
        type: "response.completed",
        response: {
          output: [
            { type: "message", id: "msg_1", role: "assistant", content: [] },
          ],
        },
      },
      state,
      mcpClient,
      conversation,
    );

    // Streaming placeholder removed, final output added
    expect(conversation).toHaveLength(1);
    expect(conversation[0]).toMatchObject({ type: "message", id: "msg_1" });
    expect(state.streamingItemIndex).toBeNull();
  });

  it("ignores unknown event types", async () => {
    const state = createStreamState();

    await processStreamEvent(
      { type: "unknown.event" } as ResponsesStreamEvent,
      state,
      createMockMcpClient(),
      [],
    );

    // Should not throw, state unchanged
    expect(state.currentContent).toBe("");
  });
});
