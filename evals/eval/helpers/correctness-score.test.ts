// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Tests for correctness-score.ts
 */
import { describe, it, expect } from "vitest";
import {
  computeCorrectnessBreakdown,
  computeCorrectnessScore,
} from "./correctness-score.ts";
import type { EvalAssertionResult, ToolCallAssertion } from "../types.ts";

/**
 * Create a tool_called assertion result
 *
 * @param passed - Whether the assertion passed
 * @param nameMatchCount - Number of calls where tool name matched
 * @param argsSpecified - Whether args were specified in the assertion
 * @param argsMatchCount - Number of calls where args also matched
 * @returns Mock assertion result
 */
function makeToolCallResult(
  passed: boolean,
  nameMatchCount: number,
  argsSpecified: boolean,
  argsMatchCount: number = nameMatchCount,
): EvalAssertionResult {
  return {
    assertion: { type: "tool_called", tool: "test-tool" } as ToolCallAssertion,
    passed,
    message: "test",
    details: {
      matchingCalls: [],
      count: argsMatchCount,
      expectedCount: { min: 1 },
      nameMatchCount,
      argsSpecified,
    },
  };
}

/**
 * Create a state assertion result
 *
 * @param passed - Whether the assertion passed
 * @returns Mock assertion result
 */
function makeStateResult(passed: boolean): EvalAssertionResult {
  return {
    assertion: { type: "state", tool: "read-track", args: {}, expect: {} },
    passed,
    message: "test",
  };
}

/**
 * Create a response_contains assertion result
 *
 * @param passed - Whether the assertion passed
 * @returns Mock assertion result
 */
function makeResponseContainsResult(passed: boolean): EvalAssertionResult {
  return {
    assertion: { type: "response_contains", pattern: "test" },
    passed,
    message: "test",
  };
}

/**
 * Create an llm_judge assertion result
 *
 * @returns Mock assertion result
 */
function makeLlmJudgeResult(): EvalAssertionResult {
  return {
    assertion: { type: "llm_judge", prompt: "test" },
    passed: true,
    message: "test",
    details: {
      accuracy: { score: 5, reasoning: "a" },
      reasoning: { score: 4, reasoning: "b" },
      efficiency: { score: 4, reasoning: "c" },
      naturalness: { score: 4, reasoning: "d" },
      overall: 4.25,
    },
  };
}

describe("computeCorrectnessBreakdown", () => {
  it("returns breakdown with earned/max/score", () => {
    // tool_called with args (max=2): name matched, args matched → earned=2
    // state (max=1): passed → earned=1
    // Total: earned=3, max=3 → score=5
    const assertions = [
      makeToolCallResult(true, 1, true, 1),
      makeStateResult(true),
    ];
    const result = computeCorrectnessBreakdown(assertions);

    expect(result.earned).toBe(3);
    expect(result.max).toBe(3);
    expect(result.score).toBe(5);
  });

  it("returns zero earned/max when no checks", () => {
    const result = computeCorrectnessBreakdown([]);

    expect(result.earned).toBe(0);
    expect(result.max).toBe(0);
    expect(result.score).toBe(5);
  });

  it("returns zero earned/max when only llm_judge", () => {
    const result = computeCorrectnessBreakdown([makeLlmJudgeResult()]);

    expect(result.earned).toBe(0);
    expect(result.max).toBe(0);
    expect(result.score).toBe(5);
  });
});

describe("computeCorrectnessScore", () => {
  describe("no deterministic checks", () => {
    it("returns 5.0 when no assertions", () => {
      expect(computeCorrectnessScore([])).toBe(5);
    });

    it("returns 5.0 when only llm_judge assertions", () => {
      const assertions = [makeLlmJudgeResult()];

      expect(computeCorrectnessScore(assertions)).toBe(5);
    });
  });

  describe("tool_called assertions", () => {
    it("scores 5.0 when tool name matched (no args specified)", () => {
      // nameMatch=1, argsSpecified=false → earned=1, max=1 → 5.0
      const assertions = [makeToolCallResult(true, 1, false)];

      expect(computeCorrectnessScore(assertions)).toBe(5);
    });

    it("scores 0.0 when tool name not matched (no args specified)", () => {
      // nameMatch=0, argsSpecified=false → earned=0, max=1 → 0.0
      const assertions = [makeToolCallResult(false, 0, false)];

      expect(computeCorrectnessScore(assertions)).toBe(0);
    });

    it("scores 5.0 when name and args matched", () => {
      // nameMatch=1, argsSpecified=true, count=1 → earned=2, max=2 → 5.0
      const assertions = [makeToolCallResult(true, 1, true, 1)];

      expect(computeCorrectnessScore(assertions)).toBe(5);
    });

    it("scores 2.5 when name matched but args not matched", () => {
      // nameMatch=1, argsSpecified=true, count=0 → earned=1, max=2 → 2.5
      const assertions = [makeToolCallResult(false, 1, true, 0)];

      expect(computeCorrectnessScore(assertions)).toBe(2.5);
    });

    it("scores 0.0 when neither name nor args matched", () => {
      // nameMatch=0, argsSpecified=true, count=0 → earned=0, max=2 → 0.0
      const assertions = [makeToolCallResult(false, 0, true, 0)];

      expect(computeCorrectnessScore(assertions)).toBe(0);
    });
  });

  describe("state assertions", () => {
    it("scores 5.0 when passed", () => {
      const assertions = [makeStateResult(true)];

      expect(computeCorrectnessScore(assertions)).toBe(5);
    });

    it("scores 0.0 when failed", () => {
      const assertions = [makeStateResult(false)];

      expect(computeCorrectnessScore(assertions)).toBe(0);
    });
  });

  describe("response_contains assertions", () => {
    it("scores 5.0 when passed", () => {
      const assertions = [makeResponseContainsResult(true)];

      expect(computeCorrectnessScore(assertions)).toBe(5);
    });

    it("scores 0.0 when failed", () => {
      const assertions = [makeResponseContainsResult(false)];

      expect(computeCorrectnessScore(assertions)).toBe(0);
    });
  });

  describe("mixed assertions", () => {
    it("computes weighted average correctly", () => {
      // tool_called with args (max=2): name matched, args matched → earned=2
      // state (max=1): passed → earned=1
      // response_contains (max=1): failed → earned=0
      // llm_judge: ignored
      // Total: earned=3, max=4 → (3/4)*5 = 3.75
      const assertions = [
        makeToolCallResult(true, 1, true, 1),
        makeStateResult(true),
        makeResponseContainsResult(false),
        makeLlmJudgeResult(),
      ];

      expect(computeCorrectnessScore(assertions)).toBe(3.75);
    });

    it("handles multiple tool_called assertions", () => {
      // tool1 no args (max=1): name matched → earned=1
      // tool2 with args (max=2): name not matched, args not matched → earned=0
      // Total: earned=1, max=3 → (1/3)*5 ≈ 1.67
      const assertions = [
        makeToolCallResult(true, 1, false),
        makeToolCallResult(false, 0, true, 0),
      ];

      expect(computeCorrectnessScore(assertions)).toBeCloseTo(1.67, 1);
    });
  });
});
