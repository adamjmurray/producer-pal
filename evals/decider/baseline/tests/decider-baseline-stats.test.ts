// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  callSpeed,
  correlation,
  outcomeComparison,
  probabilityStats,
  verdictTable,
  type SidePair,
} from "../decider-baseline-stats.ts";
import { fakeAnswer, fakeQuestion } from "../../tests/decider-test-helpers.ts";

const pair = (
  baseline: Parameters<typeof fakeAnswer>[0],
  decider: Parameters<typeof fakeAnswer>[0],
): SidePair => ({
  baseline: fakeAnswer(baseline),
  decider: fakeAnswer(decider),
});

describe("verdictTable", () => {
  it("cross-tabulates and reads off agreement, escalation and costly misses", () => {
    const t = verdictTable([
      pair({ verdict: "pass" }, { verdict: "pass" }),
      pair({ verdict: "pass" }, { verdict: "fail" }),
      pair({ verdict: "fail" }, { verdict: "pass" }),
      pair({ verdict: "escalate" }, { verdict: "fail" }),
    ]);

    expect(t.counts.pass).toStrictEqual({ pass: 1, fail: 1, escalate: 0 });
    expect(t.counts.fail.pass).toBe(1);
    expect(t.counts.escalate.fail).toBe(1);
    expect(t.agree).toBe(1);
    expect(t.agreePct).toBe(25);
    expect(t.baselineEscalatePct).toBe(25);
    expect(t.deciderEscalatePct).toBe(0);
    expect(t.baselinePassDeciderFail).toBe(1);
    expect(t.baselineFailDeciderPass).toBe(1);
  });

  it("has no rates without rows", () => {
    const t = verdictTable([]);

    expect([t.n, t.agreePct, t.baselineEscalatePct]).toStrictEqual([
      0,
      null,
      null,
    ]);
  });
});

describe("probabilityStats", () => {
  const pairs = [
    pair(
      {
        questions: [
          fakeQuestion("r1", 0.9),
          fakeQuestion("r2", 0.2),
          fakeQuestion("only-baseline", 0.5),
          fakeQuestion("claims", 0.8),
        ],
      },
      {
        questions: [
          fakeQuestion("r1", 0.8),
          fakeQuestion("r2", 0.4),
          fakeQuestion("claims", 0.6),
        ],
      },
    ),
  ];

  it("compares requirement and whole questions both sides answered, by id", () => {
    const s = probabilityStats(pairs, false);

    expect(s.n).toBe(2);
    expect(s.meanAbsDiff).toBeCloseTo(0.15);
    expect(s.acrossPassLine).toBe(1); // 0.9 vs 0.8
    expect(s.acrossFailLine).toBe(1); // 0.2 vs 0.4
    expect(s.correlation).toBeCloseTo(1); // two points are always a line
  });

  it("compares the claims question separately", () => {
    const s = probabilityStats(pairs, true);

    expect(s.n).toBe(1);
    expect(s.meanAbsDiff).toBeCloseTo(0.2);
    expect(s.acrossPassLine).toBe(0);
    expect(s.correlation).toBeNull(); // one point
  });

  it("is empty when no question is shared", () => {
    expect(probabilityStats([pair({}, {})], false)).toStrictEqual({
      n: 0,
      meanAbsDiff: null,
      correlation: null,
      acrossPassLine: 0,
      acrossFailLine: 0,
    });
  });
});

describe("outcomeComparison", () => {
  const outcome = (score: number, maxScore: number) => ({
    outcome: { score, maxScore, confidence: 1, label: "x" },
  });

  it("compares shares of each side's own scale and reports the scales", () => {
    const o = outcomeComparison([
      pair(outcome(3, 3), outcome(5, 5)),
      pair(outcome(0, 3), outcome(1, 5)),
      pair(outcome(2, 3), outcome(4, 5)),
    ]);

    expect(o.baselineScales).toStrictEqual([3]);
    expect(o.deciderScales).toStrictEqual([5]);
    expect(o.meanDiff).toBeCloseTo((0 + 0.2 + (0.8 - 2 / 3)) / 3);
    expect(o.correlation).toBeGreaterThan(0.99);
  });

  it("lists every scale a side used, when they mix", () => {
    const o = outcomeComparison([
      pair(outcome(3, 3), outcome(5, 5)),
      pair(outcome(5, 5), outcome(5, 5)),
    ]);

    expect(o.baselineScales).toStrictEqual([3, 5]);
    expect(o.deciderScales).toStrictEqual([5]);
  });
});

describe("callSpeed", () => {
  it("gives the mean and nearest-rank p90", () => {
    const s = callSpeed([10, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    expect(s).toStrictEqual({ n: 10, mean: 5.5, p90: 9 });
  });

  it("has nothing without calls", () => {
    expect(callSpeed([])).toBeUndefined();
  });
});

describe("correlation", () => {
  it("is -1 for opposite series", () => {
    expect(correlation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
  });

  it("is null with no spread", () => {
    expect(correlation([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(correlation([1, 2, 3], [4, 4, 4])).toBeNull();
    expect(correlation([], [])).toBeNull();
  });
});
