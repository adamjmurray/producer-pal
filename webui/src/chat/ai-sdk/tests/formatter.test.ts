// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  expectValidTimestamps,
  stripTimestamps,
} from "#webui/test-utils/message-test-helpers";
import { type AiSdkMessage } from "#webui/chat/ai-sdk/ai-sdk-types";
import { formatAiSdkMessages } from "#webui/chat/ai-sdk/formatter";

describe("formatAiSdkMessages", () => {
  it("returns empty array for empty history", () => {
    expect(formatAiSdkMessages([])).toStrictEqual([]);
  });

  it("formats a user message", () => {
    const history: AiSdkMessage[] = [{ role: "user", content: "Hello" }];
    const result = formatAiSdkMessages(history);

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
    const history: AiSdkMessage[] = [
      { role: "assistant", content: "Hi there" },
    ];
    const result = formatAiSdkMessages(history);

    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("model");
    expect(result[0]!.parts).toStrictEqual([
      { type: "text", content: "Hi there" },
    ]);
  });

  it("formats reasoning as thought parts", () => {
    const history: AiSdkMessage[] = [
      { role: "assistant", content: "Answer", reasoning: "Thinking..." },
    ];
    const result = formatAiSdkMessages(history);

    expect(result[0]!.parts).toStrictEqual([
      { type: "thought", content: "Thinking..." },
      { type: "text", content: "Answer" },
    ]);
  });

  it("formats tool calls with results", () => {
    const history: AiSdkMessage[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "ppal-connect", args: {} }],
        toolResults: [
          { id: "tc1", name: "ppal-connect", args: {}, result: "Connected" },
        ],
      },
    ];
    const result = formatAiSdkMessages(history);

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
    const history: AiSdkMessage[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "ppal-connect", args: {} }],
      },
    ];
    const result = formatAiSdkMessages(history);

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
    const history: AiSdkMessage[] = [
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
    const result = formatAiSdkMessages(history);
    const toolPart = result[0]!.parts[0]!;

    expect(toolPart.type).toBe("tool");
    expect(toolPart).toHaveProperty("isError", true);
  });

  it("merges consecutive assistant messages into one UI message", () => {
    const history: AiSdkMessage[] = [
      { role: "assistant", content: "First" },
      { role: "assistant", content: " second" },
    ];
    const result = formatAiSdkMessages(history);

    // Two assistant messages merge into a single UI message with combined text
    expect(result).toHaveLength(1);
    expect(result[0]!.parts).toStrictEqual([
      { type: "text", content: "First second" },
    ]);
  });

  it("does not merge messages with different roles", () => {
    const history: AiSdkMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
      { role: "user", content: "Bye" },
    ];
    const result = formatAiSdkMessages(history);

    expect(result).toHaveLength(3);
  });

  it("tracks rawHistoryIndex correctly", () => {
    const history: AiSdkMessage[] = [
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "Q2" },
    ];
    const result = formatAiSdkMessages(history);

    expect(result[0]!.rawHistoryIndex).toBe(0);
    expect(result[1]!.rawHistoryIndex).toBe(1);
    expect(result[2]!.rawHistoryIndex).toBe(2);
  });

  it("marks the last thought as open", () => {
    const history: AiSdkMessage[] = [
      { role: "assistant", content: "", reasoning: "Thinking..." },
    ];
    const result = formatAiSdkMessages(history);
    const thoughtPart = result[0]!.parts[0]!;

    expect(thoughtPart.type).toBe("thought");
    expect(thoughtPart).toHaveProperty("isOpen", true);
  });

  it("handles assistant with reasoning, text, and tools", () => {
    const history: AiSdkMessage[] = [
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
    const result = formatAiSdkMessages(history);

    expect(result[0]!.parts).toHaveLength(3);
    expect(result[0]!.parts[0]!.type).toBe("thought");
    expect(result[0]!.parts[1]!.type).toBe("text");
    expect(result[0]!.parts[2]!.type).toBe("tool");
  });

  it("skips empty content for assistant messages", () => {
    const history: AiSdkMessage[] = [{ role: "assistant", content: "" }];
    const result = formatAiSdkMessages(history);

    expect(result[0]!.parts).toStrictEqual([]);
  });

  it("appends reasoning to existing thought part in merged messages", () => {
    const history: AiSdkMessage[] = [
      { role: "assistant", content: "", reasoning: "Part 1" },
      { role: "assistant", content: "Answer", reasoning: " Part 2" },
    ];
    const result = formatAiSdkMessages(history);

    // Merged into one message; reasoning parts merge into one thought
    expect(result).toHaveLength(1);
    expect(result[0]!.parts[0]!.type).toBe("thought");
    expect(result[0]!.parts[0]).toHaveProperty("content", "Part 1 Part 2");
  });
});
