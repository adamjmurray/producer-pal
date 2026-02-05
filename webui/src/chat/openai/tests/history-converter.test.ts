// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  chatToResponsesHistory,
  responsesToChatHistory,
} from "#webui/chat/openai/history-converter";
import type { OpenAIMessage } from "#webui/types/messages";
import type { ResponsesConversationItem } from "#webui/types/responses-api";

describe("chatToResponsesHistory", () => {
  it("converts user message", () => {
    const messages: OpenAIMessage[] = [{ role: "user", content: "Hello" }];

    const result = chatToResponsesHistory(messages);

    expect(result).toStrictEqual([
      { type: "message", role: "user", content: "Hello" },
    ]);
  });

  it("converts system message", () => {
    const messages: OpenAIMessage[] = [
      { role: "system", content: "You are helpful" },
    ];

    const result = chatToResponsesHistory(messages);

    expect(result).toStrictEqual([
      { type: "message", role: "system", content: "You are helpful" },
    ]);
  });

  it("converts assistant message with content", () => {
    const messages: OpenAIMessage[] = [
      { role: "assistant", content: "Hi there!" },
    ];

    const result = chatToResponsesHistory(messages);

    expect(result).toStrictEqual([
      { type: "message", role: "assistant", content: "Hi there!" },
    ]);
  });

  it("converts assistant message with tool calls", () => {
    const messages: OpenAIMessage[] = [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_123",
            type: "function",
            function: { name: "get_weather", arguments: '{"city":"NYC"}' },
          },
        ],
      },
    ];

    const result = chatToResponsesHistory(messages);

    expect(result).toStrictEqual([
      {
        type: "function_call",
        id: "call_123",
        call_id: "call_123",
        name: "get_weather",
        arguments: '{"city":"NYC"}',
      },
    ]);
  });

  it("converts assistant message with content AND tool calls", () => {
    const messages: OpenAIMessage[] = [
      {
        role: "assistant",
        content: "Let me check that",
        tool_calls: [
          {
            id: "call_123",
            type: "function",
            function: { name: "search", arguments: "{}" },
          },
        ],
      },
    ];

    const result = chatToResponsesHistory(messages);

    expect(result).toHaveLength(2);
    expect(result[0]).toStrictEqual({
      type: "message",
      role: "assistant",
      content: "Let me check that",
    });
    expect(result[1]).toMatchObject({
      type: "function_call",
      name: "search",
    });
  });

  it("converts tool message", () => {
    const messages: OpenAIMessage[] = [
      { role: "tool", tool_call_id: "call_123", content: '{"result":42}' },
    ];

    const result = chatToResponsesHistory(messages);

    expect(result).toStrictEqual([
      {
        type: "function_call_output",
        call_id: "call_123",
        output: '{"result":42}',
      },
    ]);
  });

  it("handles non-string content gracefully", () => {
    const messages: OpenAIMessage[] = [
      { role: "user", content: null as unknown as string },
    ];

    const result = chatToResponsesHistory(messages);

    expect(result).toStrictEqual([
      { type: "message", role: "user", content: "" },
    ]);
  });

  it("converts complete conversation", () => {
    const messages: OpenAIMessage[] = [
      { role: "system", content: "Be helpful" },
      { role: "user", content: "Weather?" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "tc_1",
            type: "function",
            function: { name: "get_weather", arguments: "{}" },
          },
        ],
      },
      { role: "tool", tool_call_id: "tc_1", content: "Sunny" },
      { role: "assistant", content: "It's sunny!" },
    ];

    const result = chatToResponsesHistory(messages);

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.type)).toStrictEqual([
      "message",
      "message",
      "function_call",
      "function_call_output",
      "message",
    ]);
  });
});

describe("responsesToChatHistory", () => {
  it("converts user message", () => {
    const items: ResponsesConversationItem[] = [
      { type: "message", role: "user", content: "Hello" },
    ];

    const result = responsesToChatHistory(items);

    expect(result).toStrictEqual([{ role: "user", content: "Hello" }]);
  });

  it("converts system message", () => {
    const items: ResponsesConversationItem[] = [
      { type: "message", role: "system", content: "Be helpful" },
    ];

    const result = responsesToChatHistory(items);

    expect(result).toStrictEqual([{ role: "system", content: "Be helpful" }]);
  });

  it("converts assistant message", () => {
    const items: ResponsesConversationItem[] = [
      { type: "message", role: "assistant", content: "Hi!" },
    ];

    const result = responsesToChatHistory(items);

    expect(result).toStrictEqual([{ role: "assistant", content: "Hi!" }]);
  });

  it("converts function_call and attaches to assistant", () => {
    const items: ResponsesConversationItem[] = [
      {
        type: "function_call",
        id: "fc_1",
        call_id: "call_123",
        name: "get_weather",
        arguments: '{"city":"NYC"}',
      },
    ];

    const result = responsesToChatHistory(items);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call_123",
          type: "function",
          function: { name: "get_weather", arguments: '{"city":"NYC"}' },
        },
      ],
    });
  });

  it("converts function_call_output to tool message", () => {
    const items: ResponsesConversationItem[] = [
      { type: "function_call_output", call_id: "call_123", output: "Sunny" },
    ];

    const result = responsesToChatHistory(items);

    expect(result).toStrictEqual([
      { role: "tool", tool_call_id: "call_123", content: "Sunny" },
    ]);
  });

  it("handles array content format", () => {
    const items: ResponsesConversationItem[] = [
      {
        type: "message",
        role: "assistant",
        content: [
          { type: "output_text", text: "Hello " },
          { type: "output_text", text: "world" },
        ],
      },
    ];

    const result = responsesToChatHistory(items);

    expect(result[0]!.content).toBe("Hello world");
  });

  it("converts complete conversation round-trip", () => {
    const items: ResponsesConversationItem[] = [
      { type: "message", role: "user", content: "Weather?" },
      { type: "message", role: "assistant", content: "Let me check" },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "tc_1",
        name: "get_weather",
        arguments: "{}",
      },
      { type: "function_call_output", call_id: "tc_1", output: "Sunny" },
      { type: "message", role: "assistant", content: "It's sunny!" },
    ];

    const result = responsesToChatHistory(items);

    // function_call is grouped with preceding assistant message
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.role)).toStrictEqual([
      "user",
      "assistant", // Contains both content and tool_calls
      "tool",
      "assistant",
    ]);
    // Verify the assistant message has the tool call attached
    expect(result[1]).toMatchObject({
      role: "assistant",
      content: "Let me check",
      tool_calls: [{ id: "tc_1", function: { name: "get_weather" } }],
    });
  });

  it("groups multiple tool calls under one assistant message", () => {
    const items: ResponsesConversationItem[] = [
      { type: "message", role: "assistant", content: "Checking..." },
      {
        type: "function_call",
        id: "fc_1",
        call_id: "tc_1",
        name: "tool1",
        arguments: "{}",
      },
      {
        type: "function_call",
        id: "fc_2",
        call_id: "tc_2",
        name: "tool2",
        arguments: "{}",
      },
      { type: "function_call_output", call_id: "tc_1", output: "r1" },
    ];

    const result = responsesToChatHistory(items);

    // First assistant message has both tool calls
    expect(result[0]).toMatchObject({
      role: "assistant",
      content: "Checking...",
      tool_calls: [
        { id: "tc_1", function: { name: "tool1" } },
        { id: "tc_2", function: { name: "tool2" } },
      ],
    });
  });
});
