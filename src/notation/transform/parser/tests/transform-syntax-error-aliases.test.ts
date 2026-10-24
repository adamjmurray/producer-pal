// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { errorFor } from "#src/notation/transform/parser/tests/transform-syntax-error-test-helpers.ts";
import { tryParseTransform } from "#src/notation/transform/transform-evaluator.ts";

describe("transform syntax errors for stand-in parameter names", () => {
  it.each([
    ["start", "timing"],
    ["time", "timing"],
    ["position", "timing"],
    ["pos", "timing"],
    ["onset", "timing"],
    ["offset", "timing"],
    ["length", "duration"],
    ["len", "duration"],
    ["note", "pitch"],
    ["key", "pitch"],
    ["chance", "probability"],
    ["v", "velocity"],
  ])("%s → %s", (name, param) => {
    const isn = `${name} isn't a parameter`;

    expect(errorFor(`${name} = 2`)).toContain(`${isn} — write "${param} = 2".`);
    expect(errorFor(`${name} += 0.5`)).toContain(`write "${param} += 0.5".`);
    expect(errorFor(`${name} *= 2`)).toContain(`write "${param} *= 2".`);
    expect(errorFor(`1|1: ${name} = 2`)).toContain(
      `${isn} — write "1|1: ${param} = 2".`,
    );
    expect(errorFor(`C1 1|1: ${name} -= 1`)).toContain(
      `write "C1 1|1: ${param} -= 1".`,
    );
  });

  it("names the parameter when the value won't parse", () => {
    expect(errorFor("1|1: start = 2|1")).toBe(
      'transform syntax error at position 5 (line 1, column 6) near "start = 2|1": start isn\'t a parameter — use timing.',
    );
  });

  it.each([
    ["start 2", 'start isn\'t a parameter — write "timing = 2".'],
    ["1|1: time 0.5", 'time isn\'t a parameter — write "1|1: timing = 0.5".'],
    ["start", "start isn't a parameter — use timing."],
    ["1|1: start 2|1", "start isn't a parameter — use timing."],
    ["start ...", "start isn't a parameter — use timing."],
    ["pos 3", 'pos isn\'t a parameter — write "timing = 3".'],
    ["length", "length isn't a parameter — use duration."],
  ])("%s", (source, expected) => {
    expect(errorFor(source)).toContain(expected);
  });

  it.each([
    "velocity foo bar baz",
    "foo 2",
    "sin 2",
    "1|1: ratchet 2",
    "starts 2",
  ])("leaves %s to the generic error", (source) => {
    expect(errorFor(source)).not.toContain("isn't a parameter — use");
  });

  it("still parses the real parameter names", () => {
    for (const source of [
      "timing = 2",
      "1|1: timing += 0.5",
      "duration *= 0.5",
      "C1 1|1: pitch -= 12",
      "probability = 0.5",
      "velocity = 100",
      "deviation = 20",
    ]) {
      expect(() => tryParseTransform(source, 4, 4)).not.toThrow();
    }
  });
});
