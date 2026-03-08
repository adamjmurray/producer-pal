// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import * as parser from "#src/notation/transform/parser/transform-parser.ts";

describe("Transform Parser - whitespace and comments", () => {
  it("handles whitespace around operators", () => {
    const result = parser.parse("velocity +=   10   +   5");

    expect(result[0]!.expression).toStrictEqual({
      type: "add",
      left: 10,
      right: 5,
    });
  });

  it("handles multiple blank lines between assignments", () => {
    const result = parser.parse("velocity += 10\n\n\ntiming += 0.05");

    expect(result).toHaveLength(2);
    expect(result[0]!.parameter).toBe("velocity");
    expect(result[1]!.parameter).toBe("timing");
  });

  it("handles line comments", () => {
    const result = parser.parse("velocity += 10 // this is a comment");

    expect(result[0]!.expression).toBe(10);
  });

  it("handles hash comments", () => {
    const result = parser.parse("velocity += 10 # this is a comment");

    expect(result[0]!.expression).toBe(10);
  });

  it("handles block comments", () => {
    const result = parser.parse("velocity += 10 /* block comment */");

    expect(result[0]!.expression).toBe(10);
  });

  it("handles comments on separate lines", () => {
    const result = parser.parse(
      "// comment\nvelocity += 10\n// another comment\ntiming += 0.05",
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.parameter).toBe("velocity");
    expect(result[1]!.parameter).toBe("timing");
  });

  it("handles trailing newline", () => {
    const result = parser.parse("velocity += 10\n");

    expect(result).toHaveLength(1);
    expect(result[0]!.parameter).toBe("velocity");
  });

  it("handles trailing comment on its own line", () => {
    const result = parser.parse("velocity += 10\n// trailing comment\n");

    expect(result).toHaveLength(1);
    expect(result[0]!.parameter).toBe("velocity");
  });

  it("handles input that is only comments", () => {
    const result = parser.parse("// just a comment\n# another comment");

    expect(result).toHaveLength(0);
  });

  it("handles block comment between assignments", () => {
    const result = parser.parse(
      "velocity += 10\n/* block\ncomment */\ntiming += 0.05",
    );

    expect(result).toHaveLength(2);
    expect(result[0]!.parameter).toBe("velocity");
    expect(result[1]!.parameter).toBe("timing");
  });

  it("handles inline comment with trailing newline", () => {
    const result = parser.parse("velocity += 10 // comment\n");

    expect(result).toHaveLength(1);
    expect(result[0]!.parameter).toBe("velocity");
  });
});
