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

describe("bar|beat syntax errors", () => {
  it("names where the parse stopped and the text there", () => {
    expect(errorFor("C3 1|1\nx 1|2")).toBe(
      'bar|beat syntax error at position 7 (line 2, column 1) near "x 1|2": expected a note (C3), a position (1|1), a duration (n/4), a velocity (v100), a probability (p0.5), a [pattern] or an @ bar copy.',
    );
  });

  it.each([
    ["C 1|1", "a note needs an octave: C3, not C (C3 = middle C)."],
    ["C3 Eb 1|1", "a note needs an octave: Eb3, not Eb"],
    ["Cmaj7 1|1", "bar|beat has no chord names like Cmaj7 — list the notes"],
    ["Am 1|1", "no chord names like Am"],
    ["C7sus4 1|1", "no chord names like C7sus4"],
    ["G7/B 1|1", "no chord names like G7/B"],
    ["4. ", "the line ended too soon."],
    ["[C3 E3 1|1", 'unclosed "[" — add the missing "]".'],
    ["(C3 E3 1|1", 'unclosed "(" — add the missing ")".'],
    ["[C3 1|1]", "a [ ] pattern holds one kind of value"],
    ["(C3 1|1) 1|1", "a ( ) chord holds notes with octaves"],
    ["C3,E3 1|1", "separate notes and values with spaces"],
    ["C3 1|", "a position needs a beat after the pipe, e.g. 1|1."],
    ["C3 1|1 2|x", "a position needs a beat after the pipe, e.g. 2|1."],
    [
      "C3 1|-1",
      "beats are 1-indexed: the downbeat is beat 1 (e.g. 1|1); for a pickup before it, offset from beat 1 (e.g. 1|1-n/4). Got beat -1.",
    ],
    ["C3 1|1x", "a repeat is <beat>x<count>@<step>"],
    ["C3 1|1+n", "a beat offset is +n<fraction> or -n<fraction>"],
    ["C3 1|1 @x", "a bar copy is @<bar>="],
    [
      "v8.5 C3 1|1",
      'a velocity is v<0-127> or a range like v80-100. Got "v8.5".',
    ],
    ["n/0.5 C3 1|1", "a duration is n<fraction> or <count>bar"],
    ["p-1 C3 1|1", "a probability is p<0-1>"],
    ["n/4.. C3 1|1", 'Got "n/4..".'],
    ["C3E3 1|1", 'unexpected "E": items are separated by spaces.'],
    ["3/8 C3 1|1", "note values need the n prefix: n3/8, not 3/8."],
    ["C3 1|1\uFEFF", "remove the invisible character U+FEFF."],
    ["1+n/12 C3", 'expected "|" before "+".'],
  ])("%s → names the fix", (notes, hint) => {
    expect(errorFor(notes)).toContain(hint);
  });

  it("says a zero denominator can't be 0 wherever a note value goes", () => {
    const message =
      "a note value's denominator can't be 0 (got n1/0): n/4 = quarter, n/8 = eighth, n/12 = eighth triplet.";

    expect(errorFor("n1/0 C3 1|1")).toBe(message);
    expect(errorFor("[n1/0 n/4] C3 1|1")).toBe(message);
    expect(errorFor("C3 1|1x4@n1/0")).toContain(message);
    expect(errorFor("C3 1|1+n1/0")).toContain(message);
    expect(errorFor("n/0 C3 1|1")).toContain("(got n/0)");
  });

  it("says to remove spaces around a position's pipe", () => {
    expect(errorFor("C3 1 | 1")).toBe(
      'no spaces around the pipe in a position: write 1|1, not "1 | 1".',
    );
    expect(errorFor("C3 2 |3.5")).toContain("write 2|3.5");
    expect(errorFor("C3 1| 1")).toContain("write 1|1");
  });

  // Every position form from dev/specs/barbeat: the fix keeps all of it.
  it.each([
    ["C3 1 | 1-n/4", "1|1-n/4"],
    ["C3 1 |1,2,3", "1|1,2,3"],
    ["C3 1 | 1.5", "1|1.5"],
    ["C3 1 | 1.5+n/4", "1|1.5+n/4"],
    ["C3 1 | 2+n/12", "1|2+n/12"],
    ["C3 2| 1x4", "2|1x4"],
    ["C3 1 | 1x4@n/4", "1|1x4@n/4"],
    ["C3 1 | 1x3@n/12", "1|1x3@n/12"],
    ["C3 1 | 1x4@1bar", "1|1x4@1bar"],
    ["C3 1 | 1x3@1bar-n/4", "1|1x3@1bar-n/4"],
    ["C3 1 | 2+n/12x3@n/12", "1|2+n/12x3@n/12"],
    ["C3 1 | 1x4@n/4,3.5", "1|1x4@n/4,3.5"],
    ["C3 1 | 1x2@n/4,3x2@n/8", "1|1x2@n/4,3x2@n/8"],
    ["C3 1 | 1, 2, 3", "1|1, 2, 3"],
    ["C3 1 | 1,2,", "1|1,2,"],
    ["C3 1 | 1,2|3", "1|1,2|3"],
    ["C3 1 | 1, 2 | 3", "1|1, 2|3"],
    ["C3 1 | 1 v80", "1|1"],
  ])("%s → suggests the whole position: %s", (notes, fixed) => {
    const message = errorFor(notes);

    expect(message).toContain(`write ${fixed}, not "`);
    expect(() =>
      parseNotation(notes.replaceAll(/\s*\|\s*/g, "|")),
    ).not.toThrow();
  });

  it.each([
    ["C3 1|1,2 | 3", '"1|1,2 | 3"', "write 1|1,2|3,"],
    ["C3 1|1, 2 | 3", '"1|1, 2 | 3"', "write 1|1, 2|3,"],
    ["C3 1|1,2 |3", '"1|1,2 |3"', "write 1|1,2|3,"],
    ["C3 1|1,2| 3", '"1|1,2| 3"', "write 1|1,2|3,"],
    ["C3 1|1x4@n/4,3 | 2", '"1|1x4@n/4,3 | 2"', "write 1|1x4@n/4,3|2,"],
    ["C3 2|1 D3 1|1,2 | 3 v80", '"1|1,2 | 3"', "write 1|1,2|3,"],
  ])(
    "%s → spaced pipe after a position keeps the whole position",
    (notes, was, fix) => {
      const message = errorFor(notes);

      expect(message).toContain(fix);
      expect(message).toContain(was);
      expect(() =>
        parseNotation(notes.replaceAll(/\s*\|\s*/g, "|")),
      ).not.toThrow();
    },
  );

  it("names no fix for a spaced pipe that has no single fix", () => {
    expect(errorFor("C3 1|1 | 3")).not.toContain("no spaces");
    expect(errorFor("C3 | 1")).not.toContain("no spaces");
    expect(errorFor("v80 | 1|1")).not.toContain("no spaces");
  });

  it("never suggests an invalid position for a spaced beat 0", () => {
    const hint = "beats are 1-indexed: the downbeat is beat 1";

    expect(errorFor("C3 1 | 0")).toContain(hint);
    expect(errorFor("C3 1 |0.5")).toContain(hint);
    expect(errorFor("C3 1 | 0")).not.toContain("write 1|0");
  });

  it("keeps the beat's own error behind a spaced pipe", () => {
    expect(errorFor("C3 1 | 1+2")).toContain("beat offsets use the note-value");
    expect(errorFor("C3 1 | 1-2|1")).toContain(
      "a position is a single bar|beat",
    );
  });

  it("keeps the MIDI-number steer when no beat follows the pipe", () => {
    expect(errorFor("C3 1 | C3")).toContain("not MIDI numbers. Got 1.");
  });

  it("only says items need spaces when a space would fix it", () => {
    expect(errorFor("C3 1|1;")).toMatch(/: unexpected ";"\.$/);
    expect(errorFor("C3 2|3..")).toMatch(/: unexpected "\."\.$/);
    expect(errorFor("C3 1|1,2,,3")).toMatch(/: unexpected ","\.$/);
  });

  it.each([
    ["C3 1|1 n/4 d", 'remove the space before "d": write "n/4d".'],
    ["C3 1|1x4 @n/4", 'remove the space before "@n/4": write "1|1x4@n/4".'],
    ["n/4 e 1|1", "a note needs an octave: e3, not e"],
  ])("%s → names the space to remove, or not", (notes, hint) => {
    expect(errorFor(notes)).toContain(hint);
  });

  it.each(["C3 1|1 v100 -1", "C3 1|1 @2=1 -100", "p1 .5 C3 1|1", "C3 1|1 .5"])(
    "%s → offers no join that would make a new range or decimal",
    (notes) => {
      expect(errorFor(notes)).not.toContain("remove the space");
    },
  );

  it.each([
    ["C3 1|1 +n/4", 'write "1|1+n/4"'],
    ["1bar s C3 1|1", 'write "1bars"'],
  ])("%s → still offers a safe join", (notes, hint) => {
    expect(errorFor(notes)).toContain(hint);
  });

  it.each([
    "notes: C3 1|1",
    "pitch 60",
    "C3 1|1 pp",
    "C3 1|1 E+n/4",
    "C3 1|1 n/4 d x",
  ])("%s → gives no value or chord hint for a plain word", (notes) => {
    expect(errorFor(notes)).not.toMatch(
      /a duration is|a velocity is|a probability is|chord names|an octave/,
    );
  });

  it("blames the token where the parse stopped, not the rest of the line", () => {
    const octave = "a note needs an octave: C3, not C";

    expect(errorFor("C 1|1 [C3\nE3] 2|1")).toContain(octave);
    expect(errorFor("C 1|1 n/0")).toContain(octave);
    expect(errorFor("C 1|1 [C3 E3")).toContain(octave);
    expect(errorFor("C3 [E3 x] [C3 1|1")).toContain("a [ ] pattern holds");
    expect(errorFor("C3 [E3 1|1 // ]")).toContain('unclosed "["');
    expect(errorFor("C3 1|1 # (\n[C3 1|2")).toContain('unclosed "["');
  });

  it("never doubles the period after a beat that ends in a dot", () => {
    expect(errorFor("C3 1|0.")).toMatch(/Got beat 0\.$/);
    expect(errorFor("C3 1|-1.")).toMatch(/Got beat -1\.$/);
  });

  it("names unusual spaces and invisible characters", () => {
    expect(errorFor("C3\u00A01|1")).toContain(
      "replace the unusual space U+00A0 with a normal space.",
    );
    expect(errorFor("C3\u30001|1")).toContain("unusual space U+3000");
    expect(errorFor("C3\u200B1|1")).toContain(
      "remove the invisible character U+200B.",
    );
  });

  it("ignores brackets in comments", () => {
    expect(errorFor("x C3 1|1 // [")).toContain("expected a note (C3)");
    expect(errorFor("x C3 /* [ */ 1|1")).toContain("expected a note (C3)");
    expect(errorFor("# [\nx C3 1|1 /* (")).toContain("expected a note (C3)");

    // `#` starts a comment right after an item too, but not in a sharp.
    for (const notes of [
      "E3#(\nC3 1|1 x",
      "C3 1|1#[\nE3 x",
      "[#(\nC3] 1|1 x",
    ]) {
      expect(errorFor(notes)).not.toContain("unclosed");
    }

    expect(errorFor("(C#3 E3 1|1")).toContain('unclosed "("');
    expect(errorFor("C#3 [F#2 1|1")).toContain('unclosed "["');
    expect(errorFor("C3 1|1 /* */C#3 [E3 1|1")).toContain('unclosed "["');
  });

  it("reads a token up to a comment, not through it", () => {
    for (const notes of [
      "v8.5#note",
      "v8.5//note",
      "v8.5/* x */",
      "C3 /* x\n y */ v8.5",
    ]) {
      expect(errorFor(notes)).toContain('Got "v8.5".');
    }

    expect(errorFor("F#-1 n4.5 // x")).toContain("Got n4.5");
    expect(errorFor("C#3 1|1 n4.5#C3")).toContain("Got n4.5");
  });

  it("reads a note name up to a comment, but keeps its sharp", () => {
    expect(errorFor("C 1|1#x")).toContain("a note needs an octave: C3, not C");
    expect(errorFor("C#")).toContain("C#3, not C#");
    expect(errorFor("1|1 C# 3")).toContain("C#3, not C#");
  });

  it("ignores brackets in a comment that runs over lines", () => {
    expect(errorFor("C3 /* [\n ( */ x")).not.toContain("unclosed");
    expect(errorFor("C#3 /* [ \n ] */ [E3 1|1")).toContain('unclosed "["');
    expect(errorFor("F#-1 [E3 1|1")).toContain('unclosed "["');
  });

  it("names a block comment that is never closed, ahead of bracket hints", () => {
    const hint = 'unclosed "/*" comment — add "*/".';

    expect(errorFor("C3 /* (")).toContain(hint);
    expect(errorFor("C3 1|1 /* [ note")).toContain(hint);
    expect(errorFor("C3 1|1\nE3 1|2 /* [\nF3 1|3")).toContain(hint);
    expect(errorFor("C3 /* x */ 1|1 x")).not.toContain("unclosed");
    expect(errorFor("x C3 1|1 /* (")).not.toContain("unclosed");
  });

  it("blames a missing beat, not a comment that opens at the failure", () => {
    expect(errorFor("1|/* x")).toContain(
      "a position needs a beat after the pipe, e.g. 1|1.",
    );
  });

  // Hints run on the Max thread over input with no length cap.
  it.each([
    [
      "a failure before many unclosed openers",
      `C3 1|1 x ${"/* a ".repeat(50_000)}`,
    ],
    ["many unclosed openers then a bracket", `x ${"/* ".repeat(100_000)}[`],
    ["many closed comments", `x ${"/* a */ ".repeat(50_000)}[`],
  ])("stays fast on %s", (_name, notes) => {
    const start = performance.now();

    errorFor(notes);

    expect(performance.now() - start).toBeLessThan(1000);
  });
});
