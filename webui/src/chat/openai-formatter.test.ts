import { describe, expect, it } from "vitest";
import { formatOpenAIMessages } from "./openai-formatter.js";
import {
  expected,
  history,
} from "./test-cases/openai-formatter/basic-test-case.js";
import {
  expectedWithEmptyToolCallArgs,
  historyWithEmptyToolCallArgs,
} from "./test-cases/openai-formatter/empty-tool-call-args.js";

describe("formatOpenAIMessages", () => {
  it("handles the initial 'Connect to Ableton' flow  ", () => {
    expect(formatOpenAIMessages(history)).toStrictEqual(expected);
  });

  it("handles tool calls with empty arguments ", () => {
    expect(formatOpenAIMessages(historyWithEmptyToolCallArgs)).toStrictEqual(
      expectedWithEmptyToolCallArgs,
    );
  });
});
