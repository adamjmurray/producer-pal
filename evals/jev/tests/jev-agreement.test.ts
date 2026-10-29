// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { summarizeAgreement, type VerdictPair } from "../jev-agreement.ts";

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
