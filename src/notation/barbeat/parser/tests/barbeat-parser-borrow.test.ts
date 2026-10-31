// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Opus 5.5 (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import * as parser from "../barbeat-parser.ts";
import { loopBorrow, sweepBorrows } from "./barbeat-parser-test-helpers.ts";

// [label, bar, base beat, offset numerator, offset denominator, beats per bar]
const cases: [string, number, number, number, number, number][] = [
  ["lands exactly on beat 1", 2, 2, 1, 1, 4],
  ["just below beat 1", 2, 1, 1, 12, 4],
  ["exactly one bar", 3, 1, 1, 1, 4],
  ["fractional beats", 5, 1.5, 7, 8, 4],
  ["three beats per bar", 4, 1, 5, 4, 3],
  ["seven beats per bar", 9, 2, 13, 8, 7],
  ["before 1|1", 1, 1, 3, 1, 4],
  ["many bars, repeating decimal", 40, 1, 25, 3, 4],
];

describe("BarBeatScript Parser - borrowing across bar lines", () => {
  it.each(cases)(
    "matches the bar-at-a-time loop: %s",
    (_, bar, base, num, den, bpb) => {
      const raw = base - (num / den) * 4;

      expect(
        parser.parse(`${bar}|${base}-n${num}/${den} C3`, {
          beatsPerBar: bpb,
        }),
      ).toStrictEqual([loopBorrow(bar, raw, bpb), { pitch: 60 }]);
    },
  );

  it("matches the loop across a sweep of offsets and meters", () => {
    sweepBorrows(32, (point, beatsPerBar, expected) => {
      expect(parser.parse(`${point} C3`, { beatsPerBar })).toStrictEqual([
        expected,
        { pitch: 60 },
      ]);
    });
  });

  it("borrows a repeat's start the same way", () => {
    expect(parser.parse("2|1-n/2x2 C3")).toStrictEqual([
      { bar: 1, beat: { start: 3, times: 2, step: null } },
      { pitch: 60 },
    ]);
  });

  it("returns for a huge negative offset", () => {
    const started = performance.now();
    const result = parser.parse("1|1-n1000000000/1 C3 1|2-n999999999/1 D3");

    // The bar-at-a-time loop took over a minute here.
    expect(performance.now() - started).toBeLessThan(2000);
    expect(result).toStrictEqual([
      { bar: 1 - 1_000_000_000, beat: 1 },
      { pitch: 60 },
      { bar: 2 - 1_000_000_000, beat: 2 },
      { pitch: 62 },
    ]);
  });
});
