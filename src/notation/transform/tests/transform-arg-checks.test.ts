// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  tryParseTransform,
  applyTransforms,
} from "#src/notation/transform/transform-evaluator.ts";
import { createTestNote } from "./evaluator/transform-evaluator-test-helpers.ts";

describe("a duplicate selector", () => {
  it.each([
    ["C3: E3: velocity = 1", /duplicate pitch selector/],
    ["1|1-2|1: 3|1-4|1: v0", /duplicate time selector/],
    [
      "where(note.pitch > 60): where(note.pitch < 70): v0",
      /duplicate where\(\)/,
    ],
    ["C3: E3: ratchet(2)", /duplicate pitch selector/],
  ])("is refused: %s", (transform, message) => {
    expect(() => tryParseTransform(transform, 4, 4)).toThrow(message);
    expect(() => tryParseTransform(transform, 4, 4, "audio")).toThrow(message);
  });

  it("names the selector", () => {
    expect(() => tryParseTransform("C3: E3: velocity = 1", 4, 4)).toThrow(
      'Bad selector "C3: E3:"',
    );
  });
});

describe("a pitch name used as a number", () => {
  it.each([
    ["velocity = C3", `note name "C3" isn't a value for velocity`],
    ["duration += C3", `note name "C3" isn't a value for duration`],
  ])("is refused for MIDI: %s", (transform, message) => {
    expect(() => tryParseTransform(transform, 4, 4)).toThrow(message);
  });

  it.each([
    ["gain = C3", 'pitch name "C3" isn\'t a value for gain'],
    ["pitchShift = C3", 'pitch name "C3" isn\'t a value for pitchShift'],
  ])("is refused for audio: %s", (transform, message) => {
    expect(() => tryParseTransform(transform, 4, 4, "audio")).toThrow(message);
  });

  it("is fine for pitch, nested in arithmetic, or in a function", () => {
    for (const transform of [
      "pitch = C3",
      "velocity = C3 + 0",
      "velocity = min(C3, C5)",
    ]) {
      expect(() => tryParseTransform(transform, 4, 4)).not.toThrow();
    }
  });

  it("is not judged for the other kind of clip, which ignores the line", () => {
    expect(() => tryParseTransform("gain = C3", 4, 4)).not.toThrow();
    expect(() =>
      tryParseTransform("velocity = C3", 4, undefined, "audio"),
    ).not.toThrow();
  });
});

describe("a curve() exponent", () => {
  it.each([
    "velocity = curve(0, 100, 0)",
    "velocity = curve(0, 100, -2)",
    "velocity = 1 + curve(0, 100, 1 - 1)",
    "velocity = ramp(0, curve(0, 100, 0))",
  ])("of 0 or less is refused: %s", (transform) => {
    expect(() => tryParseTransform(transform, 4, 4)).toThrow(
      "curve() exponent must be > 0",
    );
  });

  it("is refused in an audio transform too", () => {
    expect(() =>
      tryParseTransform("gain = curve(0, 1, 0)", 4, 4, "audio"),
    ).toThrow("curve() exponent must be > 0, got 0");
  });

  it("is left to the notes when it depends on them", () => {
    expect(() =>
      tryParseTransform("velocity = curve(0, 100, note.pitch - 60)", 4, 4),
    ).not.toThrow();
    expect(() =>
      tryParseTransform("velocity = curve(0, 100, cos(n/4) - 2)", 4, 4),
    ).not.toThrow();
  });

  it("still reports a note-dependent exponent that comes out wrong", () => {
    const notes = createTestNote({ pitch: 60, velocity: 100 });

    applyTransforms(notes, "velocity = curve(0, 100, note.pitch - 60)", 4, 4);

    expect(notes[0]?.velocity).toBe(100);
  });
});

describe("applyTransforms", () => {
  it("refuses a bad argument itself, so nothing slips through unchecked", () => {
    const notes = createTestNote({ velocity: 100 });

    expect(() => applyTransforms(notes, "ratchet(0)", 4, 4)).toThrow(
      "ratchet() needs a count of 2 or more",
    );
    expect(notes).toHaveLength(1);
  });
});

describe("a built-in function's argument count", () => {
  it.each([
    ["rand(1, 2, 3)", "rand() needs 0-2 arguments"],
    ["choose()", "choose() needs at least 1 argument"],
    ["seq()", "seq() needs at least 1 argument"],
    ["clipseq()", "clipseq() needs at least 1 argument"],
    ["snap()", "snap() needs exactly 1 argument: snap(pitch)"],
    ["snap(60, 62)", "snap() needs exactly 1 argument"],
    ["step(60)", "step() needs exactly 2 arguments: step(basePitch, offset)"],
    ["step(60, 2, 3)", "step() needs exactly 2 arguments"],
    ["quant()", "quant() needs exactly 1 argument"],
    ["quant(n/8, n/16)", "quant() needs exactly 1 argument"],
    ["legato(1, 2)", "legato() needs 0-1 arguments"],
    ["pow(2)", "pow() needs exactly 2 arguments"],
    ["curve(0, 1)", "curve() needs exactly 3 arguments"],
    ["ramp()", "ramp() needs exactly 2 arguments"],
    ["ramp(0)", "ramp() needs exactly 2 arguments"],
    ["ramp(0, 100, 1, 2)", "ramp() needs exactly 2 arguments"],
    ["min(60)", "min() needs at least 2 arguments"],
    ["max(60)", "max() needs at least 2 arguments"],
    ["round()", "round() needs exactly 1 argument: round(value)"],
    ["floor(1.5, 2)", "floor() needs exactly 1 argument"],
    ["ceil()", "ceil() needs exactly 1 argument"],
    ["abs(-1, 2)", "abs() needs exactly 1 argument"],
    ["clamp(50, 0)", "clamp() needs exactly 3 arguments"],
    ["wrap(50)", "wrap() needs exactly 3 arguments"],
    ["reflect(50, 0, 100, 200)", "reflect() needs exactly 3 arguments"],
    ["cos()", "cos() needs 1-2 arguments"],
    ["sin(n/4, 0, 0.9)", "sin() needs 1-2 arguments"],
    ["tri(n/4, 0, 0.9)", "tri() needs 1-2 arguments"],
    ["saw(n/4, 0, 0.9)", "saw() needs 1-2 arguments"],
    ["square()", "square() needs 1-3 arguments"],
    ["square(n/4, 0, 0.5, 0.9)", "square() needs 1-3 arguments"],
  ])("refuses %s", (call, message) => {
    expect(() => tryParseTransform(`velocity = ${call}`, 4, 4)).toThrow(
      message,
    );
  });

  it("is judged inside arithmetic, other functions and note op arguments", () => {
    expect(() =>
      tryParseTransform("velocity = 1 + min(round(1, 2), 3)", 4, 4),
    ).toThrow("round() needs exactly 1 argument");
    expect(() => tryParseTransform("ratchet(round())", 4, 4)).toThrow(
      "round() needs exactly 1 argument",
    );
    expect(() => tryParseTransform("repeat(n/8, abs(1, 2))", 4, 4)).toThrow(
      "abs() needs exactly 1 argument",
    );
  });

  it("is judged in a where() predicate and for audio", () => {
    expect(() =>
      tryParseTransform("where(note.pitch > round()): velocity = 1", 4, 4),
    ).toThrow("round() needs exactly 1 argument");
    expect(() =>
      tryParseTransform("gain = ramp(0)", 4, undefined, "audio"),
    ).toThrow("ramp() needs exactly 2 arguments");
  });

  it("counts positional arguments only, not the sync and raw keywords", () => {
    for (const transform of [
      "velocity = cos(n/4, sync)",
      "velocity = square(n/4, 0, 0.5, sync)",
      "timing = swing(0.05, n/8, raw)",
      "velocity = rand()",
      "velocity = choose(1)",
      "duration = legato()",
    ]) {
      expect(() => tryParseTransform(transform, 4, 4)).not.toThrow();
    }
  });
});

describe("a compound assignment of a position function", () => {
  it.each([
    ["timing += swing(0.3, n/8)", "swing", "timing +="],
    ["timing -= swing(0.05)", "swing", "timing -="],
    ["timing *= swing(0.05)", "swing", "timing *="],
    ["timing /= swing(0.05)", "swing", "timing /="],
    ["timing += quant(n/16)", "quant", "timing +="],
    ["timing -= quant(n/16)", "quant", "timing -="],
    ["timing *= quant(n/16)", "quant", "timing *="],
    ["timing /= quant(n/16)", "quant", "timing /="],
    ["C3: 1|1-2|1: timing += swing(0.05)", "swing", "timing +="],
    ["velocity += quant(n/4)", "quant", "velocity +="],
  ])("is refused: %s", (transform, fn, op) => {
    const param = op.split(" ")[0];

    expect(() => tryParseTransform(transform, 4, 4)).toThrow(
      `${fn}() returns the new start, so use "${param} = ${fn}(...)", not "${op}"`,
    );
  });

  it("is refused by applyTransforms before any note changes", () => {
    const notes = createTestNote({ start_time: 2 });

    expect(() => applyTransforms(notes, "timing += swing(0.3)", 4, 4)).toThrow(
      "swing() returns the new start",
    );
    expect(notes[0]?.start_time).toBe(2);
  });

  it("is refused in an audio transform too", () => {
    expect(() =>
      tryParseTransform("gain += quant(n/4)", 4, 4, "audio"),
    ).toThrow('use "gain = quant(...)", not "gain +="');
  });

  it("still allows plain assignment and other compound values", () => {
    for (const transform of [
      "timing = swing(0.3, n/8)",
      "timing = quant(n/16)",
      "C3: timing = swing(0.05)",
      "timing += 0.1",
      "timing -= n/16",
      "timing *= 0.5",
      "timing = note.start * swing(0.05)",
      "timing = note.start / quant(n/16)",
      "timing = note.start + swing(0.05)",
      "timing += rand(-0.01, 0.01)",
      "timing += quant(n/16) - note.start",
      "timing += min(0.1, swing(0.05) - note.start)",
      "velocity += legato()",
    ]) {
      expect(() => tryParseTransform(transform, 4, 4)).not.toThrow();
    }
  });
});
