// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { buildReflectionPrompt } from "./self-reflection.ts";
import { type EvalAssertionResult } from "../types.ts";

/**
 * @param overrides - Partial overrides for the assertion result
 * @returns An EvalAssertionResult for a tool_called assertion
 */
function makeToolCalledResult(
  overrides: Partial<{
    tool: string;
    count: number;
    nameMatchCount: number;
    argsSpecified: boolean;
    message: string;
  }> = {},
): EvalAssertionResult {
  const {
    tool = "ppal-update-clip",
    count = 0,
    nameMatchCount = 0,
    argsSpecified = false,
    message = "Expected ppal-update-clip to be called",
  } = overrides;

  return {
    assertion: { type: "tool_called", tool },
    earned: 0,
    maxScore: 1,
    message,
    details: { matchingCalls: [], count, nameMatchCount, argsSpecified },
  };
}

describe("buildReflectionPrompt", () => {
  it("says 'didn't call any tool' when tool was not called at all", () => {
    const result = makeToolCalledResult({ nameMatchCount: 0 });
    const prompt = buildReflectionPrompt(result);

    expect(prompt).toContain("you didn't call any tool");
    expect(prompt).toContain("ppal-update-clip");
  });

  it("says 'arguments didn't match' when tool was called with wrong args", () => {
    const result = makeToolCalledResult({
      nameMatchCount: 1,
      count: 0,
      argsSpecified: true,
      message: "Expected with args matching {ids: Any<String>}",
    });
    const prompt = buildReflectionPrompt(result);

    expect(prompt).toContain("you called ppal-update-clip");
    expect(prompt).toContain("arguments didn't match");
    expect(prompt).toContain("args matching {ids: Any<String>}");
    expect(prompt).not.toContain("didn't call any tool");
  });

  it("uses generic message for other failures", () => {
    const result = makeToolCalledResult({
      nameMatchCount: 2,
      count: 2,
      message: "Expected exactly 3 time(s)",
    });
    const prompt = buildReflectionPrompt(result);

    expect(prompt).toContain("wasn't called as expected");
    expect(prompt).toContain("Expected exactly 3 time(s)");
  });

  it("handles custom assertion failures", () => {
    const result: EvalAssertionResult = {
      assertion: {
        type: "custom",
        description: "swing amount should decrease",
        assert: () => true,
      },
      earned: 0,
      maxScore: 1,
      message: "Error: swing did not decrease",
    };
    const prompt = buildReflectionPrompt(result);

    expect(prompt).toContain("swing amount should decrease");
    expect(prompt).toContain("check failed");
  });
});
