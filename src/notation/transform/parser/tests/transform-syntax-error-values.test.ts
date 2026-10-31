// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { errorFor } from "#src/notation/transform/parser/tests/transform-syntax-error-test-helpers.ts";
import { tryParseTransform } from "#src/notation/transform/transform-evaluator.ts";

const TIMING_HINT =
  "timing takes beats, not bar|beat: timing = 0 is 1|1. A position b|n is beat (b-1)*beatsPerBar + (n-1).";

describe("a bar|beat position used as a value", () => {
  it.each([
    "timing = 1|1",
    "where(note.start < 0): timing = 1|1",
    "1|1: timing += 1|2",
    "timing -= 2 |1",
    "timing = 1|1.5",
    "timing = 1|1+n/4",
    "timing = 1|*",
    "timing = 3 + 1|1",
  ])("%s → says timing takes beats", (source) => {
    expect(errorFor(source)).toContain(`: ${TIMING_HINT}`);
  });

  it.each([
    ["velocity = 1|1", "velocity takes a plain value", "velocity = 100"],
    ["duration *= 1|2", "duration takes a plain value", "duration = n/8"],
    ["C1: probability = 2|1", "probability takes a plain value", "0.5"],
  ])("%s → names the parameter", (source, start, example) => {
    const message = errorFor(source);

    expect(message).toContain(`: ${start}, not a bar|beat position`);
    expect(message).toContain(example);
  });

  it("leaves other failures after a number alone", () => {
    expect(errorFor("timing = 1 2")).not.toContain("bar|beat");
    expect(errorFor("where(note.start < 1|2): timing = 1")).not.toContain(
      "takes beats",
    );
  });

  it("still parses bar|beat where it is allowed", () => {
    expect(() => tryParseTransform("1|1-2|1: timing = 0", 4, 4)).not.toThrow();
    expect(() => tryParseTransform("split(2|1, 3|1)", 4, 4)).not.toThrow();
  });
});

describe("sync and raw outside the calls that take them", () => {
  it.each([
    ["velocity = seq(1, 2, sync)", "seq()"],
    ["velocity = rand(1, sync)", "rand()"],
    ["velocity = clamp(1, 2, sync)", "clamp()"],
    ["velocity = swing(0.05, sync)", "swing()"],
  ])("%s → says sync goes last in the waveforms", (source, call) => {
    const message = errorFor(source);

    expect(message).toContain(
      `"sync" goes last in sin(), cos(), saw(), tri(), square() or split(), e.g. sin(n/4, sync); ${call} doesn't take it.`,
    );
  });

  it.each([
    ["velocity = seq(1, raw)", "seq()"],
    ["velocity = sin(n/4, raw)", "sin()"],
  ])("%s → says raw goes last in swing", (source, call) => {
    expect(errorFor(source)).toContain(
      `"raw" goes last in swing(), e.g. swing(0.05, raw); ${call} doesn't take it.`,
    );
  });

  it("names the keyword outside any call", () => {
    expect(errorFor("velocity = sync")).toContain(
      '"sync" goes last in sin(), cos(), saw(), tri(), square() or split(), e.g. sin(n/4, sync).',
    );
  });

  it.each([
    ["velocity = seq(1, 2, )", "seq"],
    ["velocity = rand(1, max(2, ))", "max"],
  ])(
    "%s → names the empty argument and where the keywords go",
    (source, call) => {
      expect(errorFor(source)).toContain(
        `nothing after the comma in ${call}() — add an argument or remove the comma. A final "sync" is for sin, cos, saw, tri, square and split; "raw" is for swing.`,
      );
    },
  );

  it.each(["velocity = sin(n/4, 0.5 sync)", "velocity = swing(0.05 raw)"])(
    "%s → doesn't blame the keyword where the call takes it",
    (source) => {
      const message = errorFor(source);

      expect(message).not.toContain("goes last");
      expect(message).toContain('expected ",", ")"');
    },
  );

  it("leaves the waveform and swing lists as they are", () => {
    expect(errorFor("velocity = cos(n/4, )")).toContain(
      'expected expression, "sync".',
    );
    expect(errorFor("velocity = swing(0.05, )")).toContain(
      'expected expression, "raw".',
    );
  });

  it.each([
    "velocity = sin(n/4, sync)",
    "velocity = cos(1bar, sync)",
    "velocity = swing(0.05, raw)",
    "velocity = swing(0.05, n/16, raw)",
    "split(2|1, sync)",
    "velocity = seq(1, 2, 3)",
  ])("%s still parses", (source) => {
    expect(() => tryParseTransform(source, 4, 4)).not.toThrow();
  });
});

describe("invisible characters", () => {
  it.each([
    [" velocity = 1", "replace the unusual space U+00A0 with a normal space."],
    ["﻿velocity = 1", "remove the invisible character U+FEFF."],
    ["velocity = 1", "replace the unusual space U+00A0 with a normal space."],
    ["velocity = 1​", "remove the invisible character U+200B."],
    [
      "where(note.velocity >​ 5): delete",
      "remove the invisible character U+200B.",
    ],
  ])("%j → names the character", (source, hint) => {
    expect(errorFor(source)).toContain(`: ${hint}`);
  });
});

describe("the expected list", () => {
  it("lists every comparison operator", () => {
    expect(errorFor("where(note.velocity 5): delete")).toContain(
      'expected ">=", "<=", "==", "!=", ">", "<".',
    );
  });
});
