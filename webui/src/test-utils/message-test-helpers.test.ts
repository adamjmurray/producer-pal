import { describe, expect, it } from "vitest";
import type { UIMessage } from "#webui/types/messages";
import { expectValidTimestamps, stripTimestamps } from "./message-test-helpers";

describe("stripTimestamps", () => {
  it("removes timestamp from a single message", () => {
    const messages: UIMessage[] = [
      {
        role: "user",
        parts: [{ type: "text", content: "Hello" }],
        rawHistoryIndex: 0,
        timestamp: 1234567890,
      },
    ];

    const result = stripTimestamps(messages);

    expect(result).toStrictEqual([
      {
        role: "user",
        parts: [{ type: "text", content: "Hello" }],
        rawHistoryIndex: 0,
      },
    ]);
    expect(result[0]).not.toHaveProperty("timestamp");
  });

  it("removes timestamps from multiple messages", () => {
    const messages: UIMessage[] = [
      {
        role: "user",
        parts: [{ type: "text", content: "Hello" }],
        rawHistoryIndex: 0,
        timestamp: 1000,
      },
      {
        role: "model",
        parts: [{ type: "text", content: "Hi there" }],
        rawHistoryIndex: 1,
        timestamp: 2000,
      },
    ];

    const result = stripTimestamps(messages);

    expect(result).toHaveLength(2);
    expect(result[0]).not.toHaveProperty("timestamp");
    expect(result[1]).not.toHaveProperty("timestamp");
  });

  it("returns empty array for empty input", () => {
    const result = stripTimestamps([]);

    expect(result).toStrictEqual([]);
  });

  it("preserves all other message properties", () => {
    const messages: UIMessage[] = [
      {
        role: "model",
        parts: [
          { type: "thought", content: "Thinking..." },
          { type: "text", content: "Response" },
          { type: "tool", name: "test", args: { a: 1 }, result: "ok" },
        ],
        rawHistoryIndex: 5,
        timestamp: 9999,
      },
    ];

    const result = stripTimestamps(messages);

    expect(result[0]).toStrictEqual({
      role: "model",
      parts: [
        { type: "thought", content: "Thinking..." },
        { type: "text", content: "Response" },
        { type: "tool", name: "test", args: { a: 1 }, result: "ok" },
      ],
      rawHistoryIndex: 5,
    });
  });
});

describe("expectValidTimestamps", () => {
  it("passes for messages with numeric timestamps", () => {
    const messages: UIMessage[] = [
      {
        role: "user",
        parts: [],
        rawHistoryIndex: 0,
        timestamp: Date.now(),
      },
      {
        role: "model",
        parts: [],
        rawHistoryIndex: 1,
        timestamp: 1234567890,
      },
    ];

    expect(() => expectValidTimestamps(messages)).not.toThrow();
  });

  it("passes for empty array", () => {
    expect(() => expectValidTimestamps([])).not.toThrow();
  });

  it("fails when timestamp is not a number", () => {
    const messages = [
      {
        role: "user" as const,
        parts: [],
        rawHistoryIndex: 0,
        timestamp: "not a number" as unknown as number,
      },
    ];

    expect(() => expectValidTimestamps(messages)).toThrow();
  });

  it("fails when timestamp is undefined", () => {
    const messages = [
      {
        role: "user" as const,
        parts: [],
        rawHistoryIndex: 0,
        timestamp: undefined as unknown as number,
      },
    ];

    expect(() => expectValidTimestamps(messages)).toThrow();
  });
});
