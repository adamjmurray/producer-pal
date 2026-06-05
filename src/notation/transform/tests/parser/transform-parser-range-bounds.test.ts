// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";

describe("Transform Parser - half-open range bounds", () => {
  it("expands a whole-bar wildcard N|* to a half-open range", () => {
    const result = parser.parse("3|*: velocity = 0");

    expect(result[0]!.timeRange).toStrictEqual({
      startBar: 3,
      startBeat: 1,
      endBar: 4, // the bar AFTER bar 3
      endBeat: 1,
      endExclusive: true,
    });
  });

  it("expands a whole-bar span A|*-B|* to span the named bars fully", () => {
    const result = parser.parse("1|*-3|*: velocity = 0");

    expect(result[0]!.timeRange).toStrictEqual({
      startBar: 1,
      startBeat: 1,
      endBar: 4, // the bar AFTER bar 3
      endBeat: 1,
      endExclusive: true,
    });
  });

  it("marks the end bound exclusive with -<", () => {
    const result = parser.parse("3|1-<4|1: velocity = 0");

    expect(result[0]!.timeRange).toStrictEqual({
      startBar: 3,
      startBeat: 1,
      endBar: 4,
      endBeat: 1,
      endExclusive: true,
    });
  });

  it("composes a decimal-base offset start with the exclusive-end marker", () => {
    // The `-<` exclusive marker must not be swallowed by the start bound's `+n`
    // offset: `1|1.5+n/12` is the offset start, then `-<2|1` is the half-open end.
    const result = parser.parse("1|1.5+n/12-<2|1: velocity = 0");

    expect(result[0]!.timeRange!.startBar).toBe(1);
    expect(result[0]!.timeRange!.startBeat).toBeCloseTo(1.8333);
    expect(result[0]!.timeRange!.endBar).toBe(2);
    expect(result[0]!.timeRange!.endBeat).toBe(1);
    expect(result[0]!.timeRange!.endExclusive).toBe(true);
  });

  it("omits endExclusive for a default (inclusive) range", () => {
    const result = parser.parse("3|1-4|1: velocity = 0");

    expect(result[0]!.timeRange).toStrictEqual({
      startBar: 3,
      startBeat: 1,
      endBar: 4,
      endBeat: 1,
    });
  });

  it("composes a wildcard with a pitch lane", () => {
    const result = parser.parse("C1 3|*: velocity = 0");

    expect(result[0]!.pitchRange).toStrictEqual({
      startPitch: 36,
      endPitch: 36,
    });
    expect(result[0]!.timeRange!.endExclusive).toBe(true);
  });

  it("rejects a mixed wildcard/beat range", () => {
    expect(() => parser.parse("3|*-4|1: velocity = 0")).toThrow();
  });
});
