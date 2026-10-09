// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  macroPositions,
  macroProblem,
  paramNumber,
} from "./device-param-readback.ts";

/**
 * A rack read with 8 macros, each at the given value out of 127.
 *
 * @param values - Macro values, macro 1 first
 * @param names - Display names by macro number, for renamed macros
 * @returns A read-device result
 */
function rackRead(
  values: number[],
  names: Record<number, string> = {},
): unknown {
  return {
    parameters: values.map((value, i) => ({
      name:
        names[i + 1] == null
          ? `Macro ${i + 1}`
          : `${names[i + 1]} (Macro ${i + 1})`,
      value,
      min: 0,
      max: 127,
    })),
  };
}

describe("paramNumber", () => {
  it("reads a bare number and a display string", () => {
    const result = {
      parameters: [
        { name: "Gain", value: "-6 dB" },
        { name: "Width", value: 100 },
      ],
    };

    expect(paramNumber(result, "Gain")).toBe(-6);
    expect(paramNumber(result, "Width")).toBe(100);
  });

  it("is undefined for a missing param or a value that isn't a number", () => {
    const result = { parameters: [{ name: "Mode", value: "Stereo" }] };

    expect(paramNumber(result, "Gain")).toBeUndefined();
    expect(paramNumber(result, "Mode")).toBeUndefined();
    expect(paramNumber({}, "Gain")).toBeUndefined();
  });
});

describe("macroPositions", () => {
  it("reads renamed and unrenamed macros by their number", () => {
    const positions = macroPositions(
      rackRead([0, 127, 63.5], { 2: "Shaper", 3: "Drive" }),
    );

    expect([...positions.keys()]).toStrictEqual([1, 2, 3]);
    expect(positions.get(2)).toBe(1);
    expect(positions.get(3)).toBeCloseTo(0.5);
  });

  it("ignores params that aren't macros, and macros that read as no number", () => {
    const positions = macroPositions({
      parameters: [
        { name: "Chain Selector", value: 0, min: 0, max: 127 },
        { name: "Macro 1", value: "n/a", min: 0, max: 127 },
        { name: "Macro 2", value: 127 },
      ],
    });

    expect([...positions.keys()]).toStrictEqual([2]);
    expect(positions.get(2)).toBe(1);
  });
});

describe("macroProblem", () => {
  const down = [0, 0, 0, 0, 0, 0, 0, 0];

  it("passes when the wanted macros are up and the rest down", () => {
    const up = [0, 0, 0, 0, 0, 127, 127, 127];

    expect(macroProblem(rackRead(up), [6, 7, 8], 8)).toBeNull();
  });

  it("names a wanted macro left down", () => {
    expect(macroProblem(rackRead(down), [6], 8)).toBe(
      "macro 6 should be up, reads 0.00",
    );
  });

  it("names an unwanted macro that was raised", () => {
    const raised = [127, 0, 0, 0, 0, 127, 0, 0];

    expect(macroProblem(rackRead(raised), [6], 8)).toBe(
      "macro 1 should be down, reads 1.00",
    );
  });

  it("fails when a macro isn't on the read at all", () => {
    expect(macroProblem({ parameters: [] }, [6], 2)).toBe(
      "macro 1 not read; macro 2 not read",
    );
  });
});
