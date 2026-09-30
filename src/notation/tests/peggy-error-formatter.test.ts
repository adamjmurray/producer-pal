// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  editDistance,
  fixParses,
  formatSyntaxError,
  isUnclosed,
  stripComments,
  type SyntaxFailure,
  zeroDenominatorHint,
} from "../peggy-error-formatter.ts";
import { type PeggySyntaxError } from "../peggy-parser-types.ts";

/**
 * @param offset - Where the parse stopped
 * @param line - 1-based line of the failure
 * @param column - 1-based column of the failure
 * @returns A Peggy-shaped syntax error
 */
function syntaxError(
  offset: number,
  line = 1,
  column = offset + 1,
): PeggySyntaxError {
  const point = { offset, line, column };

  return {
    name: "SyntaxError",
    message: "Expected ...",
    expected: [{ type: "literal", text: "]" }],
    found: null,
    location: { start: point, end: point },
  };
}

describe("formatSyntaxError", () => {
  it("names the position, the text there, and the detail", () => {
    let seen: SyntaxFailure | undefined;
    const message = formatSyntaxError(
      "demo syntax error",
      syntaxError(10, 2, 4),
      "C3 1|1\nE3 x 1|2",
      (failure) => {
        seen = failure;

        return "the fix.";
      },
    );

    expect(message).toBe(
      'demo syntax error at position 10 (line 2, column 4) near "x 1|2": the fix.',
    );
    expect(seen).toStrictEqual({
      line: "E3 x 1|2",
      column: 3,
      expected: [{ type: "literal", text: "]" }],
      source: "C3 1|1\nE3 x 1|2",
      offset: 10,
    });
  });

  it("says where the input or the line ended", () => {
    expect(formatSyntaxError("e", syntaxError(3), "C3 ", () => "d")).toBe(
      "e at position 3 (line 1, column 4) at end of input: d",
    );
    expect(formatSyntaxError("e", syntaxError(3), "C3 \nD3", () => "d")).toBe(
      "e at position 3 (line 1, column 4) at end of line: d",
    );
  });

  it("shortens long text at the failure", () => {
    const message = formatSyntaxError(
      "e",
      syntaxError(0),
      "x".repeat(40),
      () => "d",
    );

    expect(message).toContain(`near "${"x".repeat(24)}…"`);
  });
});

describe("hint helpers", () => {
  it("strips comments but keeps a sharp", () => {
    expect(stripComments("C#3 1|1 // [ note")).toBe("C#3 1|1 ");
    expect(stripComments("C3 /* ( */ 1|1 # )")).toBe("C3   1|1 ");
  });

  it("spots an unclosed bracket", () => {
    expect(isUnclosed("[C3 E3", "[", "]")).toBe(true);
    expect(isUnclosed("[C3 E3]", "[", "]")).toBe(false);
  });

  it("spots a zero note-value denominator, but not n/0.5", () => {
    expect(zeroDenominatorHint("C3 1|1+n1/0")).toContain("(got n1/0)");
    expect(zeroDenominatorHint("n/0.5 C3")).toBeNull();
    expect(zeroDenominatorHint("clip.position/0")).toBeNull();
  });

  it("measures edit distance", () => {
    expect(editDistance("kck", "kick")).toBe(1);
    expect(editDistance("melod", "melody")).toBe(1);
  });

  it("reports whether a fix parses", () => {
    const parse = (text: string): string => {
      if (text !== "ok") {
        throw new Error("no");
      }

      return text;
    };

    expect(fixParses(parse, "ok")).toBe(true);
    expect(fixParses(parse, "bad")).toBe(false);
  });
});
