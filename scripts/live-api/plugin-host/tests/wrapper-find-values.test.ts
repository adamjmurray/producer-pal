// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { loadWrapper } from "./wrapper-test-helpers.ts";

interface Found {
  index: number;
  name: string;
  low: string;
  high: string;
  values: {
    value?: number;
    display?: string;
    outside?: true;
    error?: string;
  }[];
}

const decibels = (v: number): string => `${(v * 72 - 60).toFixed(2)} dB`;
// -inf dB at 0, -36.1 dB at the next sample, 6.0 dB at 1.
const gain = (v: number): string =>
  v === 0 ? "-inf dB" : `${(20 * Math.log10(v * 2)).toFixed(1)} dB`;
const START = 0.3;

// One param, "P", showing -60 to 12 dB unless told otherwise, that starts at
// START.
function find(
  values: object[],
  plugin: string | null = "Plug",
  display: (value: number) => string = decibels,
): { found: Found; current: () => number; gets: () => number } {
  let current = START;
  let gets = 0;
  const rig = loadWrapper(plugin, (...args) => {
    if (args[1] === "get") {
      gets++;
      rig.run(`pval(1, ${current}, ${JSON.stringify(display(current))})`);
    } else if (typeof args[2] === "number") {
      current = args[2];
    }
  });

  rig.run('pname("P")');

  // Through JSON, as a reply goes: the result is from another realm.
  const found = JSON.parse(
    rig.run(
      `JSON.stringify(findValues(${JSON.stringify({ index: 1, values })}))`,
    ) as string,
  ) as Found;

  return { found, current: () => current, gets: () => gets };
}

describe("wrapper find", () => {
  it("finds where the param shows each value and puts the param back", () => {
    const { found, current } = find([
      { text: "-6 dB", number: -6 },
      { text: "12.00 dB", number: 12 },
    ]);

    expect([found.index, found.name]).toStrictEqual([1, "P"]);
    expect(found.low).toBe("-60.00 dB");
    expect(found.high).toBe("12.00 dB");
    expect(found.values[0]?.value).toBeCloseTo(0.75, 3);
    expect(found.values[0]?.display).toBe("-6.00 dB");
    expect(found.values[1]).toStrictEqual({ value: 1, display: "12.00 dB" });
    expect(current()).toBe(START);
  });

  it("flags a number past every value the param shows", () => {
    const { found, current } = find([{ text: "24 dB", number: 24 }]);

    expect(found.values).toStrictEqual([
      { value: 1, display: "12.00 dB", outside: true },
    ]);
    expect(current()).toBe(START);
  });

  it("says what the param shows when a text matches nothing", () => {
    const { found, current } = find([{ text: "loud" }]);

    expect(found.values[0]?.error).toMatch(
      /^nothing displays as "loud"; it shows values like -60\.00 dB/,
    );
    expect(current()).toBe(START);
  });

  it("refuses a number in a unit the param doesn't show", () => {
    const { found, current } = find([
      { text: "500 ms", number: 500 },
      { text: "-6 db", number: -6 },
    ]);

    expect(found.values[0]).toStrictEqual({
      error: "wrong unit: the param shows dB, not ms",
    });
    expect(found.values[1]?.display).toBe("-6.00 dB");
    expect(current()).toBe(START);
  });

  it("finds a number between a -inf end and the first number shown", () => {
    const { found, current } = find(
      [{ text: "-50 dB", number: -50 }, { text: "-inf" }],
      "Plug",
      gain,
    );

    expect(found.low).toBe("-inf dB");
    expect(found.values[0]?.display).toBe("-50.0 dB");
    expect(found.values[0]?.outside).toBeUndefined();
    expect(found.values[1]).toStrictEqual({ value: 0, display: "-inf dB" });
    expect(current()).toBe(START);
  });

  it("samples the param once, however many values are asked", () => {
    const one = find([{ text: "0.00 dB", number: 0 }]);
    const two = find([
      { text: "0.00 dB", number: 0 },
      { text: "0.00 dB", number: 0 },
    ]);

    // Each further value costs its own read, not another 129 samples.
    expect(two.gets() - one.gets()).toBeLessThan(40);
  });

  it("refuses a param the plug-in doesn't have", () => {
    const rig = loadWrapper("Plug");

    rig.run('pname("P")');

    expect(() => rig.run("findValues({ index: 2, values: [] })")).toThrow(
      "no param 2",
    );
  });
});
