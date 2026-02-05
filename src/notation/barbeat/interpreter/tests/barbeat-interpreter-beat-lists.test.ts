// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";

// Helper to create a note with default values
function note(pitch: number, start_time: number, overrides = {}) {
  return {
    pitch,
    start_time,
    duration: 1,
    velocity: 100,
    probability: 1.0,
    velocity_deviation: 0,
    ...overrides,
  };
}

describe("bar|beat interpretNotation() - comma-separated beat lists", () => {
  it("emits buffered pitches at each beat in the list", () => {
    const result = interpretNotation("C1 1|1,2,3,4");

    expect(result).toStrictEqual([0, 1, 2, 3].map((t) => note(36, t)));
  });

  it("handles beat lists with bar shorthand", () => {
    const result = interpretNotation("C1 1|1 D1 |2,4");

    expect(result).toStrictEqual([note(36, 0), note(38, 1), note(38, 3)]);
  });

  it("handles beat lists with eighth notes", () => {
    const result = interpretNotation("F#1 1|1,1.5,2,2.5,3,3.5,4,4.5");

    // Hi-hat at every eighth note position
    const eighthNotes = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t) =>
      note(42, t),
    );

    expect(result).toStrictEqual(eighthNotes);
  });

  it("applies state to all emitted notes in beat list", () => {
    const result = interpretNotation("v80 t0.25 p0.8 C1 1|1,2,3,4");
    const stateOverrides = { duration: 0.25, velocity: 80, probability: 0.8 };

    expect(result).toStrictEqual(
      [0, 1, 2, 3].map((t) => note(36, t, stateOverrides)),
    );
  });

  it("handles chord emission at multiple positions", () => {
    const result = interpretNotation("C3 E3 G3 1|1,3");

    expect(result).toStrictEqual([
      // Chord at beat 1 (start_time 0)
      note(60, 0),
      note(64, 0),
      note(67, 0),
      // Chord at beat 3 (start_time 2)
      note(60, 2),
      note(64, 2),
      note(67, 2),
    ]);
  });

  it("handles drum pattern with beat lists", () => {
    const result = interpretNotation(
      "C1 1|1,3 D1 |2,4 F#1 |1,1.5,2,2.5,3,3.5,4,4.5",
    );

    // Hi-hats on every eighth note
    const hiHats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t) => note(42, t));

    expect(result).toStrictEqual([
      // Kick on beats 1 and 3
      note(36, 0),
      note(36, 2),
      // Snare on beats 2 and 4
      note(38, 1),
      note(38, 3),
      ...hiHats,
    ]);
  });

  it("handles beat lists across multiple bars", () => {
    const result = interpretNotation("C1 1|1,3 2|1,3");

    expect(result).toStrictEqual([0, 2, 4, 6].map((t) => note(36, t)));
  });

  it("clears pitch buffer after first beat list", () => {
    const result = interpretNotation("C1 1|1,2 D1 |3,4");

    expect(result).toStrictEqual([
      // C1 at beats 1 and 2
      note(36, 0),
      note(36, 1),
      // D1 at beats 3 and 4 (buffer cleared after first emission)
      note(38, 2),
      note(38, 3),
    ]);
  });

  it("works with single beat (list of one)", () => {
    const result = interpretNotation("C1 1|1 D1 1|2");

    expect(result).toStrictEqual([note(36, 0), note(38, 1)]);
  });
});
