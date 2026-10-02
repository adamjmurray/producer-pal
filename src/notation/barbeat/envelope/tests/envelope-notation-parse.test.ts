// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reading envelope notation back: connectors, displays a read wrote, and what
// a bad string is told.

import { describe, expect, it } from "vitest";
import { parseEnvelopeNotation } from "#src/notation/barbeat/envelope/envelope-notation.ts";

const FOUR_FOUR = { timeSigNumerator: 4, timeSigDenominator: 4 };
const SIX_EIGHT = { timeSigNumerator: 6, timeSigDenominator: 8 };

describe("parseEnvelopeNotation", () => {
  it("reads ramps and jumps", () => {
    expect(
      parseEnvelopeNotation("1|1 -0.5 > 3|1 0.5 ~ 5|1 0", FOUR_FOUR),
    ).toStrictEqual([
      { time: 0, value: -0.5, jump: false },
      { time: 8, value: 0.5, jump: true },
      { time: 16, value: 0, jump: false },
    ]);
  });

  it("takes two points at one time as a jump", () => {
    expect(
      parseEnvelopeNotation("1|1 0 ~ 3|1 0.25 ~ 3|1 0.9", FOUR_FOUR),
    ).toStrictEqual([
      { time: 0, value: 0, jump: false },
      { time: 8, value: 0.25, jump: false },
      { time: 8, value: 0.9, jump: true },
    ]);
  });

  it("ignores a display a read wrote", () => {
    expect(
      parseEnvelopeNotation(
        "1|1 0.25 (112 Hz) ~ 5|1 0.85 (7.10 kHz) > 9|1 -0.5 (25L)",
        FOUR_FOUR,
      ),
    ).toStrictEqual([
      { time: 0, value: 0.25, jump: false },
      { time: 16, value: 0.85, jump: false },
      { time: 32, value: -0.5, jump: true },
    ]);
  });

  it("does not read a connector inside a display as its own", () => {
    expect(
      parseEnvelopeNotation("1|1 0.5 (> 2 ~ 3) ~ 2|1 1", FOUR_FOUR),
    ).toStrictEqual([
      { time: 0, value: 0.5, jump: false },
      { time: 4, value: 1, jump: false },
    ]);
  });

  it("reads a fractional beat and a bar|beat offset", () => {
    expect(
      parseEnvelopeNotation("1|1.5 0.5 ~ 2|1+n/12 1", FOUR_FOUR),
    ).toStrictEqual([
      { time: 0.5, value: 0.5, jump: false },
      {
        time: expect.closeTo(4 + 1 / 3, 6) as unknown as number,
        value: 1,
        jump: false,
      },
    ]);
  });

  it("reads the times in the clip's own meter", () => {
    expect(parseEnvelopeNotation("1|1 0 ~ 2|1 1", SIX_EIGHT)).toStrictEqual([
      { time: 0, value: 0, jump: false },
      { time: 3, value: 1, jump: false },
    ]);
  });

  it("reads one point, and nothing at all", () => {
    expect(parseEnvelopeNotation("2|1 0.5", FOUR_FOUR)).toStrictEqual([
      { time: 4, value: 0.5, jump: false },
    ]);
    expect(parseEnvelopeNotation("   ", FOUR_FOUR)).toStrictEqual([]);
  });

  it("takes an exponent and a leading +", () => {
    expect(
      parseEnvelopeNotation("1|1 +1e-3 ~ 2|1 .5", FOUR_FOUR),
    ).toStrictEqual([
      { time: 0, value: 0.001, jump: false },
      { time: 4, value: 0.5, jump: false },
    ]);
  });

  it("rejects a connector with nothing on one side", () => {
    expect(() => parseEnvelopeNotation("> 1|1 0.5", FOUR_FOUR)).toThrow(
      /needs a point on each side/,
    );
    expect(() => parseEnvelopeNotation("1|1 0.5 ~", FOUR_FOUR)).toThrow(
      /needs a point on each side/,
    );
  });

  it("rejects a point that isn't bar|beat and a value", () => {
    expect(() => parseEnvelopeNotation("1|1", FOUR_FOUR)).toThrow(
      'Invalid envelope point: "1|1". Expected "bar|beat value", like "1|1 0.5"',
    );
    expect(() => parseEnvelopeNotation("beat3 0.5", FOUR_FOUR)).toThrow(
      /Invalid bar\|beat format: "beat3"/,
    );
    expect(() => parseEnvelopeNotation("0|1 0.5", FOUR_FOUR)).toThrow(
      /bars are 1-indexed/,
    );
  });

  it("rejects a value that isn't a number", () => {
    expect(() => parseEnvelopeNotation("1|1 loud", FOUR_FOUR)).toThrow(
      'Invalid envelope value: "loud" in "1|1 loud". Expected a number, like 0.5 or -1',
    );
    expect(() => parseEnvelopeNotation("1|1 1e999", FOUR_FOUR)).toThrow(
      /Expected a finite number/,
    );
  });

  it("rejects points that go backwards in time", () => {
    expect(() => parseEnvelopeNotation("3|1 0.5 ~ 1|1 0", FOUR_FOUR)).toThrow(
      /must run forwards in time/,
    );
  });

  it("rejects a third point at one time", () => {
    expect(() =>
      parseEnvelopeNotation("1|1 0 ~ 2|1 0.5 ~ 2|1 0.7 ~ 2|1 1", FOUR_FOUR),
    ).toThrow(/Only two envelope points can share a time/);
  });
});
