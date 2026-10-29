// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { getColorForIndex, parseColors } from "../color-parsing.ts";

describe("color-parsing", () => {
  describe("parseColors", () => {
    it("returns null when the value covers every item", () => {
      expect(parseColors("#FF0000", 3, "clip")).toBeNull();
      expect(parseColors(undefined, 3, "clip")).toBeNull();
    });

    it("refuses a comma-bearing value when count is 1 (nothing to split it against)", () => {
      // splitList never splits for a single item, so the whole string is
      // checked as one color and fails the #RRGGBB format.
      expect(() => parseColors("#FF0000,#00FF00", 1, "clip")).toThrow(
        'invalid color "#FF0000,#00FF00" - expected "#RRGGBB"',
      );
    });

    it("splits and trims a list", () => {
      expect(parseColors("#FF0000,#00FF00,#0000FF", 3, "clip")).toStrictEqual([
        "#FF0000",
        "#00FF00",
        "#0000FF",
      ]);
      expect(parseColors(" #FF0000 , #00FF00 ", 2, "clip")).toStrictEqual([
        "#FF0000",
        "#00FF00",
      ]);
    });

    it("refuses a short list instead of leaving items uncolored", () => {
      expect(() => parseColors("#FF0000,#0000FF", 6, "clip")).toThrow(
        "color names 2 colors but the call acts on 6 clips",
      );
    });

    it("refuses more colors than items", () => {
      expect(() => parseColors("#FF0000,#00FF00,#0000FF", 2, "track")).toThrow(
        "color names 3 colors but the call acts on 2 tracks",
      );
    });

    it("refuses a single value that isn't #RRGGBB", () => {
      expect(() => parseColors("not-a-hex-color", 3, "clip")).toThrow(
        'invalid color "not-a-hex-color" - expected "#RRGGBB"',
      );
    });

    it("refuses a malformed entry inside a list", () => {
      expect(() =>
        parseColors("#FF0000,not-a-hex-color,#0000FF", 3, "clip"),
      ).toThrow('invalid color "not-a-hex-color" - expected "#RRGGBB"');
    });

    it("refuses a short-hand 3-digit hex", () => {
      expect(() => parseColors("#F00", 1, "track")).toThrow(
        'invalid color "#F00" - expected "#RRGGBB"',
      );
    });
  });

  describe("getColorForIndex", () => {
    it("returns undefined when color is undefined", () => {
      expect(getColorForIndex(undefined, 0, null)).toBeUndefined();
      // The color guard must win even when parsedColors could supply a value.
      expect(getColorForIndex(undefined, 0, ["#FF0000"])).toBeUndefined();
    });

    it("broadcasts the one color the call gave", () => {
      expect(getColorForIndex("#FF0000", 0, null)).toBe("#FF0000");
      expect(getColorForIndex("#FF0000", 5, null)).toBe("#FF0000");
    });

    it("returns parsed color at valid index", () => {
      const parsed = ["#FF0000", "#00FF00", "#0000FF"];

      expect(getColorForIndex("#FF0000,#00FF00,#0000FF", 0, parsed)).toBe(
        "#FF0000",
      );
      expect(getColorForIndex("#FF0000,#00FF00,#0000FF", 2, parsed)).toBe(
        "#0000FF",
      );
    });

    it("stops at the end of the list instead of cycling", () => {
      const parsed = ["#FF0000", "#00FF00", "#0000FF"];

      expect(
        getColorForIndex("#FF0000,#00FF00,#0000FF", 3, parsed),
      ).toBeUndefined();
      expect(
        getColorForIndex("#FF0000,#00FF00,#0000FF", 5, parsed),
      ).toBeUndefined();
    });
  });
});
