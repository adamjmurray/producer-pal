// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";

describe("Transform Parser - time range selectors", () => {
  it("parses bar|beat-bar|beat range", () => {
    const result = parser.parse("1|1-3|1: velocity += 10");

    expect(result[0]!.timeRange).toStrictEqual({
      startBar: 1,
      startBeat: 1,
      endBar: 3,
      endBeat: 1,
    });
  });

  it("parses fractional beats in range", () => {
    const result = parser.parse("1|1.5-2|3.5: velocity += 10");

    expect(result[0]!.timeRange).toStrictEqual({
      startBar: 1,
      startBeat: 1.5,
      endBar: 2,
      endBeat: 3.5,
    });
  });

  it("parses +n note-value offset bounds", () => {
    const result = parser.parse("1|1+n/12-2|2-n/24: velocity += 10");

    // 4/4 default: n/12 = 1/3 beat, n/24 = 1/6 beat
    expect(result[0]!.timeRange!.startBeat).toBeCloseTo(1.3333);
    expect(result[0]!.timeRange!.endBeat).toBeCloseTo(1.8333);
  });

  it("parses a decimal-base offset on the start bound (1|1.5+n/12-2|1)", () => {
    const result = parser.parse("1|1.5+n/12-2|1: velocity += 10");

    // 4/4 default: 1.5 + n/12 (1/3 beat) = 1.8333
    expect(result[0]!.timeRange!.startBar).toBe(1);
    expect(result[0]!.timeRange!.startBeat).toBeCloseTo(1.8333);
    expect(result[0]!.timeRange!.endBar).toBe(2);
    expect(result[0]!.timeRange!.endBeat).toBe(1);
  });

  it("parses a decimal-base offset on the end bound (1|1-2|1.5+n/12)", () => {
    const result = parser.parse("1|1-2|1.5+n/12: velocity += 10");

    expect(result[0]!.timeRange!.startBar).toBe(1);
    expect(result[0]!.timeRange!.startBeat).toBe(1);
    expect(result[0]!.timeRange!.endBar).toBe(2);
    expect(result[0]!.timeRange!.endBeat).toBeCloseTo(1.8333);
  });

  it("resolves n offsets meter-relative to timeSigDenominator", () => {
    // n/12 = 1/12 whole note → 1/3 beat in 4/4, 2/3 beat in 6/8.
    const in44 = parser.parse("1|1+n/12-2|1: velocity += 10", {
      timeSigDenominator: 4,
    });
    const in68 = parser.parse("1|1+n/12-2|1: velocity += 10", {
      timeSigDenominator: 8,
    });

    expect(in44[0]!.timeRange!.startBeat).toBeCloseTo(1.3333);
    expect(in68[0]!.timeRange!.startBeat).toBeCloseTo(1.6667);
  });

  it("rejects bare fractions in a range bound", () => {
    expect(() => parser.parse("1|4/3-2|1: velocity += 10")).toThrow(
      /bare fraction/,
    );
  });

  it("rejects mixed numbers in a range bound", () => {
    expect(() => parser.parse("1|1+1/3-2|1: velocity += 10")).toThrow(
      /note-value form/,
    );
  });

  it("gives the targeted note-value steer for a decimal offset base too", () => {
    // The integer-base malformed offset (`1|1+2`) and the decimal-base one
    // (`1|1.5+2`) both get the targeted steer; previously the decimal base fell
    // through to a generic peggy error.
    expect(() => parser.parse("1|1+2-2|1: velocity += 10")).toThrow(
      /note-value form/,
    );
    expect(() => parser.parse("1|1.5+2-2|1: velocity += 10")).toThrow(
      /note-value form/,
    );
    // The valid decimal offset still parses.
    expect(() => parser.parse("1|1.5+n/4-2|1: velocity += 10")).not.toThrow();
  });

  it("rejects a descending/inverted time range", () => {
    // Mirrors the pitchRange descending guard: end-before-start is a parse
    // error, not a silent no-op. Equal bounds (a point range) stay valid.
    expect(() => parser.parse("2|1-1|1: velocity += 10")).toThrow(
      /end .* is before start/,
    );
    expect(() => parser.parse("1|1-1|1: velocity += 10")).not.toThrow();
  });

  it("rejects a 0-indexed beat in a range bound (either end)", () => {
    // Beats are 1-indexed in time ranges too; the error steers to 1|1 / the
    // offset pickup form, never the phased-out 1|0 spelling.
    expect(() => parser.parse("1|0-2|1: velocity += 10")).toThrow(
      /beats are 1-indexed.*1\|1-n\/4.*Got beat 0/,
    );
    expect(() => parser.parse("1|1-2|0: velocity += 10")).toThrow(
      /beats are 1-indexed.*Got beat 0/,
    );
  });

  it("borrows across the bar line for a -n bound before the downbeat", () => {
    // `2|1-n/12` start bound = just before the bar-2 downbeat → bar 1, beat 4⅔
    // in 4/4. The separator `-` before `3|1` is not consumed as an offset.
    const result = parser.parse("2|1-n/12-3|1: velocity += 10");

    expect(result[0]!.timeRange!.startBar).toBe(1);
    expect(result[0]!.timeRange!.startBeat).toBeCloseTo(4.6667);
    expect(result[0]!.timeRange!.endBar).toBe(3);
    expect(result[0]!.timeRange!.endBeat).toBe(1);
  });

  it("resolves a -n bound before 1|1 to a pre-clip-start position (no throw)", () => {
    // `1|1-n/2` = bar 1 minus a half note → bar 0, beat 3 (negative time when
    // resolved). Allowed, not rejected.
    const result = parser.parse("1|1-n/2-2|1: velocity += 10");

    expect(result[0]!.timeRange!.startBar).toBe(0);
    expect(result[0]!.timeRange!.startBeat).toBe(3);
    expect(result[0]!.timeRange!.endBar).toBe(2);
    expect(result[0]!.timeRange!.endBeat).toBe(1);
  });
});
