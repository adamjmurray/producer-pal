// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { MeterDependentArgError } from "#src/notation/transform/helpers/note-ops/transform-arg-errors.ts";
import {
  applyTransforms,
  tryParseTransform,
} from "#src/notation/transform/transform-evaluator.ts";
import { createTestNote } from "../evaluator/transform-evaluator-test-helpers.ts";

const CALLS = [
  ["swing", (grid: string) => `timing = swing(0.1, ${grid})`],
  ["quant", (grid: string) => `timing = quant(${grid})`],
] as const;

describe.each(CALLS)("a %s() grid", (name, build) => {
  const message = `${name}() grid must be greater than 0`;

  it.each(["-n/8", "0 * n/8", "-1bar", "0", "-0.5", "n0/4", "1 - 1"])(
    "of 0 or less is refused in every meter: %s",
    (grid) => {
      for (const [numerator, denominator] of [
        [4, 4],
        [6, 8],
      ] as const) {
        let error: unknown;

        try {
          tryParseTransform(build(grid), denominator, numerator);
        } catch (thrown) {
          error = thrown;
        }

        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(MeterDependentArgError);
        expect((error as Error).message).toContain(message);
      }
    },
  );

  it("is refused for the whole call, nested in an expression", () => {
    expect(() =>
      tryParseTransform(`timing = 1 * ${build("-n/8").slice(9)}`, 4, 4),
    ).toThrow(message);
  });

  it("is refused before any note changes", () => {
    const notes = createTestNote({ start_time: 0.5 });

    expect(() => applyTransforms(notes, build("-n/8"), 4, 4)).toThrow(message);
    expect(notes[0]?.start_time).toBe(0.5);
  });

  it("fails only the clips it is bad in when it mixes note values", () => {
    // 1bar - n/4 is 3 beats in 4/4, 1 in 2/4 and 0 in 1/4.
    const grid = "1bar - n/4";

    expect(() => tryParseTransform(build(grid), 4, 4)).not.toThrow();

    let error: unknown;

    try {
      tryParseTransform(build(grid), 4, 1);
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBeInstanceOf(MeterDependentArgError);
    expect((error as Error).message).toContain(message);
  });

  it("says when it isn't a finite number", () => {
    expect(() => tryParseTransform(build("pow(0, -1)"), 4, 4)).toThrow(
      `${name}() grid could not be evaluated`,
    );
  });

  it("is left to the notes when it depends on them", () => {
    expect(() =>
      tryParseTransform(build("note.pitch - 60"), 4, 4),
    ).not.toThrow();
  });

  it("is not judged in an audio transform for a note value", () => {
    expect(() =>
      tryParseTransform("gain = quant(-n/8)", 4, undefined, "audio"),
    ).not.toThrow();
  });

  it("is fine when positive", () => {
    for (const grid of ["n/8", "1bar", "0.25", "n/16 * 3"]) {
      expect(() => tryParseTransform(build(grid), 4, 4)).not.toThrow();
    }
  });
});

describe("a bad swing() grid and a bad amount together", () => {
  it("names the grid", () => {
    expect(() => tryParseTransform("timing = swing(0.56, -n/8)", 4, 4)).toThrow(
      "swing() grid must be greater than 0",
    );
  });

  it("still names the amount when only the amount is bad", () => {
    expect(() => tryParseTransform("timing = swing(0.56, n/8)", 4, 4)).toThrow(
      "for 56% swing, use 0.06",
    );
  });
});

describe("a grid of 0 or less that is only known per note", () => {
  it("is still caught as the notes run", () => {
    const notes = createTestNote({ start_time: 0.5, pitch: 60 });

    applyTransforms(notes, "timing = quant(note.pitch - 60)", 4, 4);

    expect(notes[0]?.start_time).toBe(0.5);
  });
});
