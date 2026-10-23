// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { parseNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { errorMessage } from "#src/shared/error-message.ts";

/**
 * @param notes - bar|beat text that must fail to parse
 * @returns The error message a model would read
 */
function errorFor(notes: string): string {
  try {
    parseNotation(notes);
  } catch (error) {
    return errorMessage(error);
  }

  throw new Error(`"${notes}" parsed`);
}

describe("bar|beat: an accidental glued after the octave", () => {
  it("names the fix in the whole message", () => {
    expect(errorFor("A3b 1|1")).toBe(
      'bar|beat syntax error at position 0 (line 1, column 1) near "A3b 1|1": "A3b": the accidental goes right after the letter — write Ab3.',
    );
  });

  it.each([
    ["a flat", "A3b 1|1", "A3b", "Ab3"],
    ["a sharp, which would start a comment", "A3# 1|1", "A3#", "A#3"],
    ["a flat glyph", "A3♭ 1|1", "A3♭", "A♭3"],
    ["a sharp glyph", "A3♯ 1|1", "A3♯", "A♯3"],
    ["a negative octave", "A-1b 1|1", "A-1b", "Ab-1"],
    ["a later note", "C3 E3 A3b 1|1", "A3b", "Ab3"],
    ["a note on a later line", "C3 1|1\nA3# 1|2", "A3#", "A#3"],
    ["a pattern", "[C3 A3b] 1|1", "A3b", "Ab3"],
    ["the first note of a pattern", "[A3b C3] 1|1", "A3b", "Ab3"],
    ["a chord", "(C3 E3b G3) 1|1", "E3b", "Eb3"],
  ])("refuses it on %s", (_name, notes, token, fix) => {
    expect(errorFor(notes)).toContain(
      `"${token}": the accidental goes right after the letter — write ${fix}`,
    );
  });

  it.each([
    ["a duration", "A3b/8 1|1"],
    ["a repeat", "A3b*2 1|1"],
    ["a mark", "A3b' 1|1"],
    ["a colon", "A3b: 1|1"],
  ])("still names the fix when %s follows", (_name, notes) => {
    expect(errorFor(notes)).toContain(
      '"A3b": the accidental goes right after the letter — write Ab3',
    );
  });

  // Altered chord names (`C7b9`) are not a glued accidental: they keep the
  // chord-name hint.
  it.each([
    "C7b9 1|1",
    "E7b5 1|1",
    "C3 G7b9 1|1",
    "C7b9/E 1|1",
    "G7#9 1|1",
    "C9#11 1|1",
    "Bb7b9 1|1",
  ])("leaves the chord name in %s to the chord hint", (notes) => {
    const message = errorFor(notes);

    expect(message).toContain("bar|beat has no chord names like");
    expect(message).not.toContain("the accidental goes right");
  });

  it("gives no rewrite when the letter already has an accidental", () => {
    expect(errorFor("Ab3b 1|1")).toMatch(
      /: "Ab3b": one accidental, right after the letter\.$/,
    );
  });

  // A pitch run into the item before it still wants a space first.
  it.each(["1|1C3#", "1|1C7#9", "1|1Eb3#"])(
    "still says to separate the items in %s",
    (notes) => {
      expect(errorFor(`${notes} 1|2`)).toContain(
        "items are separated by spaces.",
      );
    },
  );

  it("keeps the plain hint when the spaced line fails for another reason", () => {
    expect(errorFor("Eb3n/0 1|1")).toContain('unexpected "n".');
  });

  // The chord hint must not read past the word the parse stopped in.
  it.each([
    [
      "v100Am 1|1",
      'a velocity is v<0-127> or a range like v80-100. Got "v100Am".',
    ],
    ["n/4Am 1|1", "a duration is n<fraction>"],
    ["1|Cm7b5 2|1.5", "a position needs a beat after the pipe, e.g. 1|1."],
  ])("keeps the precise hint for %s", (notes, hint) => {
    expect(errorFor(notes)).toContain(hint);
  });

  it.each([
    ["a flat", "Bb3 Eb-1 1|1"],
    ["a sharp", "C#3 F♯2 1|1"],
    ["an all-caps flat", "GB1 1|1"],
    ["a comment after a space", "C3 # a comment A3b\nE3 1|1"],
    ["a comment on its own line", "# A3b\nC3 1|1"],
    ["a // comment", "C3 1|1 // A3b"],
    ["a pattern", "[Bb3 C#3] 1|1"],
  ])("still parses %s", (_name, notes) => {
    expect(() => parseNotation(notes)).not.toThrow();
  });
});
