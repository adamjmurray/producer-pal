// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  rankAuc,
  summarizeAgreement,
  summarizeOutcome,
  type VerdictPair,
} from "../jev-agreement.ts";

const pair = (judgePass: boolean, jev: VerdictPair["jev"]): VerdictPair => ({
  judgePass,
  jev,
});

describe("summarizeAgreement", () => {
  it("counts verdicts, wrong calls and agreement on decided results", () => {
    const s = summarizeAgreement([
      pair(true, "pass"),
      pair(true, "pass"),
      pair(false, "pass"),
      pair(false, "fail"),
      pair(true, "fail"),
      pair(false, "escalate"),
      pair(true, "escalate"),
    ]);

    expect(s).toStrictEqual({
      n: 7,
      judgeFails: 3,
      jevPass: 3,
      jevFail: 2,
      escalate: 2,
      escalatePct: (2 / 7) * 100,
      wrongPass: 1,
      wrongFail: 1,
      agreePct: 60,
    });
  });

  it("returns null percentages with no rows or nothing decided", () => {
    const empty = summarizeAgreement([]);
    const allEscalated = summarizeAgreement([pair(true, "escalate")]);

    expect(empty.escalatePct).toBeNull();
    expect(empty.agreePct).toBeNull();
    expect(allEscalated.escalatePct).toBe(100);
    expect(allEscalated.agreePct).toBeNull();
  });
});

describe("rankAuc", () => {
  it("is 1 when every fail scores below every pass", () => {
    expect(rankAuc([0, 1], [2, 3])).toBe(1);
  });

  it("is 0 when every fail scores above every pass", () => {
    expect(rankAuc([2, 3], [0, 1])).toBe(0);
  });

  it("counts ties as half", () => {
    expect(rankAuc([1], [1])).toBe(0.5);
    // fail 1 vs passes 1, 2: 0.5 + 1; fail 3 vs passes 1, 2: 0 + 0
    expect(rankAuc([1, 3], [1, 2])).toBe(1.5 / 4);
  });

  it("is null when either side is empty", () => {
    expect(rankAuc([], [1])).toBeNull();
    expect(rankAuc([1], [])).toBeNull();
    expect(rankAuc([], [])).toBeNull();
  });
});

describe("summarizeOutcome", () => {
  it("gives group sizes, means and AUC", () => {
    const s = summarizeOutcome([
      { judgePass: true, score: 3 },
      { judgePass: true, score: 2 },
      { judgePass: false, score: 1 },
      { judgePass: false, score: 2.5 },
    ]);

    expect(s).toStrictEqual({
      passN: 2,
      failN: 2,
      passMean: 2.5,
      failMean: 1.75,
      auc: 0.75,
    });
  });

  it("has null means and AUC with no rows", () => {
    expect(summarizeOutcome([])).toStrictEqual({
      passN: 0,
      failN: 0,
      passMean: null,
      failMean: null,
      auc: null,
    });
  });
});
