// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { interpretNotation } from "#src/notation/stark/stark-interpreter.ts";
import { errorMessage } from "#src/shared/error-message.ts";

/**
 * @param stark - Stark text that must fail to parse
 * @returns The error message a model would read
 */
function errorFor(stark: string): string {
  try {
    interpretNotation(stark);
  } catch (error) {
    return errorMessage(error);
  }

  throw new Error(`"${stark}" parsed`);
}

describe("Stark: an accidental glued after the octave", () => {
  it("names the fix in the whole message", () => {
    expect(errorFor("melody: G3 A3b Bb3")).toBe(
      'Stark notation parse error at position 13 (line 1, column 14) near "b Bb3": "A3b": the accidental goes right after the letter — write Ab3.',
    );
  });

  it.each([
    ["a note", "melody: G3 A3b Bb3", "A3b", "Ab3"],
    ["a sharp", "melody: G3 A3# B3", "A3#", "A#3"],
    ["a glyph", "melody: G A3♭", "A3♭", "A♭3"],
    ["a sharp glyph", "bass: G1 A1♯", "A1♯", "A♯1"],
    ["a negative octave", "bass: C-1b", "C-1b", "Cb-1"],
    ["a bracket voicing", "melody: [C3 E3b G3]", "E3b", "Eb3"],
    ["the first note of a bracket", "melody: [E3b G3]", "E3b", "Eb3"],
    ["a bracket on a chords line", "chords: [C3 E3b]", "E3b", "Eb3"],
    ["a drum pitch header", "C3b: X x", "C3b", "Cb3"],
    ["a later line's header", "kick: X\nC3#: X", "C3#", "C#3"],
    ["a later line", "kick: X\nmelody: A3b", "A3b", "Ab3"],
    ["a note with a duration", "melody: A3b/8 C", "A3b", "Ab3"],
  ])("refuses it on %s", (_name, stark, token, fix) => {
    expect(errorFor(stark)).toContain(
      `"${token}": the accidental goes right after the letter — write ${fix}`,
    );
  });

  it.each([
    ["an octave and a mark", "melody: E3'b", "E3'b", "Eb3'"],
    ["a sharp after a mark", "melody: E'#", "E'#", "E#'"],
    ["a flat glyph after a mark", "melody: E'♭", "E'♭", "E♭'"],
    ["a sharp after a lower mark", "melody: e,g,#", "g,#", "g#,"],
    ["a bracket voicing with an octave", "melody: [C3 E3,#]", "E3,#", "E#3,"],
  ])("refuses it after an octave mark on %s", (_name, stark, token, fix) => {
    expect(errorFor(stark)).toContain(
      `"${token}": the accidental goes right after the letter — write ${fix}`,
    );
  });

  // A lowercase b after marks alone may be the note B (`g,` then `b`), a
  // comma-between-notes mistake models make.
  it.each([
    ["a note", "melody: G E'b C", "E'b", "Eb'", "E' b"],
    ["a lower mark", "melody: C,b", "C,b", "Cb,", "C, b"],
    ["a comma list", "melody: e,g,b", "g,b", "gb,", "g, b"],
    ["a comma list in a bracket", "melody: [c,e,g,b]", "g,b", "gb,", "g, b"],
    ["a bass line", "bass: a,b", "a,b", "ab,", "a, b"],
  ])(
    "offers both readings of a b after marks on %s",
    (_name, stark, token, flat, two) => {
      expect(errorFor(stark)).toContain(
        `"${token}": write ${flat} for a flat, or ${two} for two notes`,
      );
    },
  );

  // The letter already has an accidental, so a lowercase b can only be a note.
  it.each([
    ["melody: Ab3b", '"Ab3b": write Ab3 b for two notes.'],
    ["melody: Eb3''b", "\"Eb3''b\": write Eb3'' b for two notes."],
    ["melody: Ab3#", '"Ab3#": one accidental, right after the letter.'],
    ["melody: F#3♭", '"F#3♭": one accidental, right after the letter.'],
  ])("gives no flat rewrite for %s", (stark, message) => {
    expect(errorFor(stark)).toContain(message);
  });

  it.each([
    ["melody: F#'b", `"F#'b": write F#' b for two notes.`],
    ["melody: Eb'b", `"Eb'b": write Eb' b for two notes.`],
    ["bass: Ab,b", `"Ab,b": write Ab, b for two notes.`],
    ["melody: Eb''b", `"Eb''b": write Eb'' b for two notes.`],
    ["bass: [Eb'b G]", `"Eb'b": write Eb' b for two notes.`],
  ])(
    "offers only the two-note reading when %s has an accidental",
    (stark, message) => {
      expect(errorFor(stark)).toContain(message);
    },
  );

  // Marks after other suffixes are refused too.
  it.each([
    [
      "melody: E/8'b",
      `"E/8'b": write Eb/8' for a flat, or E/8' b for two notes.`,
    ],
    ["melody: E!'b", `"E!'b": write Eb!' for a flat, or E!' b for two notes.`],
    ["melody: e'B'b", `"B'b": write Bb' for a flat, or B' b for two notes.`],
    [
      "melody: d3?'b",
      `"d3?'b": the accidental goes right after the letter — write db3?'.`,
    ],
    [
      "melody: E/4t,#",
      `"E/4t,#": the accidental goes right after the letter — write E#/4t,.`,
    ],
  ])("covers a mark after other suffixes: %s", (stark, message) => {
    expect(errorFor(stark)).toContain(message);
  });

  // Where no note could have parsed, the line's own hint stays.
  it.each([
    ["kick: X E'b", "a drum line holds X (hit), ^ (accent)"],
    ["C1: E'b", "a drum line holds X (hit), ^ (accent)"],
    ["hh: X g,b", "a drum line holds X (hit), ^ (accent)"],
    ["melody: C\nE'b G", 'unknown line header "E\'b"'],
    ["melody: C kick: X E'b", "a drum line holds X (hit), ^ (accent)"],
  ])("leaves %s to the line hint", (stark, hint) => {
    const message = errorFor(stark);

    expect(message).toContain(hint);
    expect(message).not.toContain("for a flat");
  });

  // A drum pitch header takes neither a second note nor an octave mark, so
  // the hint offers no rewrite that would fail there.
  it.each([
    [
      "A3b: X",
      '"A3b": the accidental goes right after the letter — write Ab3.',
    ],
    ["Gb1b: x", '"Gb1b": one accidental, right after the letter.'],
    ["Ab3b: X", '"Ab3b": one accidental, right after the letter.'],
    ["Ab3b/8: X/8", '"Ab3b": one accidental, right after the letter.'],
    ["melody: C\nAb1b: x", '"Ab1b": one accidental, right after the letter.'],
  ])("words the header %s for a header", (stark, message) => {
    const found = errorFor(stark);

    expect(found).toContain(message);
    expect(found).not.toContain("two notes");
  });

  it.each(["E'b: X", "Eb'b: X", "g,b: X"])(
    "leaves the mark in the header %s to the unknown-header hint",
    (stark) => {
      const message = errorFor(stark);

      expect(message).toContain("unknown line header");
      expect(message).not.toContain("accidental");
    },
  );

  it("still catches a drum pitch header and a later melody", () => {
    expect(errorFor("kick: X\nA3b: X")).toContain('"A3b": the accidental');
    expect(errorFor("kick: X\nmelody: E'b")).toContain('"E\'b": write');
  });

  it("names the first one on the line", () => {
    const message = errorFor("melody: A3b D3#");

    expect(message).toContain('"A3b": the accidental');
    expect(message).not.toContain('"D3#"');
  });

  it.each([
    ["a repeat", "melody: A3b*2"],
    ["an octave mark", "melody: A3b'"],
    ["a duration", "melody: A3b/8"],
    ["a drum header colon", "A3b: X"],
  ])("still names the fix when %s follows", (_name, stark) => {
    expect(errorFor(stark)).toContain(
      '"A3b": the accidental goes right after the letter — write Ab3',
    );
  });

  // Altered chord names (`C7b9`) are not a glued accidental: they get the hint
  // for what the line holds instead.
  it.each([
    ["melody: C7#9 D", "a melody or bass line holds notes"],
    ["melody: C9#11", "a melody or bass line holds notes"],
    ["melody: C7b9", "a melody or bass line holds notes"],
    ["bass: G7#9", "a melody or bass line holds notes"],
    ["chords: [C7b9]", "a chords line holds chord symbols"],
  ])("leaves the chord name in %s to the line hint", (stark, hint) => {
    const message = errorFor(stark);

    expect(message).toContain(hint);
    expect(message).not.toContain("the accidental goes right");
  });

  it("gives no rewrite for parentheses, which Stark does not take", () => {
    const message = errorFor("melody: (A3b)");

    expect(message).toContain("a melody or bass line holds notes");
    expect(message).not.toContain("write Ab3");
  });

  it.each([
    ["a flat on a letter", "melody: Cb Eb3 Bb' [Bb3 Eb'] Bb,"],
    ["a sharp glyph on a letter", "melody: C♯3 D♭ [F♯2 G♭'']"],
    ["an uppercase B after an octave", "melody: A3 B3 B"],
    ["chord symbols", "chords: Bb7 Ebm7 Cb Bbmaj7/Eb"],
    ["a drum pitch header", "Bb1: X x"],
    ["marks, a duration and an accent", "melody: Eb3'' E,, Bb'/8!"],
  ])("still parses %s", (_name, stark) => {
    expect(() => interpretNotation(stark)).not.toThrow();
  });

  it("reads A3 then the note B when they are apart", () => {
    const pitches = interpretNotation("melody: A3 b").map((n) => n.pitch);

    expect(pitches).toHaveLength(2);
    expect(pitches[0]).toBe(69);
  });
});
