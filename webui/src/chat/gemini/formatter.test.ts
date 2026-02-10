// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  expectValidTimestamps,
  stripTimestamps,
} from "#webui/test-utils/message-test-helpers";
import { formatGeminiMessages } from "./formatter";
import { expected, history } from "./test-cases/formatter/basic-test-case";
import {
  expectedWithError,
  expectedWithErrorNoModel,
  historyWithError,
  historyWithErrorNoModel,
} from "./test-cases/formatter/error-test-cases";
import {
  expectedEndingInThought,
  historyEndingInThought,
} from "./test-cases/formatter/history-ending-in-thought-test-case";
import {
  expected as expectedParallelToolCalls,
  parallelToolCallHistory,
} from "./test-cases/formatter/parallel-tool-calls-test-case";
import {
  expectedNonThoughtTextWithSignature,
  historyNonThoughtTextWithSignature,
} from "./test-cases/formatter/thought-signatures-test-case";
import {
  expectedWithToolError,
  historyWithToolError,
} from "./test-cases/formatter/tool-call-error-test-case";

describe("formatGeminiMessages", () => {
  it("merges consecutive model messages and adds functionResponses to functionCalls", () => {
    const result = formatGeminiMessages(history);

    expect(stripTimestamps(result)).toStrictEqual(expected);
    expectValidTimestamps(result);
  });

  it("merges non-thought text with thoughtSignatures", () => {
    const result = formatGeminiMessages(historyNonThoughtTextWithSignature);

    expect(stripTimestamps(result)).toStrictEqual(
      expectedNonThoughtTextWithSignature,
    );
    expectValidTimestamps(result);
  });

  it("handles history ending with a thought", () => {
    const result = formatGeminiMessages(historyEndingInThought);

    expect(stripTimestamps(result)).toStrictEqual(expectedEndingInThought);
    expectValidTimestamps(result);
  });

  it("handles tool call errors", () => {
    const result = formatGeminiMessages(historyWithToolError);

    expect(stripTimestamps(result)).toStrictEqual(expectedWithToolError);
    expectValidTimestamps(result);
  });

  it("merges error into existing model message", () => {
    const result = formatGeminiMessages(historyWithError);

    expect(stripTimestamps(result)).toStrictEqual(expectedWithError);
    expectValidTimestamps(result);
  });

  it("creates new model message for error when no preceding model exists", () => {
    const result = formatGeminiMessages(historyWithErrorNoModel);

    expect(stripTimestamps(result)).toStrictEqual(expectedWithErrorNoModel);
    expectValidTimestamps(result);
  });

  it("handles parallel tool calls", () => {
    const result = formatGeminiMessages(parallelToolCallHistory);

    expect(stripTimestamps(result)).toStrictEqual(expectedParallelToolCalls);
    expectValidTimestamps(result);
  });

  it("logs error for function response without matching function call", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const testHistory = [
      {
        role: "model" as const,
        parts: [{ text: "Let me check" }],
      },
      {
        role: "user" as const,
        parts: [
          {
            functionResponse: {
              name: "orphan_tool",
              response: { content: [{ text: "result" }] },
            },
          },
        ],
      },
    ];

    const result = formatGeminiMessages(testHistory);

    expect(result).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith(
      "Missing corresponding function call for function response",
      expect.any(String),
    );
    spy.mockRestore();
  });

  it("handles text after tool part without merging", () => {
    const testHistory = [
      {
        role: "model" as const,
        parts: [{ functionCall: { name: "test_tool", args: {} } }],
      },
      {
        role: "user" as const,
        parts: [
          {
            functionResponse: {
              name: "test_tool",
              response: { content: [{ text: "result" }] },
            },
          },
        ],
      },
      {
        role: "model" as const,
        parts: [{ text: "After tool" }],
      },
    ];

    const result = formatGeminiMessages(testHistory);

    expect(result).toHaveLength(1);
    const parts = result[0]!.parts;

    // Tool part followed by text part (not merged)
    expect(parts).toHaveLength(2);
    expect(parts[0]!.type).toBe("tool");
    expect(parts[1]!.type).toBe("text");
  });

  it("handles error message with non-text parts", () => {
    const testHistory = [
      {
        role: "error" as const,
        parts: [{ text: undefined } as unknown as { text: string }],
      },
    ];

    const result = formatGeminiMessages(testHistory);

    // Error with no text is still created as a model message, but no error parts
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("model");
    expect(result[0]!.parts).toStrictEqual([]);
  });

  it("handles empty parts array", () => {
    const testHistory = [{ role: "model" as const, parts: [] }];

    const result = formatGeminiMessages(testHistory);

    expect(result).toHaveLength(1);
    expect(result[0]!.parts).toStrictEqual([]);
  });

  it("does not merge thought text into regular text", () => {
    const testHistory = [
      {
        role: "model" as const,
        parts: [
          { text: "Regular text" },
          { text: "Thought text", thought: true },
        ],
      },
    ];

    const result = formatGeminiMessages(testHistory);

    expect(result).toHaveLength(1);
    expect(result[0]!.parts).toHaveLength(2);
    expect(result[0]!.parts[0]).toMatchObject({
      type: "text",
      content: "Regular text",
    });
    expect(result[0]!.parts[1]).toMatchObject({
      type: "thought",
      content: "Thought text",
    });
  });

  it("does not merge regular text into thought text", () => {
    const testHistory = [
      {
        role: "model" as const,
        parts: [
          { text: "Thought text", thought: true },
          { text: "Regular text" },
        ],
      },
    ];

    const result = formatGeminiMessages(testHistory);

    expect(result).toHaveLength(1);
    expect(result[0]!.parts).toHaveLength(2);
    expect(result[0]!.parts[0]).toMatchObject({
      type: "thought",
      content: "Thought text",
    });
    expect(result[0]!.parts[1]).toMatchObject({
      type: "text",
      content: "Regular text",
    });
  });

  it("handles function call with missing name and args", () => {
    const testHistory = [
      {
        role: "model" as const,
        parts: [{ functionCall: {} }],
      },
    ];

    const result = formatGeminiMessages(testHistory);

    expect(result).toHaveLength(1);
    const toolPart = result[0]!.parts[0]!;

    expect(toolPart).toMatchObject({
      type: "tool",
      name: "",
      args: {},
    });
  });

  it("handles error after user message (not merging into model)", () => {
    const testHistory = [
      {
        role: "user" as const,
        parts: [{ text: "Hello" }],
      },
      {
        role: "error" as const,
        parts: [{ text: "Connection failed" }],
      },
    ];

    const result = formatGeminiMessages(testHistory);

    expect(result).toHaveLength(2);
    expect(result[0]!.role).toBe("user");
    expect(result[1]!.role).toBe("model");
    expect(result[1]!.parts).toStrictEqual([
      { type: "error", content: "Connection failed", isError: true },
    ]);
  });

  it("handles function response with error", () => {
    const testHistory = [
      {
        role: "model" as const,
        parts: [{ functionCall: { name: "test_tool", args: {} } }],
      },
      {
        role: "user" as const,
        parts: [
          {
            functionResponse: {
              name: "test_tool",
              response: {
                error: { content: [{ text: "error message" }] },
              },
            },
          },
        ],
      },
    ];

    const result = formatGeminiMessages(testHistory);

    expect(result).toHaveLength(1);
    const toolPart = result[0]!.parts[0]!;

    expect(toolPart).toMatchObject({
      type: "tool",
      result: "error message",
      isError: true,
    });
  });
});
