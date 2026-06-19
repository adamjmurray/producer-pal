// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for the eval results analyzer.
 */

import { describe, expect, it } from "vitest";
import {
  analyzeResults,
  parseColumnLabel,
  parseResultsPayload,
  type SavedPayload,
  type SavedResult,
} from "./analyze-results.ts";

/**
 * Build a minimal SavedResult for tests.
 *
 * @param earnedScore - Earned points
 * @param maxScore - Max points
 * @param toolNames - Tool names called (one call each)
 * @param error - Optional error string
 * @returns A SavedResult
 */
function makeResult(
  earnedScore: number,
  maxScore: number,
  toolNames: string[] = [],
  error: string | null = null,
): SavedResult {
  return {
    earnedScore,
    maxScore,
    percentage: maxScore > 0 ? (earnedScore / maxScore) * 100 : null,
    durationMs: 1000,
    error,
    assertions: [],
    turns: [
      {
        turnIndex: 0,
        userMessage: "hi",
        assistantResponse: "ok",
        toolCalls: toolNames.map((name) => ({ name, args: {} })),
        durationMs: 1000,
      },
    ],
  };
}

const PAYLOAD: SavedPayload = {
  timestamp: "2026-06-19T00-00-00-000Z",
  columns: [
    "anthropic/strong (default)",
    "local/weak (default)",
    "local/weak (small-model)",
  ],
  scenarios: {
    "scenario-a": {
      "anthropic/strong (default)": makeResult(10, 10, ["ppal-connect"]),
      "local/weak (default)": makeResult(2, 10, ["ppal-connect"]),
      "local/weak (small-model)": makeResult(6, 10, ["ppal-connect"]),
    },
    "scenario-b": {
      "anthropic/strong (default)": makeResult(10, 10, ["ppal-create-clip"]),
      "local/weak (default)": makeResult(8, 10, [], "boom"),
      "local/weak (small-model)": makeResult(10, 10, ["ppal-create-clip"]),
    },
  },
};

describe("parseColumnLabel", () => {
  it("splits model and config", () => {
    expect(parseColumnLabel("anthropic/claude (small-model)")).toStrictEqual({
      modelKey: "anthropic/claude",
      configId: "small-model",
    });
  });

  it("defaults config to 'default' when absent", () => {
    expect(parseColumnLabel("google/gemini-3-flash")).toStrictEqual({
      modelKey: "google/gemini-3-flash",
      configId: "default",
    });
  });
});

describe("parseResultsPayload", () => {
  it("accepts a valid payload", () => {
    expect(parseResultsPayload(PAYLOAD).timestamp).toBe(PAYLOAD.timestamp);
  });

  it("rejects a non-object", () => {
    expect(() => parseResultsPayload(null)).toThrow();
  });

  it("rejects a payload missing scenarios", () => {
    expect(() => parseResultsPayload({ timestamp: "x" })).toThrow();
  });
});

describe("analyzeResults", () => {
  const analysis = analyzeResults(PAYLOAD);

  it("ranks the leaderboard by average percentage", () => {
    expect(analysis.leaderboard[0]?.label).toBe("anthropic/strong (default)");
    expect(analysis.leaderboard[0]?.avgPct).toBe(100);
    // weak default: (20 + 80) / 2 = 50
    const weakDefault = analysis.leaderboard.find(
      (r) => r.label === "local/weak (default)",
    );

    expect(weakDefault?.avgPct).toBe(50);
    expect(weakDefault?.errorCount).toBe(1);
  });

  it("orders scenarios by score spread (most discriminating first)", () => {
    // scenario-a spread: 100 - 20 = 80; scenario-b: 100 - 80 = 20
    expect(analysis.spread[0]?.scenario).toBe("scenario-a");
    expect(analysis.spread[0]?.spread).toBe(80);
    expect(analysis.spread[0]?.minLabel).toBe("local/weak (default)");
  });

  it("computes small-model deltas for models in both configs", () => {
    expect(analysis.smallModelDeltas).toHaveLength(1);
    const delta = analysis.smallModelDeltas[0];

    expect(delta?.modelKey).toBe("local/weak");
    expect(delta?.defaultPct).toBe(50); // (20 + 80) / 2
    expect(delta?.smallModelPct).toBe(80); // (60 + 100) / 2
    expect(delta?.deltaPct).toBe(30);
  });

  it("tallies tool usage per column", () => {
    const strong = analysis.toolUsage.find(
      (r) => r.label === "anthropic/strong (default)",
    );

    expect(strong?.totalCalls).toBe(2);
    expect(strong?.tools).toContainEqual({ name: "ppal-connect", count: 1 });
  });

  it("collects errored runs", () => {
    expect(analysis.errors).toStrictEqual([
      { scenario: "scenario-b", label: "local/weak (default)", error: "boom" },
    ]);
  });
});
