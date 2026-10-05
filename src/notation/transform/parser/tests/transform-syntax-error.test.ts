// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type PeggySyntaxError } from "#src/notation/peggy-parser-types.ts";
import { errorFor } from "#src/notation/transform/parser/tests/transform-syntax-error-test-helpers.ts";
import { formatTransformSyntaxError } from "#src/notation/transform/parser/transform-syntax-error.ts";

describe("transform syntax errors name the mistake", () => {
  it.each([
    [
      "missing =",
      "E1: velocity rand(90,110)",
      'position 13 (line 1, column 14) near "rand(90,110)": missing "=" after "velocity" — write "E1: velocity = rand(90,110)".',
    ],
    [
      ": instead of =",
      "E1: velocity: rand(90,110)",
      'near ": rand(90,110)": use "=" to assign, not ":" — write "E1: velocity = rand(90,110)".',
    ],
    [
      "shorthand name with :",
      "v: 95",
      'v isn\'t a parameter — write "velocity = 95".',
    ],
    [
      "length for duration",
      "length *= 0.5",
      'length isn\'t a parameter — write "duration *= 0.5".',
    ],
    [
      "bare comparison",
      "v<50: delete",
      'a condition needs where(...) — write "where(note.velocity < 50): delete".',
    ],
    [
      "empty right side",
      "velocity =",
      'at end of input: nothing after "velocity =" — add a value, e.g. "velocity = 100".',
    ],
    [
      "unclosed paren",
      "where(note.velocity < 50: velocity = 1",
      'position 24 (line 1, column 25) near ": velocity = 1": unclosed "(" — add the missing ")".',
    ],
    [
      "wildcard mixed with a beat",
      "3|*-4|1: velocity = 1",
      'a range can\'t mix a whole bar (N|*) with a beat — write "3|*-4|*" for whole bars or "3|1-4|1" for beats.',
    ],
    [
      "zero denominator in a range",
      "1|1+n/0-2|1: velocity = 1",
      "a note value's denominator can't be 0 (got n/0)",
    ],
    [
      "clip property in where()",
      "where(clip.length > 1): velocity = 1",
      "where() can only test note.velocity, note.pitch, note.start, note.duration, note.probability, note.deviation — got clip.length.",
    ],
  ])("%s", (_name, source, expected) => {
    expect(errorFor(source)).toContain(expected);
  });

  it("says a zero denominator can't be 0 in a duration value", () => {
    expect(errorFor("duration = n1/0")).toBe(
      "a note value's denominator can't be 0 (got n1/0): n/4 = quarter, n/8 = eighth, n/12 = eighth triplet.",
    );
  });

  it("names the fix for math on a shorthand", () => {
    expect(errorFor("1|1: n/4*0.85")).toBe(
      'transform syntax error at position 8 (line 1, column 9) near "*0.85": a shorthand can\'t take math — write "1|1: duration = n/4 * 0.85".',
    );
  });

  it.each([
    ["C4+5", 'write "pitch = C4 + 5"'],
    ["C1: v80 + 10", 'write "C1: velocity = 80 + 10"'],
    ["p0.5*2", 'write "probability = 0.5 * 2"'],
    ["2bar/2", 'write "duration = 2bar / 2"'],
  ])("names the fix for math on shorthand %s", (source, expected) => {
    expect(errorFor(source)).toContain(expected);
  });

  it.each(["duration = n/0", "duration = n1.5/0", "1|1+n1.5/0-2|1: v1"])(
    "says a zero denominator can't be 0 in %s",
    (source) => {
      expect(errorFor(source)).toContain("denominator can't be 0");
    },
  );

  it.each([
    "duration = n/0.5",
    "duration = n/04",
    "1|1+n/0.5-2|1: v1",
    "1|1+n/05-2|1: v1",
  ])("doesn't call %s a zero denominator", (source) => {
    expect(errorFor(source)).not.toContain("can't be 0");
  });
});

describe("transform syntax error details", () => {
  it.each([
    ["vel = 90", 'write "velocity = 90"'],
    ["velocty = 5", 'write "velocity = 5"'],
    ["note.velocity = 100", 'write "velocity = 100"'],
    ["C1: length *= 0.5", 'write "C1: duration *= 0.5"'],
    ["foo = 1", "foo isn't a parameter — use one of: velocity, pitch,"],
    ["velocity + 5", 'write "velocity += 5"'],
    [
      "velocity",
      'at end of input: missing "=" after "velocity" — write "velocity = 100"',
    ],
    ["velocity > 100: v80", 'write "where(note.velocity > 100): v80"'],
    ["timing < 2: delete", 'write "where(note.start < 2): delete"'],
    ["velocity: v80", 'write "v80"'],
    ["velocity 5 // note (", 'write "velocity = 5"'],
    ["pitch == C3: delete", 'write "where(note.pitch == C3): delete"'],
    ["C: v80", 'a pitch needs an octave, e.g. "C3: v80".'],
    ["G: v100", 'a pitch needs an octave, e.g. "G3: v100".'],
    [
      "velocity = 100 +",
      'at end of input: nothing after "+" — add a value or remove it.',
    ],
    [
      "where(velocity > 100): v80",
      "inside where(), write note.velocity, not velocity.",
    ],
    ["where(position > 4): v1", "— got position."],
    [
      "where(note.velocity > 1 and note.pitch > 3): v1",
      'use && and || inside where(), not "and".',
    ],
    ["note.pitch == 36: delete", 'write "where(note.pitch == 36): delete"'],
    ["3|1-4|*: v1", 'write "3|*-4|*" for whole bars or "3|1-4|1" for beats'],
    [
      "velocity = note.velocty",
      "note.velocty doesn't exist — note.* has velocity, pitch, start, duration, probability, deviation, index, count. Did you mean note.velocity?",
    ],
    [
      "velocity = clip.foo",
      "clip.foo doesn't exist — clip.* has duration, barDuration, position, index, count.",
    ],
    ["C#3: vel = 1 # a comment (", 'write "C#3: velocity = 1"'],
  ])("%s", (source, expected) => {
    expect(errorFor(source)).toContain(expected);
  });

  it("reports the failing line of a multi-line string", () => {
    expect(errorFor("velocity = 1\nlength = n/4")).toContain(
      'position 13 (line 2, column 1) near "length = n/4": length isn\'t a parameter — write "duration = n/4".',
    );
  });

  it("says when a line, not the input, ended", () => {
    expect(errorFor("velocity =\r\npitch = C3")).toContain(
      'at end of line: nothing after "velocity ="',
    );
  });

  it("truncates long text after the failure", () => {
    expect(errorFor("velocity 1 + 2 + 3 + 4 + 5 + 6 + 7")).toContain(
      'near "1 + 2 + 3 + 4 + 5 + 6 + …"',
    );
  });

  it("lists statement forms when a line starts with nothing recognizable", () => {
    expect(errorFor("{ nope")).toContain(
      'expected a statement, like "velocity = 100", "C1: v80", or "ratchet(2)".',
    );
  });

  it("lists what the grammar accepts when no mistake matches", () => {
    expect(errorFor("velocity = 1 velocity = 2")).toContain(
      'near "velocity = 2": expected end of line.',
    );
  });
});

// A named rule would hide where inside it the parse failed, pointing every
// error at the start of the expression or note op.
describe("errors inside a call point at the failure", () => {
  it.each([
    [
      "missing comma",
      "velocity = rand(1 2)",
      'position 18 (line 1, column 19) near "2)": expected ",", ")".',
    ],
    [
      "missing comma in a nested call",
      "velocity = rand(1, max(2 3))",
      'position 25 (line 1, column 26) near "3))": expected ",", ")".',
    ],
    [
      "missing comma after a variable",
      "velocity = max(note.velocity 2)",
      'near "2)": expected ",", ")".',
    ],
    [
      "empty argument",
      "velocity = rand(1,)",
      'position 18 (line 1, column 19) near ")": expected expression.',
    ],
    [
      "missing operand",
      "velocity = 1 + * 2",
      'position 15 (line 1, column 16) near "* 2": expected expression.',
    ],
    [
      "missing operand inside parens",
      "velocity = 2 * (3 + )",
      'position 20 (line 1, column 21) near ")": expected expression.',
    ],
    [
      "unclosed call",
      "velocity = rand(1, max(2, 3)",
      'position 28 (line 1, column 29) at end of input: unclosed "(" — add the missing ")".',
    ],
    [
      "extra closing paren",
      "velocity = rand(1, 2))",
      'position 21 (line 1, column 22) near ")": expected end of line.',
    ],
    [
      "function name without parens",
      "velocity = rand",
      'at end of input: expected "(".',
    ],
    [
      "missing comma in split()",
      "split(1|1 2|1)",
      'position 10 (line 1, column 11) near "2|1)": expected ",", ")".',
    ],
    [
      "missing comma in ratchet()",
      "ratchet(1 2)",
      'position 10 (line 1, column 11) near "2)": expected ",", ")".',
    ],
    [
      "unclosed ratchet()",
      "C1: ratchet(2",
      'position 13 (line 1, column 14) at end of input: unclosed "(" — add the missing ")".',
    ],
    [
      "bad position in split()",
      "split(1|x)",
      'position 6 (line 1, column 7) near "1|x)": expected bar|beat position, ")".',
    ],
    [
      "lone minus",
      "velocity = -",
      'near "-": nothing after "-" — add a value or remove it.',
    ],
    ["trailing /* */ comment", "velocity = 1 + /* x */", 'nothing after "+"'],
    [
      "trailing comment ending in /",
      "velocity = 1 + // a/",
      'nothing after "+"',
    ],
    ["trailing // comment", "velocity = 1 + // c", 'nothing after "+"'],
    ["trailing # comment", "velocity = 1 + # c", 'nothing after "+"'],
    [
      "all note properties",
      "velocity += note.",
      'expected "deviation", "velocity", "probability", "duration", "index", "pitch", "start", "count".',
    ],
    [
      "all clip properties",
      "velocity += clip.",
      'expected "barDuration", "position", "duration", "index", "count".',
    ],
    [
      "all next properties",
      "velocity += next.",
      'expected "deviation", "velocity", "probability", "duration", "pitch", "start".',
    ],
    ["all audio properties", "gain = audio.", 'expected "gain", "pitchShift".'],
    [
      "sync after a comma",
      "velocity = cos(n/4, )",
      'near ")": expected expression, "sync".',
    ],
    [
      "raw after a comma",
      "velocity = swing(0.05, )",
      'near ")": expected expression, "raw".',
    ],
    [
      "nothing after the =",
      "velocity =",
      'at end of input: nothing after "velocity ="',
    ],
    [
      "half-written note value",
      "velocity = n/",
      'near "n/": expected expression.',
    ],
  ])("%s", (_name, source, expected) => {
    expect(errorFor(source)).toContain(expected);
  });

  it("points at the failing line, not the first one", () => {
    expect(errorFor("velocity = 1\nvelocity = rand(1 2)")).toContain(
      'position 31 (line 2, column 19) near "2)"',
    );
  });
});

describe("formatTransformSyntaxError", () => {
  it("falls back to a bare message when nothing was expected", () => {
    const error = {
      name: "SyntaxError",
      message: "",
      found: "@",
      location: {
        start: { offset: 0, line: 1, column: 1 },
        end: { offset: 1, line: 1, column: 2 },
      },
    } as PeggySyntaxError;

    expect(formatTransformSyntaxError(error, "@")).toBe(
      'transform syntax error at position 0 (line 1, column 1) near "@": unexpected text.',
    );
  });
});

// A wrong fix is worse than the generic error, so an unsure hint stays out.
describe("hints that aren't sure fall back to the generic error", () => {
  it.each([
    ["velocity < 50", 'near "< 50": expected "*=", "/=", "-=", "+=", "=".'],
    ["velocity > 100 delete", 'near "> 100 delete": expected "*="'],
    ["pitch != C3", 'near "!= C3": expected "*="'],
    ["velocity ^ 2", 'near "^ 2": expected "*="'],
    ["velocity * 2 + 1", 'near "* 2 + 1": expected "*="'],
    ["pitch: v80", 'near ": v80": expected "*="'],
    ["T: v80", "expected a statement"],
    ["C: foo", "expected a statement"],
    ["where(note.velocity >): v1", 'near "): v1": expected expression.'],
    ["where(note.pitch == C3 velocity): v1", 'expected "&&", "||", ")".'],
    [
      "where(note.pitch > 1 where(note.pitch > 2)): v1",
      'expected "&&", "||", ")".',
    ],
  ])("%s", (source, expected) => {
    expect(errorFor(source)).toContain(expected);
  });

  it.each([
    ["pan = 0", "pan isn't a parameter — use one of:"],
    ["gate = 0.5", "gate isn't a parameter — use one of:"],
  ])("suggests no parameter for %s", (source, expected) => {
    expect(errorFor(source)).toContain(expected);
  });

  it("blames the colon, not a function call after a where() selector", () => {
    expect(
      errorFor("where(note.pitch == C1): velocity: max(note.index, 3)"),
    ).toContain(
      'use "=" to assign, not ":" — write "where(note.pitch == C1): velocity = max(note.index, 3)".',
    );
  });

  it.each([
    "position > 4: delete",
    "time > 2: delete",
    "zzz < 2: delete",
    "note.index > 2: delete",
  ])("suggests no made-up where() property for %s", (source) => {
    expect(errorFor(source)).toContain(
      "a condition needs where(...), and where() can only test note.velocity,",
    );
  });

  it("doesn't name a pitch as a where() property", () => {
    expect(errorFor("where(note.pitch == C): v1")).not.toContain(
      "where() can only test",
    );
  });

  it("doesn't read clip.position/0 as a note value", () => {
    expect(errorFor("velocity: clip.position/0")).not.toContain("can't be 0");
  });

  // Transforms have no length cap and hints run on the Max thread. The limit is
  // loose for slow CI runners; a backtracking regex takes seconds here.
  it.each([
    ["a spaced-out comparison", `v <${" ".repeat(10_000)}5 x`],
    ["a spaced-out comparison with a colon", `v <${" ".repeat(10_000)}5 x: v1`],
    ["a long digit run", `${"1".repeat(10_000)}|x`],
    ["a long word", `${"a".repeat(10_000)} b`],
    ["many block-comment openers", "/*".repeat(5000)],
    ["many where( openers", "where(".repeat(2000)],
    ["a parameter then spaces", `velocity${" ".repeat(10_000)}x`],
  ])("stays fast on %s", (_name, source) => {
    const start = performance.now();

    errorFor(source);

    expect(performance.now() - start).toBeLessThan(1000);
  });
});

// A fix that drops the line's selector parses but edits every note.
describe("fixes keep the line's selector", () => {
  it.each([
    ["C1: velocity: 90", 'write "C1: velocity = 90"'],
    ["1|1-2|1: velocity: 90", 'write "1|1-2|1: velocity = 90"'],
    [
      "where(note.velocity < 50): velocity: 100",
      'write "where(note.velocity < 50): velocity = 100"',
    ],
    ["C1: v80 + 5", 'write "C1: velocity = 80 + 5"'],
    ["C1: vel = 90", 'write "C1: velocity = 90"'],
    ["C1: pitch + 12", 'write "C1: pitch += 12"'],
    ["C1 1|1: velocity 90", 'write "C1 1|1: velocity = 90"'],
    ["C1: velocity =", 'e.g. "C1: velocity = 100"'],
    ["C1 v<50: delete", 'write "C1 where(note.velocity < 50): delete"'],
    ["C1: velocity > 100: v80", 'write "C1: where(note.velocity > 100): v80"'],
  ])("%s", (source, expected) => {
    expect(errorFor(source)).toContain(expected);
  });
});

describe("hints don't blame the wrong thing", () => {
  it.each([
    ["d: n/8", 'd isn\'t a parameter — write "duration = n/8".'],
    ["D: n/8", 'D isn\'t a parameter — write "duration = n/8".'],
    ["C: n/8", "expected a statement"],
    ["start > 2|1: delete", ": a condition needs where(...)."],
    ["velocity < 50 && pitch > C3: delete", ": a condition needs where(...)."],
    ["v < foo: delete", ": a condition needs where(...)."],
    ["where(note.pitch == X): v80", 'near "X): v80": expected expression.'],
  ])("%s", (source, expected) => {
    expect(errorFor(source)).toContain(expected);
  });
});
