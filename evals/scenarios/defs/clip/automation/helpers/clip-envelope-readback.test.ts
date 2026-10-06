// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  curveAmounts,
  envelopeValues,
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
