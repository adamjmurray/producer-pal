// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/stark/stark-interpreter.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

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

  it("resolves enharmonic pitch-name headers arithmetically (Cb/E#/Fb/B#)", () => {
    // pitch.ts's exact table lacks these spellings; the arithmetic path accepts
    // them, matching how melody/bass note tokens resolve pitch. Ableton C3=60:
    // Cb2=47, E#3=65 (=F3), Fb2=52, B#3=72 (=C4).
    expect(interpretNotation("Cb2: X X X X").map((n) => n.pitch)).toStrictEqual(
      [47, 47, 47, 47],
    );
    expect(interpretNotation("E#3: X").map((n) => n.pitch)).toStrictEqual([65]);
    expect(interpretNotation("Fb2: X").map((n) => n.pitch)).toStrictEqual([52]);
    expect(interpretNotation("B#3: X").map((n) => n.pitch)).toStrictEqual([72]);
  });

  it("skips a drum line whose pitch cannot resolve (out-of-range pitch name)", () => {
    // C9 = MIDI 132, out of range → drumHeaderPitch returns null.
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

  it("melody: bracket voicing = simultaneous notes", () => {
    const notes = interpretNotation("melody: [C Eb G]/2");

    expect(notes).toHaveLength(3);
    expect(notes.every((n) => n.start_time === 0)).toBe(true);
  });

  it("warns when drum and pitched lines share a clip but interprets all", () => {
    const notes = interpretNotation("kick: X\nmelody: C'''''");

    expect(notes.map((n) => n.pitch).toSorted((a, b) => a - b)).toStrictEqual([
      36, 120,
    ]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("mixed drum and pitched sections"),
    );
  });

  it("does not warn for a legit two-register pitched clip (bass + melody)", () => {
    const notes = interpretNotation("bass: C\nmelody: G");

    expect(notes.map((n) => n.pitch).toSorted((a, b) => a - b)).toStrictEqual([
      36, 67,
    ]);
    expect(capturedWarnings()).toHaveLength(0);
  });
});

// Absolute octaves are accepted but not taught in the Skills (ADR-0018).
describe("stark interpreter — absolute octaves on note tokens", () => {
  it("pins the pitch, ignoring the line register", () => {
    const melody = interpretNotation("melody: C3 C4 C1");
    const bass = interpretNotation("bass: C3");

    expect(melody.map((n) => n.pitch)).toStrictEqual([60, 72, 36]);
    expect(bass[0]?.pitch).toBe(60);
  });

  it("takes accidentals and negative octaves", () => {
    const notes = interpretNotation("melody: F#1 Gb-1 Cb3");

    expect(notes.map((n) => n.pitch)).toStrictEqual([42, 18, 59]);
  });

  it("coexists with durations, dynamics, and repeats", () => {
    const notes = interpretNotation("melody: C3/8! D#4/2*2");

    expect(notes.map((n) => n.pitch)).toStrictEqual([60, 75, 75]);
    expect(notes.map((n) => n.duration)).toStrictEqual([0.5, 2, 2]);
    expect(bucket(notes[0]?.velocity as number)).toBe("accent");
  });

  it("octave marks shift from the absolute octave", () => {
    const notes = interpretNotation("melody: C3' C3,");

    expect(notes.map((n) => n.pitch)).toStrictEqual([72, 48]);
  });

  it("works inside a bracket voicing, on melody and chords lines", () => {
    const melody = interpretNotation("melody: [C3 E3 G3]/2");
    const chords = interpretNotation("chords: [C3 E3 G3]");

    expect(melody.map((n) => n.pitch)).toStrictEqual([60, 64, 67]);
    expect(chords.map((n) => n.pitch)).toStrictEqual([60, 64, 67]);
  });

  it("warn-skips an out-of-range octave but still advances time", () => {
    const notes = interpretNotation("melody: C9 D3");

    expect(notes.map((n) => n.pitch)).toStrictEqual([62]);
    expect(notes[0]?.start_time).toBe(1);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining('note "C9" is out of MIDI range'),
    );
  });

  it("re-spells the octave marks that pushed a note out of range", () => {
    const notes = interpretNotation("melody: C-2, D3");

    expect(notes.map((n) => n.pitch)).toStrictEqual([62]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining('note "C-2," is out of MIDI range'),
    );
  });

  it("warn-skips only the offending note of a bracket voicing", () => {
    const notes = interpretNotation("melody: [C3 E-3 G3]");

    expect(notes.map((n) => n.pitch)).toStrictEqual([60, 67]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining('note "E-3" is out of MIDI range'),
    );
  });

  it("does not apply to chord symbols — the digits stay qualities", () => {
    const notes = interpretNotation("chords: C7");

    expect(notes.map((n) => n.pitch)).toStrictEqual([48, 52, 55, 58]);
  });
});

describe("stark interpreter — chord symbols (chords line)", () => {
  it("a bare root is a major triad at the chord register (C2=48), /1 default", () => {
    const notes = interpretNotation("chords: C");

    expect(notes.map((n) => n.pitch)).toStrictEqual([48, 52, 55]);
    expect(notes.every((n) => n.duration === 4)).toBe(true);
  });

  it("realizes a quality (minor seventh) and a slash bass", () => {
    expect(interpretNotation("chords: Cm7").map((n) => n.pitch)).toStrictEqual([
      48, 51, 55, 58,
    ]);
    // G7/B: G7 = [55,59,62,65] with the B dropped to 47, just below the root.
    expect(interpretNotation("chords: G7/B").map((n) => n.pitch)).toStrictEqual(
      [47, 55, 59, 62, 65],
    );
  });

  it("octave marks shift the whole chord down an octave", () => {
    expect(interpretNotation("chords: C,").map((n) => n.pitch)).toStrictEqual([
      36, 40, 43,
    ]);
  });

  it("advances time per chord (event-based)", () => {
    const notes = interpretNotation("chords: C G");

    expect(
      notes.filter((n) => n.start_time === 0).map((n) => n.pitch),
    ).toStrictEqual([48, 52, 55]);
    expect(
      notes.filter((n) => n.start_time === 4).map((n) => n.pitch),
    ).toStrictEqual([55, 59, 62]);
  });

  it("*N repeats a whole chord", () => {
    const notes = interpretNotation("chords: C*2");

    expect(notes).toHaveLength(6);
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 0, 0, 4, 4, 4]);
  });

  it("a bar marker does not advance time; a rest does", () => {
    // C then | then G: the barline advances nothing, so G lands at beat 4.
    expect(
      interpretNotation("chords: C | G").filter((n) => n.start_time === 4),
    ).toHaveLength(3);

    // C (/2 = 2 beats) then a /2 rest (2 beats) → G at beat 4.
    expect(
      interpretNotation("chords /2: C z/2 G").filter((n) => n.start_time === 4),
    ).toHaveLength(3);
  });

  it("throws on an unknown quality instead of silently dropping the chord", () => {
    expect(() => interpretNotation("chords: C Cwat G")).toThrow(
      'unknown chord symbol "Cwat"',
    );
  });

  it("throws on two chords with a missing space, naming the merged token", () => {
    // `CG` lexes as ONE token (root C, quality "G"). Warn-skipping it would
    // silently drop both intended chords AND advance only one slot, desyncing
    // everything after — so it must hard-error like any other invalid token.
    expect(() => interpretNotation("chords: CG Am")).toThrow(
      'unknown chord symbol "CG"',
    );
  });

  it("throws on a chord with unlexable trailing junk, naming the whole token", () => {
    // `/9` (not a valid /N duration or /letter bass) can't lex, so the whole
    // token is captured as trailing junk and rejected by name — a clearer
    // error than a position-only Peggy parse failure.
    expect(() => interpretNotation("chords: Cm7 C6/9 Dm7")).toThrow(
      'unknown chord symbol "C6/9"',
    );
  });

  it("rejects a conventional-but-unsupported spelling (C-7) by name", () => {
    expect(() => interpretNotation("chords: C-7")).toThrow(
      'unknown chord symbol "C-7"',
    );
  });

  it("uses ! / ? for dynamics; letter case is insignificant (not a dynamic)", () => {
    expect(
      interpretNotation("chords: C?").every(
        (n) => bucket(n.velocity) === "soft",
      ),
    ).toBe(true);
    expect(
      interpretNotation("chords: C!").every(
        (n) => bucket(n.velocity) === "accent",
      ),
    ).toBe(true);
    // lowercase root = the SAME chord at normal velocity, not a softer one.
    const lower = interpretNotation("chords: c");

    expect(lower.map((n) => n.pitch)).toStrictEqual([48, 52, 55]);
    expect(lower.every((n) => bucket(n.velocity) === "normal")).toBe(true);
  });

  it("accepts an explicit [..] voicing at the chord register, beside symbols", () => {
    const notes = interpretNotation("chords: Cm7 [Eb G C']");

    // Cm7 at 0; then the bracket [Eb G C'] voiced from C2: Eb=51, G=55, C'=60.
    expect(
      notes.filter((n) => n.start_time === 4).map((n) => n.pitch),
    ).toStrictEqual([51, 55, 60]);
  });

  it("a single-note [..] bracket is a literal note, distinct from a bare symbol", () => {
    // `[C]` = one literal C (48); bare `C` = the C-major triad.
    expect(interpretNotation("chords: [C]").map((n) => n.pitch)).toStrictEqual([
      48,
    ]);
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

  it("a dotted /N applies to drum hits and bracket chords", () => {
    const drum = interpretNotation("kick: X/4. X");

    expect(drum.map((n) => n.start_time)).toStrictEqual([0, 1.5]);

    const chord = interpretNotation("melody: [C E]/2.");

    expect(chord).toHaveLength(2);
    expect(chord.every((n) => n.duration === 3)).toBe(true);
  });

  it("rejects a double dot", () => {
    expect(() => interpretNotation("melody: C/4..")).toThrow(
      /Stark notation parse error/,
    );
  });
});

describe("stark interpreter — triplet durations (×2/3)", () => {
  it("a triplet /N is 2/3× the plain value on a note", () => {
    const notes = interpretNotation("melody: C/4t D");

    // C = quarter-note triplet (2/3 beat); D falls at 2/3 with the /4 default.
    expect(notes.map((n) => n.duration)).toStrictEqual([2 / 3, 1]);
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 2 / 3]);
  });

  it("a triplet /N works as the line-header default", () => {
    const notes = interpretNotation("melody /8t: C D E");

    // Three eighth-note triplets fill one beat.
    expect(notes.map((n) => n.duration)).toStrictEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 1 / 3, 2 / 3]);
  });

  it("a triplet rest advances time by 2/3× the value", () => {
    const notes = interpretNotation("melody: C z/4t D");

    // C (default /4 = 1 beat) then a quarter-triplet rest (2/3) → D at 5/3.
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 1 + 2 / 3]);
  });

  it("a triplet /N applies to drum hits and bracket chords", () => {
    const drum = interpretNotation("kick: X/4t X");

    expect(drum.map((n) => n.start_time)).toStrictEqual([0, 2 / 3]);

    const chord = interpretNotation("melody: [C E]/8t");

    expect(chord).toHaveLength(2);
    expect(chord.every((n) => n.duration === 1 / 3)).toBe(true);
  });

  it("rejects combining a dot and a triplet", () => {
    for (const bad of ["melody: C/4.t", "melody: C/4t.", "melody: C/4tt"]) {
      expect(() => interpretNotation(bad)).toThrow(
        /Stark notation parse error/,
      );
    }
  });
});

describe("stark interpreter — repeat (*N)", () => {
  it("expands a drum roll into N hits on the token's grid", () => {
    const notes = interpretNotation("hihat /16: X*16");

    expect(notes).toHaveLength(16);
    expect(notes.every((n) => n.pitch === 42)).toBe(true);
    expect(notes.every((n) => n.duration === 0.25)).toBe(true);
    expect(notes.map((n) => n.start_time)).toStrictEqual(
      Array.from({ length: 16 }, (_unused, i) => i * 0.25),
    );
  });

  it("repeats a pitched note at the line default", () => {
    const notes = interpretNotation("melody: C*4");

    expect(notes.map((n) => n.pitch)).toStrictEqual([60, 60, 60, 60]);
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 1, 2, 3]);
  });

  it("carries a glued /N onto every copy", () => {
    const notes = interpretNotation("melody: C/8*4 D");

    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 0.5, 1, 1.5, 2]);
    expect(notes.map((n) => n.duration)).toStrictEqual([0.5, 0.5, 0.5, 0.5, 1]);
  });

  it("repeats a rest to advance time without emitting notes", () => {
    const notes = interpretNotation("melody: C z*2 D");

    // C (1 beat) + two quarter rests (2 beats) → D at 3.
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 3]);
  });

  it("repeats a whole bracket chord", () => {
    const notes = interpretNotation("melody: [C E G]/4*2");

    expect(notes).toHaveLength(6);
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 0, 0, 1, 1, 1]);
  });

  it("treats *1 as a single token (no-op)", () => {
    const notes = interpretNotation("melody: C*1 D");

    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 1]);
  });

  it("skips a visual barline while repeating the next token", () => {
    const notes = interpretNotation("melody: C | D*2");

    // The | advances nothing; D*2 lands at beats 1 and 2.
    expect(notes.map((n) => n.start_time)).toStrictEqual([0, 1, 2]);
  });

  it("rejects *0 (count must be >= 1)", () => {
    expect(() => interpretNotation("melody: C*0")).toThrow(
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

describe("stark interpreter — additional branch coverage", () => {
  it("warns with the plural noun for multiple collisions from mixed sections", () => {
    // kick and melody C,, both resolve to MIDI 36 at t=0 and t=1 → 2 collisions.
    const notes = interpretNotation("kick: X X\nmelody: C,, C,,");

    expect(notes).toHaveLength(2);
    expect(notes.every((n) => n.pitch === 36)).toBe(true);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("2 same-pitch+start collisions"),
    );
  });

  it("melody: a sharp accidental raises the pitch a semitone", () => {
    expect(interpretNotation("melody: C#")[0]?.pitch).toBe(61);
  });

  it("chords: a bare rest advances by the line default duration", () => {
    // C (/1 = 4 beats), bare z rest (line default /1 = 4 beats), G at beat 8.
    const notes = interpretNotation("chords: C z G");

    expect(
      notes.filter((n) => n.start_time === 8).map((n) => n.pitch),
    ).toStrictEqual([55, 59, 62]);
  });

  it("throws on an unknown chord symbol that carries a slash bass", () => {
    expect(() => interpretNotation("chords: Cwat/B")).toThrow(
      'unknown chord symbol "Cwat/B"',
    );
  });
});
