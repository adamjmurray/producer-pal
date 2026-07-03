// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/stark/stark-interpreter.ts";
import { type NoteEvent } from "#src/notation/types.ts";

// Velocity is randomized within a bucket on interpret, so assert the bucket, not
// the exact value (a documented lossy axis).
function bucket(velocity: number): "soft" | "normal" | "accent" {
  if (velocity < 90) return "soft";
  if (velocity >= 112) return "accent";

  return "normal";
}

describe("stark interpreter — empty input", () => {
  it("returns [] for empty string", () => {
    expect(interpretNotation("")).toStrictEqual([]);
  });

  it("returns [] for whitespace-only string", () => {
    expect(interpretNotation("   \n  ")).toStrictEqual([]);
  });

  it("throws a labeled error on unparseable input", () => {
    expect(() => interpretNotation("???")).toThrow(
      /Stark notation parse error/,
    );
  });
});

describe("stark interpreter — drums (event-based)", () => {
  it("four-on-the-floor kick: default /4, one hit per beat", () => {
    const notes = interpretNotation("kick: X X X X");

    expect(notes).toHaveLength(4);
    expect(notes.map((n) => n.pitch)).toStrictEqual([36, 36, 36, 36]);
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 1, 2, 3]);
    expect(notes.every((n) => n.duration === 1)).toBe(true);
  });

  it("z is a rest that advances time (backbeat snare on 2 & 4)", () => {
    const notes = interpretNotation("snare: z X z X");

    expect(notes).toHaveLength(2);
    expect(notes.map((n) => n.pitch)).toStrictEqual([38, 38]);
    expect(notes.map((n) => n.start_time)).toStrictEqual([1, 3]);
  });

  it("header /N sets the line default duration (eighth-note hats)", () => {
    const notes = interpretNotation("hihat /8: z X z X z X z X");

    expect(notes).toHaveLength(4);
    expect(notes.every((n) => n.pitch === 42)).toBe(true);
    expect(notes.map((n) => n.start_time)).toStrictEqual([0.5, 1.5, 2.5, 3.5]);
    expect(notes.every((n) => n.duration === 0.5)).toBe(true);
  });

  it("glued inline /N overrides a single token", () => {
    const notes = interpretNotation("kick: X X/8 X");

    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 1, 1.5]);
    expect(notes.map((n) => n.duration)).toStrictEqual([1, 0.5, 1]);
  });

  it("^ / X / x map to accent / normal / soft velocity buckets", () => {
    const notes = interpretNotation("kick: ^ X x");

    expect(notes.map((n) => bucket(n.velocity))).toStrictEqual([
      "accent",
      "normal",
      "soft",
    ]);
  });

  it("| barlines are visual only and do not advance time", () => {
    const notes = interpretNotation("kick: X | X | X | X");

    expect(notes).toHaveLength(4);
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 1, 2, 3]);
  });

  it("an absolute pitch-name header targets an unmapped pad (C3 = 60)", () => {
    const notes = interpretNotation("C3: X z X");

    expect(notes.map((n) => n.pitch)).toStrictEqual([60, 60]);
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 2]);
  });

  it("skips a drum line whose pitch cannot resolve (out-of-range pitch name)", () => {
    // C9 = MIDI 132, out of range → noteNameToMidi returns null.
    expect(interpretNotation("C9: X X")).toStrictEqual([]);
  });

  it("multiple drum lines interleave on their own pitches", () => {
    const notes = interpretNotation("kick: X z X z\nsnare: z X z X");

    expect(
      notes.filter((n) => n.pitch === 36).map((n) => n.start_time),
    ).toStrictEqual([0, 2]);
    expect(
      notes.filter((n) => n.pitch === 38).map((n) => n.start_time),
    ).toStrictEqual([1, 3]);
  });

  it("resolves a same-pitch+start collision keeping the last note", () => {
    // kick and C1 both resolve to MIDI 36 at t=0.
    const notes = interpretNotation("kick: X\nC1: X");

    expect(notes).toHaveLength(1);
    expect(notes[0]?.pitch).toBe(36);
  });
});

describe("stark interpreter — pitched lines", () => {
  it("melody: literal pitch, accidentals, octave marks", () => {
    const notes = interpretNotation("melody: C Eb G'");

    expect(notes.map((n) => n.pitch)).toStrictEqual([60, 63, 79]);
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 1, 2]);
  });

  it("bass: low register (bare C = C1 = 36)", () => {
    const notes = interpretNotation("bass: C");

    expect(notes[0]?.pitch).toBe(36);
  });

  it("chords: bracket voicing = simultaneous notes", () => {
    const notes = interpretNotation("chords: [C Eb G]/2");

    expect(notes).toHaveLength(3);
    expect(notes.every((n) => n.start_time === 0)).toBe(true);
  });

  it("warns on mixed section types but interprets all", () => {
    const notes = interpretNotation("kick: X\nmelody: C'''''");

    expect(notes.map((n) => n.pitch).sort((a, b) => a - b)).toStrictEqual([
      36, 120,
    ]);
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("mixed section types"),
    );
  });
});

describe("stark interpreter — dotted durations (×1.5)", () => {
  it("a dotted /N is 1.5× the plain value on a note", () => {
    const notes = interpretNotation("melody: C/4. D");

    // C = dotted quarter (1.5 beats); D falls at 1.5 with the /4 default.
    expect(notes.map((n) => n.duration)).toStrictEqual([1.5, 1]);
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 1.5]);
  });

  it("a dotted /N works as the line-header default", () => {
    const notes = interpretNotation("melody /4.: C D E");

    expect(notes.map((n) => n.duration)).toStrictEqual([1.5, 1.5, 1.5]);
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 1.5, 3]);
  });

  it("a dotted rest advances time by 1.5× the value", () => {
    const notes = interpretNotation("melody: C z/4. D");

    // C (default /4 = 1 beat) then a dotted-quarter rest (1.5) → D at 2.5.
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 2.5]);
  });

  it("a dotted /N applies to drum hits and chords", () => {
    const drum = interpretNotation("kick: X/4. X");

    expect(drum.map((n) => n.start_time)).toStrictEqual([0, 1.5]);

    const chord = interpretNotation("chords: [C E]/2.");

    expect(chord).toHaveLength(2);
    expect(chord.every((n) => n.duration === 3)).toBe(true);
  });

  it("rejects a double dot", () => {
    expect(() => interpretNotation("melody: C/4..")).toThrow(
      /Stark notation parse error/,
    );
  });
});

describe("stark interpreter — velocity buckets are within range", () => {
  it("accent hits land in the accent range", () => {
    const notes = interpretNotation("kick: ^ ^ ^ ^");

    expect(notes.every((n: NoteEvent) => n.velocity >= 115)).toBe(true);
  });
});
