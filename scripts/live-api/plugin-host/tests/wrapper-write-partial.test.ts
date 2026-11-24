// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { loadWrapper } from "./wrapper-test-helpers.ts";

interface Result {
  ok: boolean;
  kind?: string;
  error?: string;
  index?: number;
  display?: string;
}

const START = 0.3;
const decibels = (v: number): string => `${(v * 72 - 60).toFixed(2)} dB`;

/**
 * Write -6 dB to params A, B and C, where reading B throws on its `throwAt`th
 * read (never when undefined).
 * @param throwAt - Which of B's reads throws
 * @returns What the wrapper answered, B's reads, and where each param sits
 */
function writeThree(throwAt?: number): {
  results: Result[];
  bReads: number;
  values: number[];
} {
  const values = [START, START, START];
  let bReads = 0;
  const rig = loadWrapper("Plug", (...args) => {
    if (args[1] === "get") {
      const index = args[2] as number;

      if (index === 2 && ++bReads === throwAt) {
        throw new Error("vst~ gone");
      }

      const value = values[index - 1] as number;

      rig.run(`pval(${index}, ${value}, ${JSON.stringify(decibels(value))})`);
    } else if (typeof args[1] === "number") {
      values[args[1] - 1] = args[2] as number;
    }
  });

  rig.run('pname("A", "B", "C")');

  const entries = ["A", "B", "C"].map((name) => ({
    name,
    text: "-6 dB",
    number: -6,
  }));
  const results = JSON.parse(
    rig.run(
      `JSON.stringify(writeParams(${JSON.stringify(entries)}))`,
    ) as string,
  ) as Result[];

  return { results, bReads, values };
}

describe("wrapper write that throws partway through", () => {
  it("reports the params around a throw as written, and puts the failing one back", () => {
    const { results, values } = writeThree(5);

    expect(results.map((result) => result.ok)).toStrictEqual([
      true,
      false,
      true,
    ]);
    expect(results[1]).toStrictEqual({
      ok: false,
      kind: "failed",
      error: "vst~ gone",
    });
    expect(values[0]).toBeCloseTo(0.75, 5);
    expect(values[1]).toBe(START);
    expect(values[2]).toBeCloseTo(0.75, 5);
  });

  it("says a param may have changed when the read after its write throws", () => {
    const { bReads } = writeThree();
    const { results, values } = writeThree(bReads);

    expect(results[1]).toStrictEqual({
      ok: false,
      kind: "changed",
      error: "vst~ gone",
    });
    expect(values[1]).toBeCloseTo(0.75, 5);
    expect(results[2]?.ok).toBe(true);
  });
});
