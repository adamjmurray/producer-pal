import { describe, expect, it } from "vitest";
import { formatOpenAIMessages } from "./openai-formatter";
import {
  expected,
  history,
} from "./test-cases/openai-formatter/basic-test-case";
import {
  expectedWithEmptyToolCallArgs,
  historyWithEmptyToolCallArgs,
} from "./test-cases/openai-formatter/empty-tool-call-args";

describe("formatOpenAIMessages", () => {
  it("handles the initial 'Connect to Ableton' flow  ", () => {
    expect(formatOpenAIMessages(history)).toStrictEqual(expected);
  });

  it("handles tool calls with empty arguments ", () => {
    expect(formatOpenAIMessages(historyWithEmptyToolCallArgs)).toStrictEqual(
      expectedWithEmptyToolCallArgs,
    );
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
    expect(result[0]!.parts).toEqual([
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
    expect(result[0]!.parts).toEqual([
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
    expect(lastPart).toEqual({
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
    expect(result[0]!.parts).toEqual([
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
    expect(result[0]!.parts).toEqual([
      {
        type: "thought",
        content: "First thought Second thought",
        isOpen: true,
      },
    ]);
  });
});
