// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { formatParserError } from "./peggy-error-formatter.ts";
import type { PeggySyntaxError } from "./peggy-parser-types.ts";

interface SyntaxErrorOverrides {
  expected?: PeggySyntaxError["expected"];
  found?: string | null;
  location?: PeggySyntaxError["location"];
}

function createSyntaxError(
  overrides: SyntaxErrorOverrides = {},
): PeggySyntaxError {
  return {
    name: "SyntaxError",
    message: "Expected ...",
    expected:
      "expected" in overrides
        ? (overrides.expected as PeggySyntaxError["expected"])
        : [{ type: "other", description: "time position" }],
    found: overrides.found !== undefined ? overrides.found : "x",
    location: overrides.location ?? {
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 1, line: 1, column: 2 },
    },
  };
}

describe("Peggy Error Formatter", () => {
  describe("formatParserError", () => {
    it("formats error with labeled expectations for barbeat", () => {
      const error = createSyntaxError({
        expected: [
          { type: "other", description: "time position" },
          { type: "other", description: "note pitch" },
          { type: "other", description: "velocity value" },
        ],
      });

      const result = formatParserError(error, "bar|beat");

      expect(result).toBe(
        'bar|beat syntax error at position 0 (line 1, column 1): Expected time position, note pitch, velocity value but "x" found',
      );
    });

    it("formats error with labeled expectations for transform", () => {
      const error = createSyntaxError({
        expected: [
          { type: "other", description: "parameter name" },
          { type: "other", description: "range selector" },
        ],
        found: "invalid",
        location: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 7, line: 1, column: 8 },
        },
      });

      const result = formatParserError(error, "transform");

      expect(result).toBe(
        'transform syntax error at position 0 (line 1, column 1): Expected parameter name, range selector but "invalid" found',
      );
    });

    it("limits expectations to 5 items", () => {
      const error = createSyntaxError({
        expected: [
          { type: "other", description: "option1" },
          { type: "other", description: "option2" },
          { type: "other", description: "option3" },
          { type: "other", description: "option4" },
          { type: "other", description: "option5" },
          { type: "other", description: "option6" },
          { type: "other", description: "option7" },
        ],
      });

      const result = formatParserError(error, "bar|beat");

      // Should only include first 5
      expect(result).toContain("option1");
      expect(result).toContain("option5");
      expect(result).not.toContain("option6");
      expect(result).not.toContain("option7");
    });

    it("handles error at end of input", () => {
      const error = createSyntaxError({
        expected: [{ type: "other", description: "expression" }],
        found: null,
        location: {
          start: { offset: 10, line: 1, column: 11 },
          end: { offset: 10, line: 1, column: 11 },
        },
      });

      const result = formatParserError(error, "transform");

      expect(result).toBe(
        "transform syntax error at position 10 (line 1, column 11): Expected expression but reached end of input",
      );
    });

    it("ignores non-labeled expectations", () => {
      const error = createSyntaxError({
        expected: [
          { type: "literal", value: "+" },
          { type: "class", value: "[0-9]" },
          { type: "other", description: "time position" },
          { type: "literal", value: "v" },
        ],
      });

      const result = formatParserError(error, "bar|beat");

      // Should only include the labeled one
      expect(result).toContain("time position");
      expect(result).not.toContain("+");
      expect(result).not.toContain("[0-9]");
      expect(result).not.toContain("v");
    });

    it("falls back to 'valid syntax' when no labels", () => {
      const error = createSyntaxError({
        expected: [
          { type: "literal", value: "+" },
          { type: "literal", value: "-" },
        ],
        location: {
          start: { offset: 5, line: 1, column: 6 },
          end: { offset: 6, line: 1, column: 7 },
        },
      });

      const result = formatParserError(error, "transform");

      expect(result).toBe(
        'transform syntax error at position 5 (line 1, column 6): Expected valid syntax but "x" found',
      );
    });

    it("handles missing location info", () => {
      const error = {
        ...createSyntaxError({
          expected: [{ type: "other", description: "parameter name" }],
        }),
        location: undefined as unknown as PeggySyntaxError["location"],
      };

      const result = formatParserError(error, "transform");

      expect(result).toContain("at unknown position");
      expect(result).toContain("parameter name");
    });

    it("escapes control characters in found value", () => {
      const error = createSyntaxError({
        found: "\n\t\\",
        location: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: 3, line: 1, column: 4 },
        },
      });

      const result = formatParserError(error, "bar|beat");

      expect(result).toContain('"\\n\\t\\\\"');
    });

    it("handles empty expected array", () => {
      const error = createSyntaxError({ expected: [] });

      const result = formatParserError(error, "bar|beat");

      expect(result).toContain("valid syntax");
    });

    it("handles undefined expected array", () => {
      const error = createSyntaxError({ expected: undefined });

      const result = formatParserError(error, "bar|beat");

      expect(result).toContain("valid syntax");
    });

    it("formats multi-line error position correctly", () => {
      const error = createSyntaxError({
        expected: [{ type: "other", description: "parameter assignment" }],
        location: {
          start: { offset: 42, line: 3, column: 15 },
          end: { offset: 43, line: 3, column: 16 },
        },
      });

      const result = formatParserError(error, "transform");

      expect(result).toContain("at position 42 (line 3, column 15)");
    });
  });
});
