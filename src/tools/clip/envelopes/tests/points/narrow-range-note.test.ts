// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { narrowRangeNote } from "#src/tools/clip/envelopes/points/narrow-range-note.ts";
import { type ParameterInfo } from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";

/**
 * A parameter as the remote script describes it.
 * @param min - Its lowest raw value
 * @param max - Its highest raw value
 * @param quantized - Whether it is stepped
 * @returns The parameter
 */
function parameter(min: number, max: number, quantized = false): ParameterInfo {
  return {
    name: "Mod Wheel",
    min,
    max,
    value: 0,
    display: "0",
    quantized,
    enabled: true,
    automation_state: 0,
  };
}

/**
 * Points holding the given values, a beat apart.
 * @param values - The values
 * @returns The points
 */
function points(...values: number[]): { time: number; value: number }[] {
  return values.map((value, time) => ({ time, value }));
}

describe("narrowRangeNote", () => {
  it("notes a 0..1 ramp on a 0..127 parameter", () => {
    expect(narrowRangeNote(points(0, 1), parameter(0, 127))).toBe(
      "values span 0..1 of the param's 0..127 range",
    );
  });

  it("notes a flat fraction on a -64..64 parameter", () => {
    expect(narrowRangeNote(points(0.5), parameter(-64, 64))).toBe(
      "values span 0.5..0.5 of the param's -64..64 range",
    );
  });

  it.each([
    ["a value above 1", points(0, 127), parameter(0, 127)],
    ["a value below 0", points(-1, 1), parameter(-64, 64)],
    ["all zeros", points(0, 0), parameter(0, 127)],
    ["a 0..1 parameter", points(0, 1), parameter(0, 1)],
    ["pan's -1..1", points(0, 1), parameter(-1, 1)],
    ["a stepped parameter", points(0, 1), parameter(0, 127, true)],
    ["no parameter in the answer", points(0, 1), undefined],
  ])("says nothing for %s", (_, written, param) => {
    expect(narrowRangeNote(written, param)).toBeUndefined();
  });
});
