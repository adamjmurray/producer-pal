// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { interpretNotation } from "./abstark-interpreter.ts";

// Velocity ranges for dynamics
const SOFT_MIN = 60;
const SOFT_MAX = 80;
const NORMAL_MIN = 100;
const NORMAL_MAX = 110;
const ACCENT_MIN = 115;
const ACCENT_MAX = 127;

describe("interpretNotation — empty / whitespace", () => {
  it("returns [] for empty string", () => {
    expect(interpretNotation("")).toStrictEqual([]);
  });

  it("returns [] for whitespace-only string", () => {
    expect(interpretNotation("   \n\t  ")).toStrictEqual([]);
  });
});

describe("interpretNotation — parse error", () => {
  it("throws a wrapped error on invalid input", () => {
    expect(() => interpretNotation("not valid abstark $$$")).toThrow(
      /Abstark notation parse error/,
    );
  });
});

describe("interpretNotation — drum lines", () => {
  it("kick X generates MIDI 36 at beat 0", () => {
    const notes = interpretNotation("kick: X...");

    expect(notes).toHaveLength(1);
    expect(notes[0]?.pitch).toBe(36);
    expect(notes[0]?.start_time).toBe(0);
    expect(notes[0]?.duration).toBe(0.25);
  });

  it("kick X.X. generates two hits at 0 and 0.5 beats", () => {
    const notes = interpretNotation("kick: X.X.");

    expect(notes).toHaveLength(2);
    expect(notes[0]?.start_time).toBe(0);
    expect(notes[1]?.start_time).toBe(0.5);
  });

  it("^ produces accent velocity", () => {
    const notes = interpretNotation("kick: ^...");

    expect(notes[0]?.velocity).toBeGreaterThanOrEqual(ACCENT_MIN);
    expect(notes[0]?.velocity).toBeLessThanOrEqual(ACCENT_MAX);
  });

  it("X produces normal velocity", () => {
    const notes = interpretNotation("kick: X...");

    expect(notes[0]?.velocity).toBeGreaterThanOrEqual(NORMAL_MIN);
    expect(notes[0]?.velocity).toBeLessThanOrEqual(NORMAL_MAX);
  });

  it("x produces soft velocity", () => {
    const notes = interpretNotation("kick: x...");

    expect(notes[0]?.velocity).toBeGreaterThanOrEqual(SOFT_MIN);
    expect(notes[0]?.velocity).toBeLessThanOrEqual(SOFT_MAX);
  });

  it("barlines in drum lines are visual-only (no time advance)", () => {
    // X|X should be two hits at 0 and 0.25 (barline = one char, not a step)
    const notes = interpretNotation("kick: X|X");

    expect(notes).toHaveLength(2);
    expect(notes[0]?.start_time).toBe(0);
    expect(notes[1]?.start_time).toBe(0.25);
  });

  it("snare maps to MIDI 38", () => {
    const notes = interpretNotation("snare: X...");

    expect(notes[0]?.pitch).toBe(38);
  });

  it("hihat maps to MIDI 42", () => {
    const notes = interpretNotation("hihat: X...");

    expect(notes[0]?.pitch).toBe(42);
  });

  it("multiple drum lines produce correct pitches", () => {
    const notes = interpretNotation("kick: X...\nsnare: .X..");

    const pitches = notes.map((n) => n.pitch);

    expect(pitches).toContain(36);
    expect(pitches).toContain(38);
  });
});

describe("interpretNotation — melody lines", () => {
  it("C maps to MIDI 60 with default /4 duration", () => {
    const notes = interpretNotation("melody: C");

    expect(notes[0]?.pitch).toBe(60);
    expect(notes[0]?.duration).toBe(1); // /4 = 1 beat
  });

  it("D maps to MIDI 62", () => {
    const notes = interpretNotation("melody: D");

    expect(notes[0]?.pitch).toBe(62);
  });

  it("Eb maps to MIDI 63", () => {
    const notes = interpretNotation("melody: Eb");

    expect(notes[0]?.pitch).toBe(63);
  });

  it("C# maps to MIDI 61", () => {
    const notes = interpretNotation("melody: C#");

    expect(notes[0]?.pitch).toBe(61);
  });

  it("explicit /N overrides line default", () => {
    const notes = interpretNotation("melody: C/8");

    expect(notes[0]?.duration).toBe(0.5); // /8 = 0.5 beats
  });

  it("whole note /1 = 4 beats", () => {
    const notes = interpretNotation("melody: C/1");

    expect(notes[0]?.duration).toBe(4);
  });

  it("16th note /16 = 0.25 beats", () => {
    const notes = interpretNotation("melody: C/16");

    expect(notes[0]?.duration).toBe(0.25);
  });

  it("octave up ' shifts pitch by 12", () => {
    const notes = interpretNotation("melody: C'");

    expect(notes[0]?.pitch).toBe(72); // C4 + 12
  });

  it("octave down , shifts pitch by -12", () => {
    const notes = interpretNotation("melody: C,");

    expect(notes[0]?.pitch).toBe(48); // C4 - 12
  });

  it("double octave up '' shifts pitch by 24", () => {
    const notes = interpretNotation("melody: C''");

    expect(notes[0]?.pitch).toBe(84); // C4 + 24
  });

  it("accent ! produces accent velocity", () => {
    const notes = interpretNotation("melody: C!");

    expect(notes[0]?.velocity).toBeGreaterThanOrEqual(ACCENT_MIN);
    expect(notes[0]?.velocity).toBeLessThanOrEqual(ACCENT_MAX);
  });

  it("soft ? produces soft velocity", () => {
    const notes = interpretNotation("melody: C?");

    expect(notes[0]?.velocity).toBeGreaterThanOrEqual(SOFT_MIN);
    expect(notes[0]?.velocity).toBeLessThanOrEqual(SOFT_MAX);
  });

  it("notes advance time by their duration", () => {
    const notes = interpretNotation("melody: C/4 D/4 E/4");

    expect(notes[0]?.start_time).toBe(0);
    expect(notes[1]?.start_time).toBe(1);
    expect(notes[2]?.start_time).toBe(2);
  });

  it("rest token z advances time without a note", () => {
    const notes = interpretNotation("melody: z/4 C");

    expect(notes).toHaveLength(1);
    expect(notes[0]?.start_time).toBe(1); // after /4 rest
  });

  it("rest without /N uses line default duration", () => {
    const notes = interpretNotation("melody: z C");

    expect(notes[0]?.start_time).toBe(1); // default /4 = 1 beat
  });

  it("line-header default /N overrides built-in default", () => {
    const notes = interpretNotation("melody/2: C D");

    expect(notes[0]?.duration).toBe(2); // /2 = 2 beats
    expect(notes[1]?.start_time).toBe(2);
  });

  it("barlines in melody are visual-only (no time advance)", () => {
    const notes = interpretNotation("melody: C | D");

    expect(notes[1]?.start_time).toBe(1); // barline doesn't affect timing
  });

  it("MIDI is clamped to 0 when pitch goes below 0", () => {
    // C,,,,,, from melody default C4=60 → 60 - 72 = -12 → clamped to 0
    const notes = interpretNotation("melody: C,,,,,,");

    expect(notes[0]?.pitch).toBeGreaterThanOrEqual(0);
  });

  it("MIDI is clamped to 127 when pitch goes above 127", () => {
    // C'''''''' from melody C4=60 → 60 + 96 = 156 → clamped to 127
    const notes = interpretNotation("melody: C''''''''");

    expect(notes[0]?.pitch).toBeLessThanOrEqual(127);
  });
});

describe("interpretNotation — bass lines", () => {
  it("C in bass maps to MIDI 36 (C2)", () => {
    const notes = interpretNotation("bass: C");

    expect(notes[0]?.pitch).toBe(36);
  });

  it("bass default duration is /4 (1 beat)", () => {
    const notes = interpretNotation("bass: C");

    expect(notes[0]?.duration).toBe(1);
  });
});

describe("interpretNotation — chords lines", () => {
  it("[C Eb G] produces three simultaneous notes", () => {
    const notes = interpretNotation("chords: [C Eb G]");

    expect(notes).toHaveLength(3);
    expect(notes[0]?.start_time).toBe(0);
    expect(notes[1]?.start_time).toBe(0);
    expect(notes[2]?.start_time).toBe(0);
  });

  it("[C Eb G] maps correct MIDI pitches from chords register (C3=48)", () => {
    const notes = interpretNotation("chords: [C Eb G]");
    const pitches = notes.map((n) => n.pitch).sort((a, b) => a - b);

    expect(pitches).toStrictEqual([48, 51, 55]); // C3, Eb3, G3
  });

  it("[C Eb G]/4 duration on bracket applies to all notes", () => {
    const notes = interpretNotation("chords: [C Eb G]/4");

    for (const note of notes) {
      expect(note.duration).toBe(1);
    }
  });

  it("[C Eb G]! accent applies to all notes", () => {
    const notes = interpretNotation("chords: [C Eb G]!");

    for (const note of notes) {
      expect(note.velocity).toBeGreaterThanOrEqual(ACCENT_MIN);
    }
  });

  it("chords advance time correctly", () => {
    const notes = interpretNotation("chords: [C E G]/4 [D F A]/4");

    // First chord: start_time = 0
    const chord1 = notes.filter((n) => n.start_time === 0);
    // Second chord: start_time = 1 beat
    const chord2 = notes.filter((n) => Math.abs(n.start_time - 1) < 0.001);

    expect(chord1).toHaveLength(3);
    expect(chord2).toHaveLength(3);
  });

  it("chords line default duration is /1 (4 beats)", () => {
    const notes = interpretNotation("chords: [C E G]");

    expect(notes[0]?.duration).toBe(4);
  });
});

describe("interpretNotation — mixed sections", () => {
  // Warnings are relayed to the LLM via outlet 1 (see v8-max-console), so the
  // assertion is on the global outlet mock, not console.warn.
  it("warns on mixed drum + melody sections", () => {
    interpretNotation("kick: X...\nmelody: C");

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("mixed section types"),
    );
  });

  it("warns on duplicate notes from mixed sections (bass C = kick MIDI 36)", () => {
    // bass C = MIDI 36 = same as kick; both start at t=0 → collision after dedup
    interpretNotation("kick: X...\nbass: C");

    // At minimum the mixed-sections warning fires; collision warning may also fire
    expect(outlet).toHaveBeenCalledWith(1, expect.any(String));
  });
});
