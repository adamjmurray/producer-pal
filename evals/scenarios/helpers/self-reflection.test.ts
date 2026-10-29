// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, it, expect, vi } from "vitest";
import {
  buildReflectionPrompt,
  maybeInjectReflection,
} from "./self-reflection.ts";
import { type EvalSession } from "../eval-session.ts";
import { type EvalAssertionResult, type EvalTurnResult } from "../types.ts";

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
    turn: number | "any";
  }> = {},
): EvalAssertionResult {
  const {
    tool = "ppal-update-clip",
    count = 0,
    nameMatchCount = 0,
    argsSpecified = false,
    message = "Expected ppal-update-clip to be called",
    turn,
  } = overrides;

  return {
    assertion: { type: "tool_called", tool, turn },
    earned: 0,
    maxScore: 1,
    message,
    details: { matchingCalls: [], count, nameMatchCount, argsSpecified },
  };
}

describe("maybeInjectReflection", () => {
  it("keeps the reflection turn's reasoning text and finish reason", async () => {
    const sendMessage = vi.fn<EvalSession["sendMessage"]>().mockResolvedValue({
      text: "I skipped it.",
      toolCalls: [],
      reasoningText: "why did I fail",
      finishReason: "stop",
    });
    const turns: EvalTurnResult[] = [];

    await maybeInjectReflection([makeToolCalledResult()], turns, {
      sendMessage,
    } as unknown as EvalSession);

    expect(turns[0]?.reasoningText).toBe("why did I fail");
    expect(turns[0]?.finishReason).toBe("stop");
  });
});

describe("buildReflectionPrompt", () => {
  it("names the missing tool, not 'any tool', when it was not called", () => {
    const result = makeToolCalledResult({ nameMatchCount: 0 });
    const prompt = buildReflectionPrompt(result);

    expect(prompt).toContain("you didn't call ppal-update-clip");
    expect(prompt).not.toContain("any tool");
  });

  it("names the checked turn by the message it answered", () => {
    const turns = [
      { userMessage: "Connect to Ableton Live" },
      { userMessage: "What devices are on the B-Reverb return track?" },
      { userMessage: "Add an empty scene at the end called Outro." },
    ] as EvalTurnResult[];
    const prompt = buildReflectionPrompt(
      makeToolCalledResult({ nameMatchCount: 0, turn: 1 }),
      turns,
    );

    expect(prompt).toContain(
      'In your reply to "What devices are on the B-Reverb return track?"',
    );
    expect(prompt).not.toContain("Outro");
  });

  it("shortens a long message and falls back without a turn", () => {
    const turns = [{ userMessage: "x".repeat(100) }] as EvalTurnResult[];

    expect(
      buildReflectionPrompt(makeToolCalledResult({ turn: 0 }), turns),
    ).toContain(`"${"x".repeat(77)}..."`);
    expect(
      buildReflectionPrompt(makeToolCalledResult({ turn: "any" }), turns),
    ).toMatch(/^In this conversation, /);
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
    expect(prompt).not.toContain("didn't call");
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
