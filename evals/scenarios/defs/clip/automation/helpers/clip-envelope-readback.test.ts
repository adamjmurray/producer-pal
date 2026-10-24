// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  curveAmounts,
  envelopeValues,
  rampShareOfRise,
  risesOverTime,
} from "./clip-envelope-readback.ts";

describe("envelopeValues", () => {
  it("reads points joined by each kind of connector", () => {
    expect(
      envelopeValues("1|1 0 / 2|1 0.5 _ 3|1 0.2 ~-0.5 4|1 1 ~0.25 5|1 0"),
    ).toStrictEqual([0, 0.5, 0.2, 1, 0]);
  });

  it("ignores Live's display text", () => {
    expect(envelopeValues("1|1 0.4 (-12 dB) / 2|1 0.85 (0 dB)")).toStrictEqual([
      0.4, 0.85,
    ]);
  });

  it("reads a fractional beat time as one time", () => {
    expect(envelopeValues("1|2+n/12 0.1 / 2|1 0.9")).toStrictEqual([0.1, 0.9]);
  });

  it("reads nothing from no notation", () => {
    expect(envelopeValues(undefined)).toStrictEqual([]);
  });
});

describe("curveAmounts", () => {
  it("lists the curved ramps and skips straight ones and jumps", () => {
    expect(
      curveAmounts("1|1 0 / 2|1 0.5 _ 3|1 0.2 ~-0.5 4|1 1 ~0.25 5|1 0"),
    ).toStrictEqual([-0.5, 0.25]);
  });

  it("ignores numbers in a display", () => {
    expect(curveAmounts("1|1 0 (a ~0.5 b) / 2|1 1")).toStrictEqual([]);
  });

  it("is empty for a straight ramp", () => {
    expect(curveAmounts("1|1 0 / 2|1 1")).toStrictEqual([]);
  });
});

describe("rampShareOfRise", () => {
  const share = (events: string): number =>
    rampShareOfRise({ parameter: "Track Volume", eventCount: 2, events });

  it.each([
    ["a straight ramp", "1|1 0 / 3|1 1"],
    ["a curved ramp", "1|1 0 ~-0.7 3|1 1"],
    ["a ramp after a hold", "1|1 0 _ 1|3 0 / 3|1 0.85"],
    ["a ramp with Live's display text", "1|1 0 (-inf dB) / 3|1 0.85 (0 dB)"],
    ["a ramp then a plateau", "1|1 0 ~0.5 2|1 0.85 / 3|1 0.85"],
  ])("is 1 for %s", (_name, events) => {
    expect(share(events)).toBe(1);
  });

  it.each([
    ["a hold then a jump", "1|1 0 _ 2|1 1"],
    ["a staircase", "1|1 0 _ 1|3 0.5 _ 2|1 1"],
  ])("is 0 for %s", (_name, events) => {
    expect(share(events)).toBe(0);
  });

  it("counts only the ramped part of a mixed envelope", () => {
    expect(share("1|1 0 / 2|1 0.25 _ 3|1 1")).toBe(0.25);
  });

  it("is 0 for an envelope that falls or has no notation", () => {
    expect(share("1|1 1 / 3|1 0")).toBe(0);
    expect(share("")).toBe(0);
  });
});

describe("risesOverTime", () => {
  it("sees a rise through a curved ramp", () => {
    expect(
      risesOverTime({
        parameter: "Track Volume",
        eventCount: 2,
        events: "1|1 0 ~-0.5 3|1 0.85",
      }),
    ).toBe(true);
  });
});
