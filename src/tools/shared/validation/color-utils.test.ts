// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { getColorForIndex, parseCommaSeparatedColors } from "./color-utils.ts";

describe("color-utils", () => {
  describe("parseCommaSeparatedColors", () => {
    it("returns null when count is 1", () => {
      expect(parseCommaSeparatedColors("#FF0000,#00FF00", 1)).toBeNull();
    });

    it("returns null when value has no commas", () => {
      expect(parseCommaSeparatedColors("#FF0000", 3)).toBeNull();
    });

    it("returns null when value is undefined", () => {
      expect(parseCommaSeparatedColors(undefined, 3)).toBeNull();
    });

    it("splits comma-separated values when count > 1", () => {
      expect(
        parseCommaSeparatedColors("#FF0000,#00FF00,#0000FF", 3),
      ).toStrictEqual(["#FF0000", "#00FF00", "#0000FF"]);
    });

    it("trims whitespace from values", () => {
      expect(parseCommaSeparatedColors(" #FF0000 , #00FF00 ", 2)).toStrictEqual(
        ["#FF0000", "#00FF00"],
      );
    });
  });

  describe("getColorForIndex", () => {
    it("returns undefined when color is undefined", () => {
      expect(getColorForIndex(undefined, 0, null)).toBeUndefined();
    });

    it("returns color as-is when parsedColors is null", () => {
      expect(getColorForIndex("#FF0000", 0, null)).toBe("#FF0000");
      expect(getColorForIndex("#FF0000", 5, null)).toBe("#FF0000");
    });

    it("returns parsed color at valid index", () => {
      const parsed = ["#FF0000", "#00FF00", "#0000FF"];

      expect(getColorForIndex("#FF0000,#00FF00,#0000FF", 0, parsed)).toBe(
        "#FF0000",
      );
      expect(getColorForIndex("#FF0000,#00FF00,#0000FF", 1, parsed)).toBe(
        "#00FF00",
      );
      expect(getColorForIndex("#FF0000,#00FF00,#0000FF", 2, parsed)).toBe(
        "#0000FF",
      );
    });

    it("cycles through colors when index exceeds array length", () => {
      const parsed = ["#FF0000", "#00FF00", "#0000FF"];

      expect(getColorForIndex("#FF0000,#00FF00,#0000FF", 3, parsed)).toBe(
        "#FF0000",
      );
      expect(getColorForIndex("#FF0000,#00FF00,#0000FF", 4, parsed)).toBe(
        "#00FF00",
      );
      expect(getColorForIndex("#FF0000,#00FF00,#0000FF", 5, parsed)).toBe(
        "#0000FF",
      );
    });

    it("handles single-color cycling", () => {
      const parsed = ["#FF0000"];

      expect(getColorForIndex("#FF0000", 0, parsed)).toBe("#FF0000");
      expect(getColorForIndex("#FF0000", 1, parsed)).toBe("#FF0000");
      expect(getColorForIndex("#FF0000", 99, parsed)).toBe("#FF0000");
    });
  });
});
