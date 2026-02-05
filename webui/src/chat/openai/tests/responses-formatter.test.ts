// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  expectValidTimestamps,
  stripTimestamps,
} from "#webui/test-utils/message-test-helpers";
import { formatResponsesMessages } from "#webui/chat/openai/responses-formatter";
import type { ResponsesConversationItem } from "#webui/types/responses-api";

describe("formatResponsesMessages", () => {
  it("formats a simple user message", () => {
    const conversation: ResponsesConversationItem[] = [
      { type: "message", role: "user", content: "Hello" },
    ];

    const result = formatResponsesMessages(conversation);

    expect(result).toHaveLength(1);
    expect(stripTimestamps(result)).toStrictEqual([
      {
        role: "user",
        parts: [{ type: "text", content: "Hello" }],
        rawHistoryIndex: 0,
      },
    ]);
    expectValidTimestamps(result);
  });

  it("formats a simple assistant message", () => {
    const conversation: ResponsesConversationItem[] = [
      { type: "message", role: "assistant", content: "Hi there!" },
    ];

    const result = formatResponsesMessages(conversation);

    expect(result).toHaveLength(1);
    expect(stripTimestamps(result)).toStrictEqual([
      {
        role: "model",
        parts: [{ type: "text", content: "Hi there!" }],
        rawHistoryIndex: 0,
      },
    ]);
  });

  it("handles array content format", () => {
    const conversation: ResponsesConversationItem[] = [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Hello world" }],
      },
    ];

    const result = formatResponsesMessages(conversation);

    expect(result[0]!.parts).toStrictEqual([
      { type: "text", content: "Hello world" },
    ]);
  });

  it("skips system messages", () => {
    const conversation: ResponsesConversationItem[] = [
      { type: "message", role: "system", content: "You are helpful" },
      { type: "message", role: "user", content: "Hi" },
    ];

    const result = formatResponsesMessages(conversation);

    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("user");
  });

  it("formats function_call with result", () => {
    const conversation: ResponsesConversationItem[] = [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_123",
        name: "get_weather",
        arguments: '{"city":"NYC"}',
      },
      {
        type: "function_call_output",
        call_id: "call_123",
        output: '{"temp":72}',
      },
    ];

    const result = formatResponsesMessages(conversation);

    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("model");
    expect(result[0]!.parts).toStrictEqual([
      {
        type: "tool",
        name: "get_weather",
        args: { city: "NYC" },
        result: '{"temp":72}',
        isError: undefined,
      },
    ]);
  });

  it("detects error in tool result", () => {
    const conversation: ResponsesConversationItem[] = [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_123",
        name: "do_something",
        arguments: "{}",
      },
      {
        type: "function_call_output",
        call_id: "call_123",
        output: '{"error":"Something went wrong"}',
      },
    ];

    const result = formatResponsesMessages(conversation);

    expect(result[0]!.parts[0]).toMatchObject({
      type: "tool",
      isError: true,
    });
  });

  it("merges consecutive assistant items within same response", () => {
    const conversation: ResponsesConversationItem[] = [
      { type: "message", role: "assistant", content: "Part 1 " },
      { type: "message", role: "assistant", content: "Part 2" },
    ];

    const result = formatResponsesMessages(conversation);

    expect(result).toHaveLength(1);
    expect(result[0]!.parts).toStrictEqual([
      { type: "text", content: "Part 1 Part 2" },
    ]);
  });

  it("merges all assistant items in a conversation turn", () => {
    const conversation: ResponsesConversationItem[] = [
      { type: "message", role: "assistant", content: "First response" },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "tool",
        arguments: "{}",
      },
      { type: "function_call_output", call_id: "call_1", output: "result" },
      { type: "message", role: "assistant", content: "Second response" },
    ];

    const result = formatResponsesMessages(conversation);

    expect(result).toHaveLength(1);
    expect(result[0]!.parts).toHaveLength(3); // text + tool + text
    expect(result[0]!.parts[0]).toMatchObject({
      type: "text",
      content: "First response",
    });
    expect(result[0]!.parts[1]).toMatchObject({ type: "tool", name: "tool" });
    expect(result[0]!.parts[2]).toMatchObject({
      type: "text",
      content: "Second response",
    });
  });

  it("marks last thought as open", () => {
    const conversation: ResponsesConversationItem[] = [
      { type: "message", role: "user", content: "Think about this" },
      // Simulate a reasoning item (cast through unknown since not in union)
      {
        type: "reasoning",
        summary: "Thinking...",
      } as unknown as ResponsesConversationItem,
    ];

    const result = formatResponsesMessages(conversation);

    expect(result).toHaveLength(2);
    const lastPart = result[1]!.parts.at(-1);

    expect(lastPart).toMatchObject({
      type: "thought",
      content: "Thinking...",
      isOpen: true,
    });
  });

  it("handles reasoning with array summary", () => {
    const conversation: ResponsesConversationItem[] = [
      {
        type: "reasoning",
        summary: [{ text: "Step 1" }, { text: "Step 2" }],
      } as unknown as ResponsesConversationItem,
    ];

    const result = formatResponsesMessages(conversation);

    expect(result[0]!.parts[0]).toMatchObject({
      type: "thought",
      content: "Step 1\nStep 2",
    });
  });

  it("handles function_call without result yet", () => {
    const conversation: ResponsesConversationItem[] = [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_pending",
        name: "pending_tool",
        arguments: "{}",
      },
    ];

    const result = formatResponsesMessages(conversation);

    expect(result[0]!.parts[0]).toMatchObject({
      type: "tool",
      name: "pending_tool",
      result: null,
    });
  });

  it("handles empty conversation", () => {
    const result = formatResponsesMessages([]);

    expect(result).toStrictEqual([]);
  });

  it("handles function_call with no arguments", () => {
    const conversation: ResponsesConversationItem[] = [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "no_args_tool",
        arguments: "",
      },
    ];

    const result = formatResponsesMessages(conversation);

    expect(result[0]!.parts[0]).toMatchObject({
      type: "tool",
      name: "no_args_tool",
      args: {},
    });
  });

  it("handles assistant message with empty content", () => {
    const conversation: ResponsesConversationItem[] = [
      { type: "message", role: "assistant", content: "" },
    ];

    const result = formatResponsesMessages(conversation);

    // Should create message but with no text parts (empty content is skipped)
    expect(result).toHaveLength(1);
    expect(result[0]!.parts).toStrictEqual([]);
  });

  it("handles reasoning item with empty summary", () => {
    const conversation: ResponsesConversationItem[] = [
      {
        type: "reasoning",
        summary: "",
      } as unknown as ResponsesConversationItem,
    ];

    const result = formatResponsesMessages(conversation);

    // Empty summary should not add a thought part
    expect(result).toHaveLength(1);
    expect(result[0]!.parts).toStrictEqual([]);
  });

  it("skips function_call_output with mismatched call_id", () => {
    const conversation: ResponsesConversationItem[] = [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "tool",
        arguments: "{}",
      },
      {
        type: "function_call_output",
        call_id: "call_different",
        output: "wrong result",
      },
    ];

    const result = formatResponsesMessages(conversation);

    // Result should be null since the call_id doesn't match
    expect(result[0]!.parts[0]).toMatchObject({
      type: "tool",
      result: null,
    });
  });

  it("handles array content with input_text type", () => {
    const conversation: ResponsesConversationItem[] = [
      {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "User " },
          { type: "input_text", text: "message" },
        ],
      },
    ];

    const result = formatResponsesMessages(conversation);

    expect(result[0]!.parts).toStrictEqual([
      { type: "text", content: "User message" },
    ]);
  });

  it("detects isError:true in tool result", () => {
    const conversation: ResponsesConversationItem[] = [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "tool",
        arguments: "{}",
      },
      {
        type: "function_call_output",
        call_id: "call_1",
        output: '{"isError":true,"message":"failed"}',
      },
    ];

    const result = formatResponsesMessages(conversation);

    expect(result[0]!.parts[0]).toMatchObject({
      type: "tool",
      isError: true,
    });
  });

  it("skips non-function_call_output items when searching for tool result", () => {
    const conversation: ResponsesConversationItem[] = [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_123",
        name: "my_tool",
        arguments: "{}",
      },
      // Intervening message item that should be skipped during search
      { type: "message", role: "assistant", content: "Some text" },
      {
        type: "function_call_output",
        call_id: "call_123",
        output: '{"result":"found"}',
      },
    ];

    const result = formatResponsesMessages(conversation);

    // Should find the result even with intervening items
    expect(result[0]!.parts[0]).toMatchObject({
      type: "tool",
      name: "my_tool",
      result: '{"result":"found"}',
    });
  });
});
