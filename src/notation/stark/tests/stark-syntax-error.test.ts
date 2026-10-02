// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STARK_LINE_TYPES } from "#src/notation/stark/parser/stark-syntax-error.ts";
import { MIDI_TO_DRUM_NAME } from "#src/notation/stark/stark-config.ts";
import { parseNotation } from "#src/notation/stark/stark-interpreter.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { projectRoot } from "#src/test/helpers/meta-test-helpers.ts";

/**
 * @param a - First name
 * @param b - Second name
 * @returns Sort order
 */
function byName(a: string | undefined, b: string | undefined): number {
  return String(a).localeCompare(String(b));
}

/**
 * @param stark - Stark text that must fail to parse
 * @returns The error message a model would read
 */
function errorFor(stark: string): string {
  try {
    parseNotation(stark);
  } catch (error) {
    return errorMessage(error);
  }

  throw new Error(`"${stark}" parsed`);
}

describe("Stark syntax errors", () => {
  it("names the line and column, and only the likely fix", () => {
    expect(errorFor("melody: C D E\nkck: X")).toBe(
      'Stark notation parse error at position 14 (line 2, column 1) near "kck: X": unknown line header "kck" — did you mean "kick"?',
    );
  });

  it.each([
    ["melod: C D E", 'unknown line header "melod" — did you mean "melody"?'],
    ["bas: C", 'did you mean "bass"?'],
    [
      "drums: X x",
      'unknown line header "drums" — start each line with melody:, bass:, chords:, a drum (kick:, snare:, hihat:, …) or a pitch (C1:).',
    ],
    ["tom: X", 'unknown line header "tom" — start each line with'],
    [
      "melody C D E",
      'missing ":" after the line header — write "melody: C D E".',
    ],
    [
      "kick: X x Q",
      'a drum line holds X (hit), ^ (accent), x (soft) and z (rest), each with an optional /N, plus | bar lines. Got "Q".',
    ],
    [
      "melody: C D H",
      'a melody or bass line holds notes (C, Eb, C4, C\'/8!), [chords], z (rest) and | bar lines. Got "H".',
    ],
    [
      "chords: Cm7 | G7 H",
      'a chords line holds chord symbols (Cm7, G7/B), [voicings], z (rest) and | bar lines. Got "H".',
    ],
    [
      "melody: C/3 D",
      'a duration is /1, /2, /4, /8 or /16, with an optional . (dotted) or t (triplet). Got "/3".',
    ],
    ["kick /3: X", 'Got "/3".'],
    ["melody: C/4..", "a duration takes one modifier at most"],
    ["melody: C*0", "a repeat is *N with N of 1 or more"],
    ["melody: [C E G", 'unclosed "[" — add the missing "]".'],
    ["snare randomization", 'expected ":" after the line header.'],
    ["melod: Q", 'unknown line header "melod" — start each line with'],
    ["melody: C-", "the line ended too soon."],
    ["melody: C-x", 'unexpected "x".'],
    [
      "melody C D E F G A B C D E F G A B",
      'write "melody: C D E F G A B C D E F G …".',
    ],
    ["melody: C\uFEFFD", "remove the invisible character U+FEFF."],
  ])("%s → names the fix", (stark, hint) => {
    expect(errorFor(stark)).toContain(hint);
  });

  it("never lists every line header", () => {
    for (const stark of ["???", "kick: X Q", "melody: ((", "melody: C\n"]) {
      expect(errorFor(`${stark}\n@`)).not.toContain('"rimshot"');
    }
  });

  it("reads the line kind from the section the parse stopped in", () => {
    expect(errorFor("melody: C D kick: X y")).toContain("a drum line holds");
    expect(errorFor("chords: Cm7 | kick: X y")).toContain("a drum line holds");
    expect(errorFor("kick: X melody: C Q")).toContain(
      "a melody or bass line holds",
    );
  });

  it("asks for a normal space in place of an unusual one", () => {
    expect(errorFor("melody: C\u00A0D")).toContain(
      "replace the unusual space U+00A0 with a normal space.",
    );
  });

  it("says when a line ends too soon", () => {
    expect(errorFor("melody: C/")).toContain('Got "/".');
  });
});

describe("Stark header vocabulary", () => {
  // Hints suggest these names, so each must match what the grammar accepts.
  const grammar = readFileSync(
    join(projectRoot, "src/notation/stark/parser/stark-grammar.peggy"),
    "utf8",
  );

  it("lists every long drum name the grammar accepts", () => {
    const body = /^DrumName\n((?:\s+[=/].*\n)+)/m.exec(grammar)?.[1] ?? "";
    const names = [...body.matchAll(/^\s+[=/]\s+\("(\w+)"i/gm)].map(
      (match) => match[1],
    );

    expect(names.toSorted(byName)).toStrictEqual(
      Object.values(MIDI_TO_DRUM_NAME).toSorted(byName),
    );
  });

  it("lists every other line type the grammar accepts", () => {
    const melodyBass =
      /^MelodyBassLineType\n((?:\s+[=/].*\n)+)/m.exec(grammar)?.[1] ?? "";
    const names = [
      ...[...melodyBass.matchAll(/"(\w+)"i/g)].map((match) => match[1]),
      /^ChordsSection\n\s+= "(\w+)"i/m.exec(grammar)?.[1],
    ];

    expect(names.toSorted(byName)).toStrictEqual(
      STARK_LINE_TYPES.toSorted(byName),
    );
  });
});
