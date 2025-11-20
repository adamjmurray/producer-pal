import { describe, expect, it } from "vitest";
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
  it("merges consecutive model messages and adds functionResponses to functionCalls ", () => {
    expect(formatGeminiMessages(history)).toStrictEqual(expected);
  });

  it("merges non-thought text with thoughtSignatures ", () => {
    expect(
      formatGeminiMessages(historyNonThoughtTextWithSignature),
    ).toStrictEqual(expectedNonThoughtTextWithSignature);
  });

  it("handles history ending with a thought ", () => {
    expect(formatGeminiMessages(historyEndingInThought)).toStrictEqual(
      expectedEndingInThought,
    );
  });

  it("handles tool call errors", () => {
    expect(formatGeminiMessages(historyWithToolError)).toStrictEqual(
      expectedWithToolError,
    );
  });

  it("merges error into existing model message", () => {
    expect(formatGeminiMessages(historyWithError)).toStrictEqual(
      expectedWithError,
    );
  });

  it("creates new model message for error when no preceding model exists", () => {
    expect(formatGeminiMessages(historyWithErrorNoModel)).toStrictEqual(
      expectedWithErrorNoModel,
    );
  });

  it("handles parallel tool calls", () => {
    expect(formatGeminiMessages(parallelToolCallHistory)).toStrictEqual(
      expectedParallelToolCalls,
    );
  });
});
