import { describe, expect, it } from "vitest";
import {
  expected,
  history,
} from "./test-cases/gemini-formatter/basic-test-case.js";
import {
  expectedWithError,
  expectedWithErrorNoModel,
  historyWithError,
  historyWithErrorNoModel,
} from "./test-cases/gemini-formatter/error-test-cases.js";
import {
  expectedEndingInThought,
  historyEndingInThought,
} from "./test-cases/gemini-formatter/history-ending-in-thought-test-case.js";
import {
  expectedNonThoughtTextWithSignature,
  historyNonThoughtTextWithSignature,
} from "./test-cases/gemini-formatter/thought-signatures-test-case.js";
import {
  expectedWithToolError,
  historyWithToolError,
} from "./test-cases/gemini-formatter/tool-call-error-test-case.js";

import { formatGeminiMessages } from "./gemini-formatter.js";

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
});
