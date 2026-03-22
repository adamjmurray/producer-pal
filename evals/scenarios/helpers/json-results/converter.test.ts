// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for json-result-converter.ts
 */

import { describe, it, expect } from "vitest";
import {
  type EvalAssertionResult,
  type EvalScenarioResult,
  type EvalTurnResult,
} from "../../types.ts";
import { toJsonResult, truncateToolResult } from "./converter.ts";

const JUDGE_DETAILS = {
  accuracy: { score: 0.9, reasoning: "Good accuracy" },
  reasoning: { score: 0.8, reasoning: "Solid reasoning" },
  efficiency: { score: 0.7, reasoning: "Efficient enough" },
  naturalness: { score: 0.85, reasoning: "Natural flow" },
  overall: 0.8125,
};

const LOW_JUDGE_DETAILS = {
  accuracy: { score: 0.3, reasoning: "Failed accuracy" },
  reasoning: { score: 0.6, reasoning: "Weak reasoning" },
  efficiency: { score: 0.5, reasoning: "Inefficient" },
  naturalness: { score: 0.8, reasoning: "Okay" },
  overall: 0.55,
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
            assertion: {
              type: "llm_judge",
              prompt: "Evaluate",
              score: 10,
            },
            earned: 8,
            maxScore: 10,
            message: "LLM judge: 8/10",
            details: JUDGE_DETAILS,
          }),
        ],
        earnedScore: 13,
        maxScore: 15,
      }),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.type).toBe("tool_called");
  });

  it("derives review from llm_judge assertion", () => {
    const result = toJsonResult(
      makeResult({
        assertions: [
          makeAssertion({
            assertion: {
              type: "llm_judge",
              prompt: "Evaluate",
              score: 10,
            },
            earned: 8,
            maxScore: 10,
            message: "LLM judge: 8/10",
            details: JUDGE_DETAILS,
          }),
        ],
        earnedScore: 8,
        maxScore: 10,
      }),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.review).toBeDefined();
    expect(result.review?.pass).toBe(true);
    expect(result.review?.issues).toStrictEqual([]);
    expect(result.review?.legacyScores.overall).toBe(0.8125);
  });

  it("marks review as failed when a dimension is below 0.5", () => {
    const result = toJsonResult(
      makeResult({
        assertions: [
          makeAssertion({
            assertion: {
              type: "llm_judge",
              prompt: "Evaluate",
              score: 10,
            },
            earned: 5.5,
            maxScore: 10,
            message: "LLM judge: 5.5/10",
            details: LOW_JUDGE_DETAILS,
          }),
        ],
        earnedScore: 5.5,
        maxScore: 10,
      }),
      "run-1",
      "google/gemini",
      "default",
    );

    expect(result.review?.pass).toBe(false);
    expect(result.result).toBe("fail");
  });

  it("generates issues for dimensions below 0.7", () => {
    const result = toJsonResult(
      makeResult({
        assertions: [
          makeAssertion({
            assertion: {
              type: "llm_judge",
              prompt: "Evaluate",
              score: 10,
            },
            earned: 5.5,
            maxScore: 10,
            message: "LLM judge: 5.5/10",
            details: LOW_JUDGE_DETAILS,
          }),
        ],
        earnedScore: 5.5,
        maxScore: 10,
      }),
      "run-1",
      "google/gemini",
      "default",
    );

    // accuracy (0.3), reasoning (0.6), efficiency (0.5) are all < 0.7
    expect(result.review?.issues).toHaveLength(3);
    expect(result.review?.issues[0]).toContain("accuracy");
    expect(result.review?.issues[0]).toContain("0.30");
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
