// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Repeated points and rand() values in envelope notation.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkEnvelopeNotation,
  parseEnvelopeNotation,
} from "#src/notation/barbeat/envelope/envelope-notation.ts";

const FOUR_FOUR = { timeSigNumerator: 4, timeSigDenominator: 4 };
const SIX_EIGHT = { timeSigNumerator: 6, timeSigDenominator: 8 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("envelope repeats", () => {
  it("holds between the points of a repeat that starts the line", () => {
    expect(parseEnvelopeNotation("1|1x3@n/4 0.5", FOUR_FOUR)).toStrictEqual([
      { time: 0, value: 0.5, jump: false },
      { time: 1, value: 0.5, jump: true },
      { time: 2, value: 0.5, jump: true },
    ]);
  });

  it("arrives at every point with the connector before the repeat", () => {
    expect(
      parseEnvelopeNotation(
        "1|1 0 / 1|2x2@n/4 1 ~0.5 2|1x2@1bar 0.2",
        FOUR_FOUR,
      ),
    ).toStrictEqual([
      { time: 0, value: 0, jump: false },
      { time: 1, value: 1, jump: false },
      { time: 2, value: 1, jump: false },
      { time: 4, value: 0.2, jump: false, curve: 0.5 },
      { time: 8, value: 0.2, jump: false, curve: 0.5 },
    ]);
    expect(
      parseEnvelopeNotation("1|1 0 _ 1|2x2@n/4 1", FOUR_FOUR).map(
        ({ jump }) => jump,
      ),
    ).toStrictEqual([false, true, true]);
  });

  it("steps in the clip's meter, from an offset start", () => {
    expect(
      parseEnvelopeNotation("1|1x2@1bar (112 Hz)", SIX_EIGHT),
    ).toStrictEqual([
      { time: 0, display: "112 Hz", jump: false },
      { time: 3, display: "112 Hz", jump: true },
    ]);
    expect(
      parseEnvelopeNotation("1|2+n/8x2@n/8 0", FOUR_FOUR).map(
        ({ time }) => time,
      ),
    ).toStrictEqual([1.5, 2]);
  });

  it("keeps a repeat in time order with the points around it", () => {
    expect(() =>
      parseEnvelopeNotation("1|1x4@n/4 0 / 1|2 1", FOUR_FOUR),
    ).toThrow("must run forwards in time");
  });

  it.each([
    ["1|1x4 0", "Invalid envelope repeat"],
    ["1|1x@n/4 0", "Invalid envelope repeat"],
    ["1|1x0@n/4 0", "Invalid envelope repeat"],
    ["1|1x1001@n/4 0", "from 1 to 1000"],
    ["1|1x4@1 0", "Invalid duration format"],
    ["1|1x2@0bar 0", "must move forwards"],
    ["0|1x4@n/4 0", "1|1"],
  ])("refuses %s without a clip", (text, message) => {
    expect(() => checkEnvelopeNotation(text)).toThrow(message);
  });

  it.each([
    "1|1 rand(-1,1) x32@n/16",
    "1|1 x32@n/16 0.5",
    "1|1 0.5 x 4 @n/4",
    "1|1 0.5x4@n/16",
    "1|1 rand(0, 1)x4@n/16",
    "1|1x2 @n/4 0",
    "1|1x2@ n/4 0",
  ])("says where the repeat goes for %s", (text) => {
    expect(() => checkEnvelopeNotation(text)).toThrow(
      'right after the time, with no space, like "1|1x32@n/16 rand(0, 1)"',
    );
  });

  it("keeps the plain errors for a well-placed repeat", () => {
    expect(() => checkEnvelopeNotation("1|1x4@n/4 abc")).toThrow(
      "Expected a number",
    );
    expect(() => checkEnvelopeNotation("1|1x4@n/4")).toThrow(
      'Expected "bar|beat value"',
    );
  });

  it("jumps from a repeat's last point to a later one", () => {
    expect(
      parseEnvelopeNotation("1|1x2@n/4 0 _ 2|1 1", FOUR_FOUR),
    ).toStrictEqual([
      { time: 0, value: 0, jump: false },
      { time: 1, value: 0, jump: true },
      { time: 4, value: 1, jump: true },
    ]);
  });

  it("refuses a step that doesn't move forwards in this meter", () => {
    const text = "1|1x4@1bar-n3/4 0";

    expect(() => checkEnvelopeNotation(text)).not.toThrow();
    expect(() =>
      parseEnvelopeNotation(text, {
        timeSigNumerator: 3,
        timeSigDenominator: 4,
      }),
    ).toThrow("must move forwards");
  });
});

describe("envelope rand()", () => {
  it("gives each point of a repeat the range to roll from", () => {
    const rand = { min: 0.5, max: 1 };

    expect(
      parseEnvelopeNotation("1|1x2@n/16 rand(0.5, 1)", FOUR_FOUR),
    ).toStrictEqual([
      { time: 0, rand, jump: false },
      { time: 0.25, rand, jump: true },
    ]);
  });

  it("takes the ranges the transforms' rand() takes", () => {
    const ranges = parseEnvelopeNotation(
      "1|1 rand() / 2|1 rand(4) / 3|1 random(2,3) (a display)",
      FOUR_FOUR,
    ).map((point) => "rand" in point && point.rand);

    expect(ranges).toStrictEqual([
      { min: -1, max: 1 },
      { min: 0, max: 4 },
      { min: 2, max: 3 },
    ]);
  });

  it("takes display values as the ends of a range", () => {
    expect(
      parseEnvelopeNotation(
        "1|1 rand((200 Hz), (1/4 [dotted])) / 2|1 rand(0.1, ( 2 kHz ))",
        FOUR_FOUR,
      ).map((point) => "rand" in point && point.rand),
    ).toStrictEqual([
      { min: { display: "200 Hz" }, max: { display: "1/4 (dotted)" } },
      { min: 0.1, max: { display: "2 kHz" } },
    ]);
  });

  it("reads a rand() split over lines", () => {
    expect(() => checkEnvelopeNotation("1|1 rand(0,\n1)")).not.toThrow();
  });

  it.each([
    "rand(a)",
    "rand(1,2,3)",
    "rand(1,)",
    "rand(0, 1e400)",
    "rand((2 kHz))",
    "rand((), 1)",
  ])("refuses %s", (value) => {
    expect(() => checkEnvelopeNotation(`1|1 ${value}`)).toThrow(
      "rand takes numbers, or display values in parentheses",
    );
  });

  it("rolls a curve amount for each point the connector arrives at", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.75)
      .mockReturnValueOnce(0.5);

    expect(
      parseEnvelopeNotation("1|1 0 ~rand(-0.5, 0.5) 1|2x3@n/4 1", FOUR_FOUR),
    ).toStrictEqual([
      { time: 0, value: 0, jump: false },
      { time: 1, value: 1, jump: false, curve: -0.5 },
      { time: 2, value: 1, jump: false, curve: 0.25 },
      // A roll of 0 is a straight ramp.
      { time: 3, value: 1, jump: false },
    ]);
  });

  it.each([
    ["~rand(-2, 1)", "plain numbers from -1 to 1"],
    ["~rand(1.5)", "plain numbers from -1 to 1"],
    ["~rand(a)", "rand takes numbers"],
    ["~rand((1 Hz), (2 Hz))", "plain numbers from -1 to 1"],
  ])("refuses the curve %s", (curve, message) => {
    expect(() => checkEnvelopeNotation(`1|1 0 ${curve} 2|1 1`)).toThrow(
      message,
    );
  });

  it("rolls nothing when only the syntax is checked", () => {
    const random = vi.spyOn(Math, "random");

    checkEnvelopeNotation("1|1x8@n/8 rand(0, 1) ~rand() 3|1 0");

    expect(random).not.toHaveBeenCalled();
  });
});
