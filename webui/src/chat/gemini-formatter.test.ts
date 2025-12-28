import { describe, expect, it } from "vitest";
import {
  expectValidTimestamps,
  stripTimestamps,
} from "#webui/test-utils/message-test-utils";
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
});
