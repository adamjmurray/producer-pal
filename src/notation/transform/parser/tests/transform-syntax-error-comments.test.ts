// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { tryParseTransform } from "#src/notation/transform/transform-evaluator.ts";

/**
 * @param source - Transform string expected to fail
 * @returns The error message it fails with
 */
function errorFor(source: string): string {
  try {
    tryParseTransform(source, 4, 4);
  } catch (error) {
    return (error as Error).message;
  }

  throw new Error(`expected "${source}" to fail`);
}

// The hints read the failing line the way the grammar does: `#` starts a
// comment anywhere, except as a sharp in a pitch (`C#3`).
describe("transform hints ignore comments", () => {
  it.each([
    ["# glued to a number", "velocity 5#(c", 'write "velocity = 5"'],
    ["# glued to an operator", "velocity = 5 +#c", 'nothing after "+"'],
    ["# after a space", "velocity = 5 + #c", 'nothing after "+"'],
    ["//", "velocity 5//(c", 'write "velocity = 5"'],
    ["a block comment", "velocity 5/*(*/", 'write "velocity = 5"'],
    ["a block then # comment", "velocity 5/* ( */ # (", 'write "velocity = 5"'],
    [
      "a block comment in the line",
      "C3: vel /* ( */ = 1",
      'write "C3: velocity = 1"',
    ],
    [
      "a block comment as the operand gap",
      "velocity = 5 +/*c*/",
      'nothing after "+"',
    ],
  ])("%s", (_name, source, hint) => {
    const message = errorFor(source);

    expect(message).toContain(hint);
    expect(message).not.toContain("unclosed");
  });

  it.each([
    ["#", "where(note.pitch == C3: velocity = 1 #)"],
    ["//", "where(note.pitch == C3: velocity = 1 //)"],
    ["a block comment", "where(note.pitch == C3: velocity = 1 /* ) */"],
    [
      "a block comment over lines",
      "where(note.pitch == C3: velocity = 1 /* \n ) */",
    ],
  ])("doesn't count a ) in %s", (_name, source) => {
    expect(errorFor(source)).toContain('unclosed "("');
  });

  it("doesn't read a ( in a comment as unclosed", () => {
    expect(errorFor("/* (\n*/ velocity = = 1")).not.toContain("unclosed");
    expect(errorFor("velocity = 1 // (\nvelocity = = 2")).not.toContain(
      "unclosed",
    );
  });

  it.each([
    "velocity = 5 /* (",
    "velocity = 5 /* ( note",
    "velocity = 1\nvelocity = 5 /* (\n) x",
    "where(note.velocity < 5 /* ) */ /* (",
  ])("names a block comment that is never closed: %j", (source) => {
    expect(errorFor(source)).toContain('unclosed "/*" comment — add "*/".');
  });

  it("doesn't blame a closed comment, or one after the failure", () => {
    expect(errorFor("velocity = = 5 /* ( */")).not.toContain("unclosed");
    expect(errorFor("velocity = = 5\nvelocity = 1 /* (")).not.toContain(
      "unclosed",
    );
  });
});

describe("transform hints keep a sharp", () => {
  it.each([
    ["C#3", "C#3: vel = 1", 'write "C#3: velocity = 1"'],
    ["F#-1", "F#-1: vel = 1", 'write "F#-1: velocity = 1"'],
    ["f#3 before a comment", "f#3: vel = 1 #(", 'write "f#3: velocity = 1"'],
    [
      "a sharp in where()",
      "where(note.pitch == C#3: velocity = 1",
      'unclosed "("',
    ],
    [
      "a negative-octave sharp in where()",
      "where(note.pitch == F#-1: velocity = 1",
      'unclosed "("',
    ],
  ])("%s", (_name, source, hint) => {
    expect(errorFor(source)).toContain(hint);
  });

  it("starts a comment at a # after a longer word", () => {
    expect(errorFor("velocity = abc#(\n")).not.toContain("unclosed");
  });
});

describe("transform hints stay fast on many comments", () => {
  it.each([
    [
      "unclosed openers after the failure",
      `velocity = = ${"/* a ".repeat(50_000)}`,
    ],
    [
      "unclosed openers on later lines",
      `velocity = = 1\n${"/* a ".repeat(50_000)}`,
    ],
    ["closed comments", `velocity = = ${"/* a */ ".repeat(50_000)}`],
  ])("%s", (_name, source) => {
    const start = performance.now();

    errorFor(source);

    expect(performance.now() - start).toBeLessThan(1000);
  });
});
