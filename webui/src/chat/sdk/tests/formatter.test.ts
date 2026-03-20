// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  expectValidTimestamps,
  stripTimestamps,
} from "#webui/test-utils/message-test-helpers";
import { type ChatMessage } from "#webui/chat/sdk/types";
import { formatChatMessages } from "#webui/chat/sdk/formatter";

describe("formatChatMessages", () => {
  it("returns empty array for empty history", () => {
    expect(formatChatMessages([])).toStrictEqual([]);
  });

  it("formats a user message", () => {
    const history: ChatMessage[] = [{ role: "user", content: "Hello" }];
    const result = formatChatMessages(history);

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

  it("formats an assistant text message", () => {
    const history: ChatMessage[] = [{ role: "assistant", content: "Hi there" }];
    const result = formatChatMessages(history);

    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("model");
    expect(result[0]!.parts).toStrictEqual([
      { type: "text", content: "Hi there" },
    ]);
  });

  it("formats reasoning as thought parts", () => {
    const history: ChatMessage[] = [
      { role: "assistant", content: "Answer", reasoning: "Thinking..." },
    ];
    const result = formatChatMessages(history);

    expect(result[0]!.parts).toStrictEqual([
      { type: "thought", content: "Thinking..." },
      { type: "text", content: "Answer" },
    ]);
  });

  it("formats tool calls with results", () => {
    const history: ChatMessage[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "ppal-connect", args: {} }],
        toolResults: [
          { id: "tc1", name: "ppal-connect", args: {}, result: "Connected" },
        ],
      },
    ];
    const result = formatChatMessages(history);

    expect(result[0]!.parts).toStrictEqual([
      {
        type: "tool",
        name: "ppal-connect",
        args: {},
        result: '"Connected"',
        isError: undefined,
      },
    ]);
  });

  it("formats tool calls without results", () => {
    const history: ChatMessage[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "ppal-connect", args: {} }],
      },
    ];
    const result = formatChatMessages(history);

    expect(result[0]!.parts).toStrictEqual([
      {
        type: "tool",
        name: "ppal-connect",
        args: {},
        result: null,
        isError: undefined,
      },
    ]);
  });

  it("marks error results", () => {
    const history: ChatMessage[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "ppal-read", args: {} }],
        toolResults: [
          {
            id: "tc1",
            name: "ppal-read",
            args: {},
            result: "Something failed",
            isError: true,
          },
        ],
      },
    ];
    const result = formatChatMessages(history);
    const toolPart = result[0]!.parts[0]!;

    expect(toolPart.type).toBe("tool");
    expect(toolPart).toHaveProperty("isError", true);
  });

  it("merges consecutive assistant messages into one UI message", () => {
    const history: ChatMessage[] = [
      { role: "assistant", content: "First" },
      { role: "assistant", content: " second" },
    ];
    const result = formatChatMessages(history);

    // Two assistant messages merge into a single UI message with combined text
    expect(result).toHaveLength(1);
    expect(result[0]!.parts).toStrictEqual([
      { type: "text", content: "First second" },
    ]);
  });

  it("does not merge messages with different roles", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
      { role: "user", content: "Bye" },
    ];
    const result = formatChatMessages(history);

    expect(result).toHaveLength(3);
  });

  it("tracks rawHistoryIndex correctly", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "Q2" },
    ];
    const result = formatChatMessages(history);

    expect(result[0]!.rawHistoryIndex).toBe(0);
    expect(result[1]!.rawHistoryIndex).toBe(1);
    expect(result[2]!.rawHistoryIndex).toBe(2);
  });

  it("marks the last thought as open", () => {
    const history: ChatMessage[] = [
      { role: "assistant", content: "", reasoning: "Thinking..." },
    ];
    const result = formatChatMessages(history);
    const thoughtPart = result[0]!.parts[0]!;

    expect(thoughtPart.type).toBe("thought");
    expect(thoughtPart).toHaveProperty("isOpen", true);
  });

  it("handles assistant with reasoning, text, and tools", () => {
    const history: ChatMessage[] = [
      {
        role: "assistant",
        content: "Here's the result",
        reasoning: "Let me think",
        toolCalls: [{ id: "tc1", name: "ppal-read", args: { id: "1" } }],
        toolResults: [
          { id: "tc1", name: "ppal-read", args: { id: "1" }, result: "data" },
        ],
      },
    ];
    const result = formatChatMessages(history);

    expect(result[0]!.parts).toHaveLength(3);
    expect(result[0]!.parts[0]!.type).toBe("thought");
    expect(result[0]!.parts[1]!.type).toBe("text");
    expect(result[0]!.parts[2]!.type).toBe("tool");
  });

  it("skips empty content for assistant messages", () => {
    const history: ChatMessage[] = [{ role: "assistant", content: "" }];
    const result = formatChatMessages(history);

    expect(result[0]!.parts).toStrictEqual([]);
  });

  it("preserves responseModel on assistant messages", () => {
    const history: ChatMessage[] = [
      {
        role: "assistant",
        content: "Hello",
        responseModel: "gpt-4o-2024-08-06",
      },
    ];
    const result = formatChatMessages(history);

    expect(result[0]!.responseModel).toBe("gpt-4o-2024-08-06");
  });

  it("appends reasoning to existing thought part in merged messages", () => {
    const history: ChatMessage[] = [
      { role: "assistant", content: "", reasoning: "Part 1" },
      { role: "assistant", content: "Answer", reasoning: " Part 2" },
    ];
    const result = formatChatMessages(history);

    // Merged into one message; reasoning parts merge into one thought
    expect(result).toHaveLength(1);
    expect(result[0]!.parts[0]!.type).toBe("thought");
    expect(result[0]!.parts[0]).toHaveProperty("content", "Part 1 Part 2");
  });

  it("inserts step-usage part when merging tool step into text step", () => {
    const toolUsage = { inputTokens: 6078, outputTokens: 33 };
    const textUsage = { inputTokens: 9496, outputTokens: 195 };
    const history: ChatMessage[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "1", name: "ppal-connect", args: {} }],
        toolResults: [
          { id: "1", name: "ppal-connect", args: {}, result: "ok" },
        ],
        usage: toolUsage,
      },
      { role: "assistant", content: "Connected!", usage: textUsage },
    ];
    const result = formatChatMessages(history);

    expect(result).toHaveLength(1);

    const parts = result[0]!.parts;
    const stepUsagePart = parts.find((p) => p.type === "step-usage");

    expect(stepUsagePart).toBeDefined();
    expect(stepUsagePart).toHaveProperty("usage", toolUsage);
    expect(result[0]!.usage).toStrictEqual(textUsage);
  });

  it("does not insert step-usage for text-only merged messages", () => {
    const history: ChatMessage[] = [
      { role: "assistant", content: "Part 1", usage: { inputTokens: 100 } },
      { role: "assistant", content: "Part 2", usage: { inputTokens: 200 } },
    ];
    const result = formatChatMessages(history);

    expect(result).toHaveLength(1);
    expect(result[0]!.parts.every((p) => p.type !== "step-usage")).toBe(true);
  });
});
