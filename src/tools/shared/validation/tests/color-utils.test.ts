// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { getColorForIndex, parseColors } from "../color-utils.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
}));

describe("color-utils", () => {
  describe("parseColors", () => {
    it("returns null when the value covers every item", () => {
      expect(parseColors("#FF0000,#00FF00", 1, "clip")).toBeNull();
      expect(parseColors("#FF0000", 3, "clip")).toBeNull();
      expect(parseColors(undefined, 3, "clip")).toBeNull();
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

    it("warns when a short list would once have cycled", async () => {
      vi.clearAllMocks();
      parseColors("#FF0000,#0000FF", 6, "clip");
      const console = await import("#src/shared/max/v8-max-console.ts");

      expect(console.warn).toHaveBeenCalledWith(
        "color: 2 colors for 6 clips; the clips past the last color were not recolored",
      );
    });

    it("warns when more colors than items", async () => {
      vi.clearAllMocks();
      parseColors("#FF0000,#00FF00,#0000FF", 2, "track");
      const console = await import("#src/shared/max/v8-max-console.ts");

      expect(console.warn).toHaveBeenCalledWith(
        "color: 3 colors for 2 tracks; the extra colors went unused",
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
