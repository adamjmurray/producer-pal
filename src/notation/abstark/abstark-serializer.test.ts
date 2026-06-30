// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { interpretNotation } from "./abstark-interpreter.ts";
import { formatNotation } from "./abstark-serializer.ts";
import { type NoteEvent } from "#src/notation/types.ts";

function note(
  pitch: number,
  start_time: number,
  duration: number,
  velocity = 100,
): NoteEvent {
  return { pitch, start_time, duration, velocity, probability: 1 };
}

// Velocity → dynamic bucket. Velocity is randomized within a bucket on
// interpret, so round-trip comparisons assert the bucket survives, not the
// exact value (a documented lossy axis).
function bucket(velocity: number): "soft" | "normal" | "accent" {
  if (velocity < 90) return "soft";
  if (velocity >= 112) return "accent";

  return "normal";
}

describe("formatNotation — empty input", () => {
  it("returns empty string for zero notes", () => {
    expect(formatNotation([])).toBe("");
  });
});

describe("formatNotation — melody line", () => {
  it("single C4 (MIDI 60) → melody line with C", () => {
    const result = formatNotation([note(60, 0, 1)]);

    expect(result).toMatch(/^melody:/);
    expect(result).toContain("C");
    expect(result).toContain("/4"); // 1 beat = /4
  });

  it("MIDI 62 (D4) serializes as D", () => {
    const result = formatNotation([note(62, 0, 1)]);

    expect(result).toContain("D");
  });

  it("MIDI 63 (Eb4) serializes as Eb", () => {
    const result = formatNotation([note(63, 0, 1)]);

    expect(result).toContain("Eb");
  });

  it("MIDI 61 (Db4) serializes as Db", () => {
    const result = formatNotation([note(61, 0, 1)]);

    expect(result).toContain("Db");
  });

  it("MIDI 72 (C5) serializes as C with one octave-up mark", () => {
    const result = formatNotation([note(72, 0, 1)]);

    expect(result).toContain("C'");
  });

  it("MIDI 48 (C3) serializes as C with one octave-down mark", () => {
    const result = formatNotation([note(48, 0, 1)]);

    expect(result).toContain("C,");
  });

  it("4-beat whole note → /1", () => {
    const result = formatNotation([note(60, 0, 4)]);

    expect(result).toContain("/1");
  });

  it("2-beat half note → /2", () => {
    const result = formatNotation([note(60, 0, 2)]);

    expect(result).toContain("/2");
  });

  it("0.5-beat eighth → /8", () => {
    const result = formatNotation([note(60, 0, 0.5)]);

    expect(result).toContain("/8");
  });

  it("0.25-beat 16th → /16", () => {
    const result = formatNotation([note(60, 0, 0.25)]);

    expect(result).toContain("/16");
  });

  it("velocity ≥112 → accent suffix !", () => {
    const result = formatNotation([note(60, 0, 1, 115)]);

    expect(result).toContain("!");
  });

  it("velocity <90 → soft suffix ?", () => {
    const result = formatNotation([note(60, 0, 1, 70)]);

    expect(result).toContain("?");
  });

  it("normal velocity (100) produces no dynamic suffix", () => {
    const result = formatNotation([note(60, 0, 1, 100)]);
    const tokenPart = result.split(":")[1] ?? "";

    expect(tokenPart).not.toContain("!");
    expect(tokenPart).not.toContain("?");
  });

  it("gap between notes inserts rest tokens", () => {
    // Note at beat 1, so there is a 1-beat gap before it
    const result = formatNotation([note(60, 1, 1)]);

    expect(result).toContain("z/4"); // 1-beat gap → z/4
  });

  it("2-beat gap inserts z/2 rest", () => {
    const result = formatNotation([note(60, 2, 1)]);

    expect(result).toContain("z/2");
  });

  it("3-beat gap inserts z/2 + z/4", () => {
    const result = formatNotation([note(60, 3, 1)]);
    const tokenPart = result.split(":")[1] ?? "";

    expect(tokenPart).toContain("z/2");
    expect(tokenPart).toContain("z/4");
  });

  it("0.75-beat gap inserts z/8 + z/16 rests", () => {
    // 0.75 beats = 0.5 (z/8) + 0.25 (z/16)
    const result = formatNotation([note(60, 0.75, 1)]);
    const tokenPart = result.split(":")[1] ?? "";

    expect(tokenPart).toContain("z/8");
    expect(tokenPart).toContain("z/16");
  });

  it("two consecutive notes serialize in order without gap", () => {
    // Exercises sort comparators with 2+ notes
    const result = formatNotation([note(60, 0, 1), note(62, 1, 1)]);
    const tokenPart = result.split(":")[1] ?? "";

    expect(tokenPart.trim()).toMatch(/^C\/4 D\/4$/);
  });
});

describe("formatNotation — bass line (pitched, no drumMode)", () => {
  it("MIDI 24 (C1) → bass line (median < 48)", () => {
    const result = formatNotation([note(24, 0, 1)]);

    expect(result).toMatch(/^bass:/);
    expect(result).toContain("C");
  });

  it("MIDI 35 (B1) → bass line (median < 48)", () => {
    const result = formatNotation([note(35, 0, 1)]);

    expect(result).toMatch(/^bass:/);
  });

  it("MIDI 48 (C3) → melody line (threshold is < 48 = bass)", () => {
    const result = formatNotation([note(48, 0, 1)]);

    expect(result).toMatch(/^melody:/);
  });
});

describe("formatNotation — chords line (pitched, no drumMode)", () => {
  it("simultaneous notes → chords line", () => {
    const result = formatNotation([
      note(52, 0, 1),
      note(55, 0, 1),
      note(59, 0, 1),
    ]);

    expect(result).toContain("chords:");
    expect(result).toContain("[");
    expect(result).toContain("]");
  });

  it("chords use bracket notation with /N and dynamic on the bracket", () => {
    const result = formatNotation([note(52, 0, 4, 115), note(55, 0, 4, 115)]);

    // Bracket with duration and accent
    expect(result).toMatch(/\[.*]\/1!/);
  });

  it("multiple chord groups advance time", () => {
    const chord1 = [note(52, 0, 1), note(55, 0, 1)];
    const chord2 = [note(53, 1, 1), note(57, 1, 1)];
    const result = formatNotation([...chord1, ...chord2]);

    // Two bracket groups
    const brackets = (result.match(/\[/g) ?? []).length;

    expect(brackets).toBe(2);
  });

  it("gap before chord group inserts a rest", () => {
    // Chord starts at beat 1 → 1-beat gap from time 0
    const result = formatNotation([note(52, 1, 1), note(55, 1, 1)]);

    expect(result).toContain("z/4");
  });
});

// drumMode = true means the track has a Drum Rack, so EVERY note serializes as
// a drum line (regardless of MIDI pitch). Pass { drumMode: true } explicitly.
const DRUM = { drumMode: true } as const;

describe("formatNotation — drum lines (drumMode)", () => {
  it("MIDI 36 (kick) → kick: line", () => {
    const result = formatNotation([note(36, 0, 0.25)], DRUM);

    expect(result).toMatch(/^kick:/);
  });

  it("MIDI 38 (snare) → snare: line", () => {
    const result = formatNotation([note(38, 0.25, 0.25)], DRUM);

    expect(result).toMatch(/snare:/);
  });

  it("hit at beat 0 → X at first position", () => {
    const result = formatNotation([note(36, 0, 0.25, 100)], DRUM);
    const patternPart = result.split(":")[1]?.trim() ?? "";

    expect(patternPart[0]).toBe("X");
  });

  it("hit at beat 0.25 (2nd 16th) → X at position 1", () => {
    const result = formatNotation([note(36, 0.25, 0.25, 100)], DRUM);
    const patternPart = result.split(":")[1]?.trim() ?? "";
    // Pattern has spaces every 4 chars (beat groups), so position 1 is chars[1]
    const withoutSpaces = patternPart.replaceAll(" ", "");

    expect(withoutSpaces[1]).toBe("X");
  });

  it("accent velocity (115+) → ^", () => {
    const result = formatNotation([note(36, 0, 0.25, 120)], DRUM);
    const patternPart = result.split(":")[1]?.trim() ?? "";
    const withoutSpaces = patternPart.replaceAll(" ", "");

    expect(withoutSpaces[0]).toBe("^");
  });

  it("soft velocity (<90) → x", () => {
    const result = formatNotation([note(36, 0, 0.25, 70)], DRUM);
    const patternPart = result.split(":")[1]?.trim() ?? "";
    const withoutSpaces = patternPart.replaceAll(" ", "");

    expect(withoutSpaces[0]).toBe("x");
  });

  it("two hits on the same drum pitch at different times appear in pattern", () => {
    // Exercises the existing.push(note) branch in serializeDrums
    const result = formatNotation(
      [note(36, 0, 0.25), note(36, 0.5, 0.25)],
      DRUM,
    );
    const patternPart = result.split(":")[1]?.trim() ?? "";
    const withoutSpaces = patternPart.replaceAll(" ", "");

    expect(withoutSpaces[0]).toBe("X"); // beat 0
    expect(withoutSpaces[2]).toBe("X"); // beat 0.5 = step 2
  });

  it("pattern pads to 16 steps minimum", () => {
    const result = formatNotation([note(36, 0, 0.25)], DRUM);
    const patternPart = result.split(":")[1]?.trim() ?? "";
    const withoutSpaces = patternPart.replaceAll(" ", "");

    expect(withoutSpaces).toHaveLength(16);
  });

  it("hit in second bar pads to 32 steps", () => {
    const result = formatNotation([note(36, 4, 0.25)], DRUM); // step 16 = bar 2 beat 1

    const patternPart = result.split(":")[1]?.trim() ?? "";
    const withoutSpaces = patternPart.replaceAll(" ", "");

    expect(withoutSpaces).toHaveLength(32);
  });

  it("multiple drum pitches → one line each", () => {
    const result = formatNotation(
      [note(36, 0, 0.25), note(38, 0.5, 0.25)],
      DRUM,
    );

    expect(result).toContain("kick:");
    expect(result).toContain("snare:");
  });

  it("unnamed drum pitch on a drum track is dropped with a WARNING", () => {
    // MIDI 60 has no Abstark drum-line name; MIDI 36 (kick) does. The WARNING
    // is relayed to the LLM via outlet 1 (see v8-max-console).
    const result = formatNotation([note(36, 0, 0.25), note(60, 0, 0.25)], DRUM);

    expect(result).toContain("kick:");
    expect(result).not.toContain("60");
    expect(outlet).toHaveBeenCalledWith(1, expect.stringContaining("60"));
  });
});

describe("formatNotation — drum-range pitches WITHOUT drumMode (the fix)", () => {
  it("MIDI 36 (kick pitch) on a melodic track → bass, NOT a kick line", () => {
    // The headline regression: without a Drum Rack, C2=36 is a bass note and
    // must round-trip as pitched — never mistaken for a kick drum.
    const result = formatNotation([note(36, 0, 1)]);

    expect(result).toMatch(/^bass:/);
    expect(result).not.toContain("kick");
  });

  it("MIDI 51 (ride pitch) chord tone on a melodic track → pitched", () => {
    const result = formatNotation([
      note(48, 0, 1),
      note(51, 0, 1),
      note(55, 0, 1),
    ]);

    expect(result).toContain("chords:");
    expect(result).not.toContain("ride");
  });
});

// Round-trip: interpret → serialize → interpret must be a fixed point on
// pitch / start_time / duration, and preserve the velocity bucket. This is the
// defining property of Abstark (vs. Stark, which has no serializer).
describe("round-trip (interpret → serialize → interpret)", () => {
  // drumMode mirrors the track context: drum-line inputs round-trip with
  // drumMode true, pitched inputs with drumMode false.
  function roundTrip(
    abstark: string,
    drumMode = false,
  ): {
    first: NoteEvent[];
    second: NoteEvent[];
  } {
    const first = interpretNotation(abstark);
    const second = interpretNotation(formatNotation(first, { drumMode }));

    return { first, second };
  }

  function expectStableNotes(first: NoteEvent[], second: NoteEvent[]): void {
    expect(second).toHaveLength(first.length);

    for (const [i, a] of first.entries()) {
      const b = second[i] as NoteEvent;

      expect(b.pitch).toBe(a.pitch);
      expect(b.start_time).toBeCloseTo(a.start_time, 6);
      expect(b.duration).toBeCloseTo(a.duration, 6);
      expect(bucket(b.velocity)).toBe(bucket(a.velocity));
    }
  }

  it("melody with varied durations and octaves", () => {
    const { first, second } = roundTrip("melody: C/4 Eb/8 G'/2 C''/16");

    expectStableNotes(first, second);
  });

  it("melody with rests (gap fill)", () => {
    const { first, second } = roundTrip("melody: C/4 z/4 D/4 z/2 E/4");

    expectStableNotes(first, second);
  });

  it("melody with dynamics preserves buckets", () => {
    const { first, second } = roundTrip("melody: C! D? E");

    expectStableNotes(first, second);
    expect(bucket(first[0]!.velocity)).toBe("accent");
    expect(bucket(first[1]!.velocity)).toBe("soft");
    expect(bucket(first[2]!.velocity)).toBe("normal");
  });

  it("bass line in low register round-trips (incl. C2=36, the kick pitch)", () => {
    // With drumMode false there is no drum collision: bass C2 (MIDI 36) and
    // G1 (31) serialize as pitched and round-trip exactly. This is the fix for
    // the former MIDI-number-split bug.
    const { first, second } = roundTrip("bass: C/4 G,/4 C/2");

    expectStableNotes(first, second);
    expect(first[0]!.pitch).toBe(36); // C2 — same MIDI as a kick, but pitched here
  });

  it("drum pattern with all hit types", () => {
    const { first, second } = roundTrip("kick: ^.x. X... ^... x...", true);

    expectStableNotes(first, second);
  });

  it("multiple drum lines", () => {
    const { first, second } = roundTrip(
      "kick: X... X...\nsnare: ..X. ..X.",
      true,
    );

    expectStableNotes(first, second);
  });

  it("chords with shared duration and dynamic (incl. Eb3=51, ride pitch)", () => {
    // With drumMode false, chord tones on drum pitches (Eb3=51=ride) stay
    // pitched and round-trip — no longer a lossy axis on melodic tracks.
    const { first, second } = roundTrip("chords: [C Eb G]/2! [D F A]/2");

    expectStableNotes(first, second);
  });

  it("chords are emitted as a chord (simultaneous notes survive)", () => {
    const { first } = roundTrip("chords: [C E G]/1");

    // three simultaneous notes at t=0
    expect(first).toHaveLength(3);
    expect(first.every((n) => n.start_time === 0)).toBe(true);
  });
});
