// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { errorFor } from "#src/notation/transform/parser/tests/transform-syntax-error-test-helpers.ts";
import { tryParseTransform } from "#src/notation/transform/transform-evaluator.ts";

describe("transform: an accidental glued after the octave", () => {
  it("names the fix in the whole message", () => {
    expect(errorFor("A3b: velocity = 1")).toBe(
      'transform syntax error at position 0 (line 1, column 1) near "A3b: velocity = 1": "A3b": the accidental goes right after the letter — write Ab3.',
    );
  });

  it.each([
    ["a flat selector", "A3b: velocity = 1", "A3b", "Ab3"],
    [
      "a sharp selector, which would start a comment",
      "A3#: velocity = 1",
      "A3#",
      "A#3",
    ],
    ["a glyph selector", "A3♭: velocity = 1", "A3♭", "A♭3"],
    ["a negative octave", "A-1b: velocity = 1", "A-1b", "Ab-1"],
    ["a pitch value", "pitch = A3b", "A3b", "Ab3"],
    ["a sharp pitch value", "pitch = A3# 5", "A3#", "A#3"],
    ["a pitch shorthand", "C3: A3b", "A3b", "Ab3"],
    ["the end of a pitch range", "C3-A3b: delete", "A3b", "Ab3"],
    ["the start of a pitch range", "A3b-C4: v1", "A3b", "Ab3"],
    ["a pitch in a sum", "velocity = 5 + A3b", "A3b", "Ab3"],
    ["a later line", "velocity = 1\nA3b: velocity = 2", "A3b", "Ab3"],
  ])("refuses it on %s", (_name, source, token, fix) => {
    expect(errorFor(source)).toContain(
      `"${token}": the accidental goes right after the letter — write ${fix}`,
    );
  });

  it("ignores a glued pitch in a comment", () => {
    expect(errorFor("velocity = [1 // A3b")).not.toContain("write Ab3");
    expect(errorFor("C3 // A3b\nA3#: velocity = 1")).toContain(
      '"A3#": the accidental goes right after the letter — write A#3',
    );
  });

  it.each([
    ["a duration", "A3b/8: velocity = 1"],
    ["a repeat", "A3b*2: velocity = 1"],
    ["a mark", "A3b': velocity = 1"],
  ])("still names the fix when %s follows", (_name, source) => {
    expect(errorFor(source)).toContain(
      '"A3b": the accidental goes right after the letter — write Ab3',
    );
  });

  it.each(["pitch = C7b9", "C7b9: velocity = 1", "pitch = G7#9"])(
    "leaves the chord name in %s alone",
    (source) => {
      expect(errorFor(source)).not.toContain("the accidental goes right");
    },
  );

  it("gives no rewrite when the letter already has an accidental", () => {
    expect(errorFor("Ab3b: velocity = 1")).toMatch(
      /: "Ab3b": one accidental, right after the letter\.$/,
    );
  });

  it.each([
    ["a flat selector", "Ab3: velocity = 1"],
    ["a sharp range", "C#3-F#4: velocity = 1"],
    ["a pitch value", "pitch = Bb3"],
    ["a comment after a space", "A3 # A3b\nvelocity = 1"],
    ["a comment after a statement", "A3: velocity = 1 # A3b"],
    ["a // comment", "A3: velocity = 1 // A3b"],
  ])("still parses %s", (_name, source) => {
    expect(() => tryParseTransform(source, 4, 4)).not.toThrow();
  });
});
