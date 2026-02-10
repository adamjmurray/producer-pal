// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  expectValidTimestamps,
  stripTimestamps,
} from "#webui/test-utils/message-test-helpers";
import { formatOpenAIMessages } from "#webui/chat/openai/formatter";
import { expected, history } from "./test-cases/formatter/basic-test-case";
import {
  expectedWithEmptyToolCallArgs,
  historyWithEmptyToolCallArgs,
} from "./test-cases/formatter/empty-tool-call-args";

describe("formatOpenAIMessages", () => {
  it("handles the initial 'Connect to Ableton' flow", () => {
    const result = formatOpenAIMessages(history);

    expect(stripTimestamps(result)).toStrictEqual(expected);
    expectValidTimestamps(result);
  });

  it("handles tool calls with empty arguments", () => {
    const result = formatOpenAIMessages(historyWithEmptyToolCallArgs);

    expect(stripTimestamps(result)).toStrictEqual(
      expectedWithEmptyToolCallArgs,
    );
    expectValidTimestamps(result);
  });

  it("handles reasoning_details in assistant message", () => {
    const testHistory = [
      {
        role: "assistant" as const,
        content: "Hello",
        reasoning_details: [
          { type: "reasoning.text", text: "Thinking step 1", index: 0 },
          { type: "reasoning.text", text: " and step 2", index: 1 },
        ],
      },
    ];

    const result = formatOpenAIMessages(testHistory);

    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("model");
    expect(result[0]!.parts).toStrictEqual([
      { type: "thought", content: "Thinking step 1 and step 2" },
      { type: "text", content: "Hello" },
    ]);
  });

  it("merges consecutive text content from multiple messages", () => {
    const testHistory = [
      { role: "assistant" as const, content: "Hello " },
      { role: "assistant" as const, content: "world" },
    ];

    const result = formatOpenAIMessages(testHistory);

    expect(result).toHaveLength(1);
    expect(result[0]!.parts).toStrictEqual([
      { type: "text", content: "Hello world" },
    ]);
  });

  it("sets last thought part as open when it's the final part", () => {
    const testHistory = [
      {
        role: "assistant" as const,
        content: "",
        reasoning_details: [
          { type: "reasoning.text", text: "Current thinking...", index: 0 },
        ],
      },
    ];

    const result = formatOpenAIMessages(testHistory);

    expect(result).toHaveLength(1);
    const lastPart = result[0]!.parts.at(-1);

    expect(lastPart).toStrictEqual({
      type: "thought",
      content: "Current thinking...",
      isOpen: true,
    });
  });

  it("filters out non-text reasoning details", () => {
    const testHistory = [
      {
        role: "assistant" as const,
        content: "Response",
        reasoning_details: [
          { type: "reasoning.summary", summary: "Summary", index: 0 },
          { type: "reasoning.text", text: "Actual thought", index: 1 },
        ],
      },
    ];

    const result = formatOpenAIMessages(testHistory);

    expect(result).toHaveLength(1);
    expect(result[0]!.parts).toStrictEqual([
      { type: "thought", content: "Actual thought" },
      { type: "text", content: "Response" },
    ]);
  });

  it("merges reasoning into existing thought part", () => {
    const testHistory = [
      {
        role: "assistant" as const,
        content: "",
        reasoning_details: [
          { type: "reasoning.text", text: "First thought", index: 0 },
        ],
      },
      {
        role: "assistant" as const,
        content: "",
        reasoning_details: [
          { type: "reasoning.text", text: " Second thought", index: 0 },
        ],
      },
    ];

    const result = formatOpenAIMessages(testHistory);

    expect(result).toHaveLength(1);
    expect(result[0]!.parts).toStrictEqual([
      {
        type: "thought",
        content: "First thought Second thought",
        isOpen: true,
      },
    ]);
  });

  it("skips system messages and does not add content parts", () => {
    const testHistory = [
      { role: "system" as const, content: "You are a helpful assistant" },
      { role: "user" as const, content: "Hello" },
      { role: "assistant" as const, content: "Hi there!" },
    ];

    const result = formatOpenAIMessages(testHistory);

    // Should have user and model messages, system message should be skipped
    expect(result).toHaveLength(2);
    expect(result[0]!.role).toBe("user");
    expect(result[0]!.parts).toStrictEqual([
      { type: "text", content: "Hello" },
    ]);
    expect(result[1]!.role).toBe("model");
    expect(result[1]!.parts).toStrictEqual([
      { type: "text", content: "Hi there!" },
    ]);
  });

  it("skips tool messages and processes only user/assistant messages", () => {
    const testHistory = [
      { role: "user" as const, content: "Call a tool" },
      {
        role: "assistant" as const,
        content: null,
        tool_calls: [
          {
            id: "call_123",
            type: "function" as const,
            function: { name: "test_tool", arguments: "{}" },
          },
        ],
      },
      {
        role: "tool" as const,
        content: '{"result": "success"}',
        tool_call_id: "call_123",
      },
      { role: "assistant" as const, content: "Tool returned success" },
    ];

    const result = formatOpenAIMessages(testHistory);

    // User message, merged model messages (tool call + text response)
    // Tool message is skipped, consecutive assistant messages are merged
    expect(result).toHaveLength(2);
    expect(result[0]!.role).toBe("user");
    expect(result[1]!.role).toBe("model");
    // Should have tool call and text in merged parts
    expect(result[1]!.parts[0]!.type).toBe("tool");
    expect(result[1]!.parts[1]).toStrictEqual({
      type: "text",
      content: "Tool returned success",
    });
  });

  it("detects error indicators in tool results", () => {
    const testHistory = [
      {
        role: "assistant" as const,
        content: null,
        tool_calls: [
          {
            id: "call_err",
            type: "function" as const,
            function: { name: "test_tool", arguments: "{}" },
          },
        ],
      },
      {
        role: "tool" as const,
        content: '{"error": "something went wrong"}',
        tool_call_id: "call_err",
      },
    ];

    const result = formatOpenAIMessages(testHistory);

    expect(result).toHaveLength(1);
    const toolPart = result[0]!.parts[0]!;

    expect(toolPart).toMatchObject({
      type: "tool",
      isError: true,
    });
  });

  it("detects isError:true indicator in tool results", () => {
    const testHistory = [
      {
        role: "assistant" as const,
        content: null,
        tool_calls: [
          {
            id: "call_err2",
            type: "function" as const,
            function: { name: "test_tool", arguments: '{"key":"val"}' },
          },
        ],
      },
      {
        role: "tool" as const,
        content: '{"isError":true, "message":"failed"}',
        tool_call_id: "call_err2",
      },
    ];

    const result = formatOpenAIMessages(testHistory);

    expect(result).toHaveLength(1);
    const toolPart = result[0]!.parts[0]!;

    expect(toolPart).toMatchObject({
      type: "tool",
      isError: true,
    });
  });

  it("returns null result when no matching tool message is found", () => {
    const testHistory = [
      {
        role: "assistant" as const,
        content: null,
        tool_calls: [
          {
            id: "call_orphan",
            type: "function" as const,
            function: { name: "test_tool", arguments: "{}" },
          },
        ],
      },
    ];

    const result = formatOpenAIMessages(testHistory);

    expect(result).toHaveLength(1);
    const toolPart = result[0]!.parts[0]!;

    expect(toolPart).toMatchObject({
      type: "tool",
      result: null,
      isError: undefined,
    });
  });

  it("handles tool content that is not a string", () => {
    const testHistory = [
      {
        role: "assistant" as const,
        content: null,
        tool_calls: [
          {
            id: "call_arr",
            type: "function" as const,
            function: { name: "test_tool", arguments: "{}" },
          },
        ],
      },
      {
        role: "tool" as const,
        content: [{ type: "text", text: "array content" }] as unknown as string,
        tool_call_id: "call_arr",
      },
    ];

    const result = formatOpenAIMessages(testHistory);

    expect(result).toHaveLength(1);
    const toolPart = result[0]!.parts[0]!;

    // content is not a string, so falls back to ""
    expect(toolPart).toMatchObject({
      type: "tool",
      result: "",
    });
  });

  it("handles empty history", () => {
    const result = formatOpenAIMessages([]);

    expect(result).toStrictEqual([]);
  });

  it("handles assistant message with no content and no tool_calls", () => {
    const testHistory = [{ role: "assistant" as const, content: "" }];

    const result = formatOpenAIMessages(testHistory);

    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("model");
    expect(result[0]!.parts).toStrictEqual([]);
  });

  it("skips empty reasoning details array", () => {
    const testHistory = [
      {
        role: "assistant" as const,
        content: "Response",
        reasoning_details: [],
      },
    ];

    const result = formatOpenAIMessages(testHistory);

    expect(result).toHaveLength(1);
    expect(result[0]!.parts).toStrictEqual([
      { type: "text", content: "Response" },
    ]);
  });

  it("skips reasoning details with only non-text types", () => {
    const testHistory = [
      {
        role: "assistant" as const,
        content: "Response",
        reasoning_details: [
          { type: "reasoning.summary", summary: "Summary", index: 0 },
        ],
      },
    ];

    const result = formatOpenAIMessages(testHistory);

    expect(result).toHaveLength(1);
    expect(result[0]!.parts).toStrictEqual([
      { type: "text", content: "Response" },
    ]);
  });

  it("handles tool result with no error indicators", () => {
    const testHistory = [
      {
        role: "assistant" as const,
        content: null,
        tool_calls: [
          {
            id: "call_ok",
            type: "function" as const,
            function: { name: "test_tool", arguments: "{}" },
          },
        ],
      },
      {
        role: "tool" as const,
        content: '{"result": "all good"}',
        tool_call_id: "call_ok",
      },
    ];

    const result = formatOpenAIMessages(testHistory);

    expect(result).toHaveLength(1);
    const toolPart = result[0]!.parts[0]!;

    expect(toolPart).toMatchObject({
      type: "tool",
      isError: undefined,
      result: '{"result": "all good"}',
    });
  });
});
