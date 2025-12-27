import { describe, expect, it } from "vitest";
import type { UIMessage } from "../types/messages";
import { formatGeminiMessages } from "./gemini-formatter";
import {
  expected,
  history,
} from "./test-cases/gemini-formatter/basic-test-case";
import {
  expectedWithError,
  expectedWithErrorNoModel,
  historyWithError,
  historyWithErrorNoModel,
} from "./test-cases/gemini-formatter/error-test-cases";
import {
  expectedEndingInThought,
  historyEndingInThought,
} from "./test-cases/gemini-formatter/history-ending-in-thought-test-case";
import {
  expected as expectedParallelToolCalls,
  parallelToolCallHistory,
} from "./test-cases/gemini-formatter/parallel-tool-calls-test-case";
import {
  expectedNonThoughtTextWithSignature,
  historyNonThoughtTextWithSignature,
} from "./test-cases/gemini-formatter/thought-signatures-test-case";
import {
  expectedWithToolError,
  historyWithToolError,
} from "./test-cases/gemini-formatter/tool-call-error-test-case";

/**
 * Strip timestamps from UIMessages for comparison (timestamps are dynamic)
 * @param {UIMessage[]} messages - Messages with timestamps
 * @returns {Omit<UIMessage, "timestamp">[]} Messages without timestamps
 */
function stripTimestamps(
  messages: UIMessage[],
): Omit<UIMessage, "timestamp">[] {
  return messages.map(({ timestamp: _, ...rest }) => rest);
}

describe("formatGeminiMessages", () => {
  it("merges consecutive model messages and adds functionResponses to functionCalls ", () => {
    const result = formatGeminiMessages(history);
    expect(stripTimestamps(result)).toStrictEqual(expected);
    expect(result.every((m) => typeof m.timestamp === "number")).toBe(true);
  });

  it("merges non-thought text with thoughtSignatures ", () => {
    const result = formatGeminiMessages(historyNonThoughtTextWithSignature);
    expect(stripTimestamps(result)).toStrictEqual(
      expectedNonThoughtTextWithSignature,
    );
    expect(result.every((m) => typeof m.timestamp === "number")).toBe(true);
  });

  it("handles history ending with a thought ", () => {
    const result = formatGeminiMessages(historyEndingInThought);
    expect(stripTimestamps(result)).toStrictEqual(expectedEndingInThought);
    expect(result.every((m) => typeof m.timestamp === "number")).toBe(true);
  });

  it("handles tool call errors", () => {
    const result = formatGeminiMessages(historyWithToolError);
    expect(stripTimestamps(result)).toStrictEqual(expectedWithToolError);
    expect(result.every((m) => typeof m.timestamp === "number")).toBe(true);
  });

  it("merges error into existing model message", () => {
    const result = formatGeminiMessages(historyWithError);
    expect(stripTimestamps(result)).toStrictEqual(expectedWithError);
    expect(result.every((m) => typeof m.timestamp === "number")).toBe(true);
  });

  it("creates new model message for error when no preceding model exists", () => {
    const result = formatGeminiMessages(historyWithErrorNoModel);
    expect(stripTimestamps(result)).toStrictEqual(expectedWithErrorNoModel);
    expect(result.every((m) => typeof m.timestamp === "number")).toBe(true);
  });

  it("handles parallel tool calls", () => {
    const result = formatGeminiMessages(parallelToolCallHistory);
    expect(stripTimestamps(result)).toStrictEqual(expectedParallelToolCalls);
    expect(result.every((m) => typeof m.timestamp === "number")).toBe(true);
  });
});
