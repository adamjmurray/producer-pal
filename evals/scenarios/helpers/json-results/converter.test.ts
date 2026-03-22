// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for converter.ts
 */

import { describe, it, expect } from "vitest";
import {
  type EvalAssertionResult,
  type EvalScenarioResult,
  type EvalTurnResult,
} from "../../types.ts";
import { toJsonResult, truncateToolResult } from "./converter.ts";

const PASSING_JUDGE = { pass: true, issues: [] };
const FAILING_JUDGE = {
  pass: false,
  issues: ["Missing confirmation", "Wrong tool used"],
};

function makeTurn(overrides?: Partial<EvalTurnResult>): EvalTurnResult {
  return {
    turnIndex: 0,
    userMessage: "Connect to Ableton",
    assistantResponse: "Connected!",
    toolCalls: [
      { name: "ppal-connect", args: {}, result: "Connected to Ableton Live" },
    ],
    durationMs: 1000,
    stepUsages: [{ inputTokens: 5000, outputTokens: 2000 }],
    ...overrides,
  };
}

function makeAssertion(
  overrides?: Partial<EvalAssertionResult>,
): EvalAssertionResult {
  return {
    assertion: { type: "tool_called", tool: "ppal-connect", score: 5 },
    earned: 5,
    maxScore: 5,
    message: "tool_called: ppal-connect",
    ...overrides,
  };
}

function makeResult(
  overrides?: Partial<EvalScenarioResult>,
): EvalScenarioResult {
  return {
    scenario: {
      id: "test-scenario",
      description: "A test scenario",
      liveSet: "test",
      messages: ["Connect to Ableton"],
      assertions: [],
    },
    turns: [makeTurn()],
    assertions: [makeAssertion()],
    earnedScore: 5,
    maxScore: 5,
    totalDurationMs: 1500,
    totalUsage: { inputTokens: 5000, outputTokens: 2000 },
    ...overrides,
  };
}

describe("toJsonResult", () => {
  it("converts a basic passing result", () => {
    const result = toJsonResult(
      makeResult(),
      "2026-03-22T10-30-00Z",
      "google/gemini",
      "default",
    );

    expect(result.version).toBe(1);
    expect(result.runId).toBe("2026-03-22T10-30-00Z");
    expect(result.scenarioId).toBe("test-scenario");
    expect(result.scenarioDescription).toBe("A test scenario");
    expect(result.model).toBe("google/gemini");
    expect(result.configProfileId).toBe("default");
    expect(result.result).toBe("pass");
    expect(result.score).toStrictEqual({
      earned: 5,
      max: 5,
      percentage: 100,
    });
    expect(result.review).toBeUndefined();
  });

  it("includes turns with aggregated step usage", () => {
    const result = toJsonResult(
      makeResult({
        turns: [
          makeTurn({
            stepUsages: [
              { inputTokens: 3000, outputTokens: 1000 },
              { inputTokens: 2000, outputTokens: 1000 },
            ],
          }),
        ],
      }),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]?.usage).toStrictEqual({
      inputTokens: 5000,
      outputTokens: 2000,
    });
  });

  it("maps checks from non-judge assertions only", () => {
    const result = toJsonResult(
      makeResult({
        assertions: [
          makeAssertion(),
          makeAssertion({
            assertion: { type: "llm_judge", prompt: "Evaluate" },
            earned: 0,
            maxScore: 0,
            message: "LLM judge: pass",
            details: PASSING_JUDGE,
          }),
        ],
        earnedScore: 5,
        maxScore: 5,
      }),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.type).toBe("tool_called");
  });

  it("derives review from llm_judge assertion (passing)", () => {
    const result = toJsonResult(
      makeResult({
        assertions: [
          makeAssertion({
            assertion: { type: "llm_judge", prompt: "Evaluate" },
            earned: 0,
            maxScore: 0,
            message: "LLM judge: pass",
            details: PASSING_JUDGE,
          }),
        ],
        earnedScore: 0,
        maxScore: 0,
      }),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.review).toBeDefined();
    expect(result.review?.pass).toBe(true);
    expect(result.review?.issues).toStrictEqual([]);
  });

  it("derives review from llm_judge assertion (failing)", () => {
    const result = toJsonResult(
      makeResult({
        assertions: [
          makeAssertion({
            assertion: { type: "llm_judge", prompt: "Evaluate" },
            earned: 0,
            maxScore: 0,
            message: "LLM judge: fail (2 issue(s))",
            details: FAILING_JUDGE,
          }),
        ],
        earnedScore: 0,
        maxScore: 0,
      }),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.review?.pass).toBe(false);
    expect(result.review?.issues).toHaveLength(2);
    expect(result.review?.issues[0]).toBe("Missing confirmation");
    expect(result.result).toBe("fail");
  });

  it("marks result as fail when a check fails", () => {
    const result = toJsonResult(
      makeResult({
        assertions: [makeAssertion({ earned: 0, maxScore: 5 })],
        earnedScore: 0,
        maxScore: 5,
      }),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.result).toBe("fail");
    expect(result.checks[0]?.pass).toBe(false);
  });

  it("passes with no judge and all checks passing", () => {
    const result = toJsonResult(
      makeResult(),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.result).toBe("pass");
    expect(result.review).toBeUndefined();
  });

  it("includes error field when present", () => {
    const result = toJsonResult(
      makeResult({ error: "Connection failed" }),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.error).toBe("Connection failed");
  });

  it("handles zero maxScore gracefully", () => {
    const result = toJsonResult(
      makeResult({
        assertions: [],
        earnedScore: 0,
        maxScore: 0,
      }),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.score.percentage).toBe(100);
    expect(result.result).toBe("pass");
  });

  it("truncates long tool results in turns", () => {
    const longResult = "x".repeat(600);
    const result = toJsonResult(
      makeResult({
        turns: [
          makeTurn({
            toolCalls: [{ name: "ppal-connect", args: {}, result: longResult }],
          }),
        ],
      }),
      "run-1",
      "google/gemini",
      "default",
    );

    const toolResult = result.turns[0]?.toolCalls[0]?.result;

    expect(toolResult?.length).toBeLessThanOrEqual(500);
    expect(toolResult).toContain("...[truncated]");
  });

  it("includes reasoning tokens when present", () => {
    const result = toJsonResult(
      makeResult({
        turns: [
          makeTurn({
            stepUsages: [
              { inputTokens: 3000, outputTokens: 1000, reasoningTokens: 500 },
            ],
          }),
        ],
      }),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.turns[0]?.usage?.reasoningTokens).toBe(500);
  });

  it("omits reasoning tokens when zero", () => {
    const result = toJsonResult(
      makeResult(),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.turns[0]?.usage).not.toHaveProperty("reasoningTokens");
  });

  it("includes reflection on failing check when present", () => {
    const result = toJsonResult(
      makeResult({
        assertions: [
          makeAssertion({
            earned: 0,
            maxScore: 5,
            details: {
              count: 0,
              expectedCount: { min: 1 },
              reflection: "I chose not to call the tool because...",
            },
          }),
        ],
        earnedScore: 0,
        maxScore: 5,
      }),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.checks[0]?.reflection).toBe(
      "I chose not to call the tool because...",
    );
  });

  it("omits reflection when not present on details", () => {
    const result = toJsonResult(
      makeResult({
        assertions: [
          makeAssertion({
            earned: 0,
            maxScore: 5,
            details: { count: 0, expectedCount: { min: 1 } },
          }),
        ],
        earnedScore: 0,
        maxScore: 5,
      }),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.checks[0]?.reflection).toBeUndefined();
  });
});

describe("truncateToolResult", () => {
  it("returns short strings unchanged", () => {
    expect(truncateToolResult("hello")).toBe("hello");
  });

  it("truncates strings longer than 500 chars", () => {
    const long = "a".repeat(600);
    const truncated = truncateToolResult(long);

    expect(truncated).toHaveLength(500);
    expect(truncated.endsWith("...[truncated]")).toBe(true);
  });

  it("returns exactly 500-char strings unchanged", () => {
    const exact = "b".repeat(500);

    expect(truncateToolResult(exact)).toBe(exact);
  });
});
