// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for result-format.ts
 */

import { describe, it, expect } from "vitest";
import { type JsonEvalResult } from "../json-results/types.ts";
import { scorePercentage, toolErrorPenalty } from "./result-format.ts";

/**
 * Build a minimal result with the given check outcomes and tool-error tally.
 *
 * @param checks - Pass/fail per gating check
 * @param toolErrors - Optional failed/total tool call counts
 * @returns A JSON eval result
 */
function makeResult(
  checks: boolean[],
  toolErrors?: { count: number; total: number },
): JsonEvalResult {
  return {
    version: 1,
    runId: "run-1",
    timestamp: "2026-08-29T00:00:00.000Z",
    scenarioId: "test",
    scenarioDescription: "test",
    model: "google/gemini",
    configProfileId: "default",
    result: checks.every(Boolean) ? "pass" : "fail",
    turns: [],
    checks: {
      pass: checks.every(Boolean),
      results: checks.map((pass, i) => ({
        type: "tool_called",
        label: `check ${i}`,
        pass,
        message: "",
      })),
    },
    ...(toolErrors && { toolErrors: { ...toolErrors, errors: [] } }),
    totalDurationMs: 1,
  };
}

describe("toolErrorPenalty", () => {
  it("is 0 for a clean run", () => {
    expect(toolErrorPenalty(makeResult([true]))).toBe(0);
  });

  it("costs a flat 10% per failed call", () => {
    expect(toolErrorPenalty(makeResult([true], { count: 2, total: 9 }))).toBe(
      0.2,
    );
  });

  it("caps at half the score", () => {
    expect(toolErrorPenalty(makeResult([true], { count: 20, total: 40 }))).toBe(
      0.5,
    );
  });
});

describe("scorePercentage", () => {
  it("is the check pass rate for a clean single trial", () => {
    expect(scorePercentage([makeResult([true, true, true, true])])).toBe(100);
    expect(scorePercentage([makeResult([true, false, true, true])])).toBe(75);
  });

  it("discounts a passing run for each failed call", () => {
    const result = makeResult([true, true], { count: 1, total: 4 });

    expect(result.result).toBe("pass");
    expect(scorePercentage([result])).toBe(90);
  });

  it("costs the same however many calls the run made", () => {
    const few = makeResult([true, true], { count: 1, total: 2 });
    const many = makeResult([true, true], { count: 1, total: 20 });

    expect(scorePercentage([few])).toBe(90);
    expect(scorePercentage([many])).toBe(90);
  });

  it("grades repeated trials on their pass rate", () => {
    expect(scorePercentage([makeResult([true]), makeResult([false])])).toBe(50);
  });

  it("averages the tool-error penalty across trials", () => {
    const trials = [
      makeResult([true], { count: 1, total: 5 }),
      makeResult([true], { count: 0, total: 5 }),
    ];

    // Both trials pass (100), mean penalty 5%.
    expect(scorePercentage(trials)).toBe(95);
  });

  it("has nothing to grade without results or checks", () => {
    expect(scorePercentage([])).toBeNull();
    expect(scorePercentage([makeResult([])])).toBeNull();
  });
});
