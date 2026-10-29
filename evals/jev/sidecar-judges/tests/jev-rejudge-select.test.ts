// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  selectEligible,
  parseSample,
  sampleResults,
  seededShuffle,
} from "../jev-rejudge-select.ts";
import { type JudgedResult } from "../../jev-results.ts";

const item = (
  file: string,
  result: "pass" | "fail" = "pass",
  checksPass = true,
): JudgedResult =>
  ({
    file,
    criteria: "C",
    result: { result, checks: { pass: checksPass, results: [] } },
  }) as unknown as JudgedResult;

const many = (n: number): JudgedResult[] =>
  Array.from({ length: n }, (_, i) =>
    item(`run/p${String(i).padStart(2, "0")}.json`),
  );

describe("parseSample", () => {
  it("reads fails+N", () => {
    expect(parseSample("fails+25")).toBe(25);
  });

  it.each(["25", "fails", "fails+", "fails+x", "all+3"])(
    "rejects %s",
    (text) => {
      expect(() => parseSample(text)).toThrow(`Bad --sample=${text}`);
    },
  );
});

describe("selectEligible", () => {
  const items = [item("a"), item("b", "fail", false)];

  it("keeps gating-passed results by default", () => {
    expect(selectEligible(items, false).map((i) => i.file)).toStrictEqual([
      "a",
    ]);
  });

  it("keeps everything when asked", () => {
    expect(selectEligible(items, true)).toHaveLength(2);
  });
});

describe("seededShuffle", () => {
  it("repeats for a seed, differs across seeds, and keeps the input", () => {
    const list = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    expect(seededShuffle(list, 7)).toStrictEqual(seededShuffle(list, 7));
    expect(seededShuffle(list, 7)).not.toStrictEqual(seededShuffle(list, 8));
    expect(seededShuffle(list, 7).toSorted((a, b) => a - b)).toStrictEqual(
      list,
    );
    expect(list[0]).toBe(1);
  });
});

describe("sampleResults", () => {
  const items = [
    ...many(30),
    item("run/f1.json", "fail"),
    item("run/f2.json", "fail"),
  ];

  it("keeps every fail and N passes, in input order", () => {
    const out = sampleResults(items, { passes: 5, seed: 1 });
    const files = out.map((i) => i.file);

    expect(out).toHaveLength(7);
    expect(files).toContain("run/f1.json");
    expect(files).toContain("run/f2.json");
    expect(files).toStrictEqual(
      items.map((i) => i.file).filter((f) => files.includes(f)),
    );
  });

  it("picks the same passes for the same seed, whatever the input order", () => {
    const a = sampleResults(items, { passes: 5, seed: 3 }).map((i) => i.file);
    const b = sampleResults(items.toReversed(), { passes: 5, seed: 3 })
      .map((i) => i.file)
      .toSorted();

    expect(b).toStrictEqual(a.toSorted());
  });

  it("picks different passes for a different seed", () => {
    const pick = (seed: number): string[] =>
      sampleResults(items, { passes: 5, seed }).map((i) => i.file);

    expect(pick(1)).not.toStrictEqual(pick(2));
  });

  it("takes all passes when N exceeds them", () => {
    expect(sampleResults(items, { passes: 99, seed: 1 })).toHaveLength(32);
  });

  it("counts results other judges failed as fails", () => {
    const out = sampleResults(
      items,
      { passes: 0, seed: 1 },
      new Set(["run/p03.json"]),
    );

    expect(out.map((i) => i.file)).toStrictEqual([
      "run/p03.json",
      "run/f1.json",
      "run/f2.json",
    ]);
  });
});
