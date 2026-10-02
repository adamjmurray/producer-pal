// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  MeterDependentArgError,
  TransformArgError,
} from "#src/notation/transform/helpers/note-ops/transform-arg-errors.ts";
import { tryParseTransform } from "#src/notation/transform/transform-evaluator.ts";

describe("note op arguments that are wrong for every clip", () => {
  it.each([
    ["split()", "split() needs one or more bar|beat positions"],
    ["ratchet()", "ratchet() needs a count or note value"],
    ["ratchet(2, 3)", "ratchet() takes a single count or note value"],
    [
      "ratchet(C2)",
      'ratchet() takes a count or note value, not the pitch name "C2"',
    ],
    ["ratchet(1)", "ratchet() needs a count of 2 or more"],
    ["ratchet(0)", "ratchet() needs a count of 2 or more"],
    ["ratchet(n/16 - n/8)", "ratchet() needs a count of 2 or more"],
    ["ratchet(n/8 * 2)", "ratchet() needs a count of 2 or more"],
    ["ratchet(n0/4)", "ratchet() grid must be greater than 0"],
    ["ratchet(3 - 3)", "ratchet() needs a count of 2 or more"],
    ["ratchet(pow(0, -1))", "ratchet() argument could not be evaluated"],
    [
      `ratchet(${"9".repeat(62)} * ${"9".repeat(62)} * ${"9".repeat(62)} * ${"9".repeat(62)} * ${"9".repeat(62)} * ${"9".repeat(62)})`,
      "ratchet() argument must be a finite number",
    ],
    ["repeat()", "repeat() needs an offset"],
    [
      "repeat(n/8, 2, 3)",
      "repeat() takes an offset and an optional copy count",
    ],
    ["repeat(2)", "repeat() offset must be a note value like n/8"],
    ["repeat(rand(1, 2))", "repeat() offset must be a note value like n/8"],
    ["repeat(n0/4)", "repeat() offset must be greater than 0"],
    [
      "repeat(n/8, C3)",
      'repeat() takes a copy count like repeat(n/8, 3), not the pitch name "C3"',
    ],
    ["repeat(n/8, 0)", "repeat() needs a copy count of 1 or more"],
    ["repeat(n/8, 1 - 4)", "repeat() needs a copy count of 1 or more"],
    ["repeat(n/8, pow(0, -1))", "repeat() copy count could not be evaluated"],
    ["merge(n/16, n/8)", "merge() takes a single gap tolerance"],
    ["merge(2)", "merge() gap tolerance must be a note value like n/16"],
    ["merge(1bar)", "merge() gap tolerance must be a note value like n/16"],
    ["merge(C3)", "merge() gap tolerance must be a note value like n/16"],
    [
      "merge(n/16 + n/16)",
      "merge() gap tolerance must be a note value like n/16",
    ],
  ])("refuses %s", (transform, message) => {
    expect(() => tryParseTransform(transform, 4, 4)).toThrow(message);
  });

  it("judges bar lengths in the meter the transform runs in", () => {
    const transform = "repeat(n/8, 1bar - 4)";

    expect(() => tryParseTransform(transform, 4, 4)).toThrow(
      "repeat() needs a copy count of 1 or more",
    );
    expect(() => tryParseTransform(transform, 4, 6)).not.toThrow();
  });

  // Refused up front, whatever the clips' meters.
  it.each([
    "ratchet(1)",
    "ratchet(C2)",
    "ratchet(3 - 3)",
    "ratchet(n0/4)",
    "ratchet(pow(0, -1))",
    "repeat(n/8, 0)",
    "repeat(n/8, 1 - 4)",
    "repeat(n0/4)",
    "repeat(2)",
    "merge(2)",
    "velocity = curve(0, 100, 0)",
    "ratchet(-n/8)",
    "ratchet(-1bar)",
    "repeat(n/8, -1bar)",
    "velocity = curve(0, 100, -1bar)",
    "ratchet(0 * n/8)",
  ])("refuses %s in every meter", (transform) => {
    for (const [numerator, denominator] of [
      [4, 4],
      [6, 8],
    ] as const) {
      expect(() =>
        tryParseTransform(transform, denominator, numerator),
      ).toThrow(TransformArgError);
    }
  });

  // Note values and bar lengths mixed with other terms come out differently in
  // each meter, so a bad one belongs to that clip, not to the call.
  it.each([
    ["repeat(n/8, 1bar - 4)", "repeat() needs a copy count of 1 or more"],
    ["ratchet(1bar - 4)", "ratchet() needs a count of 2 or more"],
    ["ratchet(n/16 - n/8)", "ratchet() needs a count of 2 or more"],
    ["ratchet(n/8 * 2)", "ratchet() needs a count of 2 or more"],
    ["ratchet(pow(1bar, 999))", "ratchet() argument could not be evaluated"],
    ["velocity = curve(0, 100, 1bar - 4)", "curve() exponent must be > 0"],
  ])(
    "fails %s for the clip it is bad in, not for the call",
    (transform, message) => {
      let error: unknown;

      try {
        tryParseTransform(transform, 4, 4);
      } catch (thrown) {
        error = thrown;
      }

      expect(error).toBeInstanceOf(MeterDependentArgError);
      expect(error).not.toBeInstanceOf(TransformArgError);
      expect((error as Error).message).toContain(message);
    },
  );

  it("takes a scaled duration as a count in a meter where it reaches 2", () => {
    expect(() => tryParseTransform("ratchet(n/8 * 2)", 8, 4)).not.toThrow();
  });

  it("takes the same text in a meter where the argument is fine", () => {
    expect(() =>
      tryParseTransform("repeat(n/8, 1bar - 4)", 4, 6),
    ).not.toThrow();
    expect(() =>
      tryParseTransform("velocity = curve(0, 100, 1bar - 4)", 4, 6),
    ).not.toThrow();
  });

  it("reports a meter-independent mistake even after a meter-dependent one", () => {
    expect(() =>
      tryParseTransform("repeat(n/8, 1bar - 4)\nratchet(1)", 4, 4),
    ).toThrow(TransformArgError);
  });

  it.each([
    "split(2|1, 2|3)",
    "ratchet(2)",
    "ratchet(n/16)",
    "ratchet(1bar)",
    "ratchet(C2 - C1)",
    "repeat(n/8)",
    "repeat(1bar, 3)",
    "merge()",
    "merge(0)",
    "merge(n/16)",
  ])("accepts %s", (transform) => {
    expect(() => tryParseTransform(transform, 4, 4)).not.toThrow();
  });

  // The cap is reported as the op runs, since the request itself is valid.
  it.each(["ratchet(500)", "repeat(n/16, 100)"])(
    "accepts %s, which the op caps as it runs",
    (transform) => {
      expect(() => tryParseTransform(transform, 4, 4)).not.toThrow();
    },
  );

  // These are only known as the op runs, so the op judges them.
  it.each([
    "ratchet(rand(0, 0))",
    "ratchet(clip.index)",
    "ratchet(note.pitch - 60)",
    "repeat(n/8, rand(0, 0))",
    "repeat(n/8, audio.gain)",
    "repeat(n/8, seq(0, 1))",
  ])("leaves %s to the op", (transform) => {
    expect(() => tryParseTransform(transform, 4, 4)).not.toThrow();
  });

  it("leaves note ops alone in an audio transform, which ignores them", () => {
    expect(() =>
      tryParseTransform("ratchet(0)", 4, undefined, "audio"),
    ).not.toThrow();
  });
});
