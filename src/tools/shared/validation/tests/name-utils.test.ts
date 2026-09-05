// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { getNameForIndex, parseNames } from "../name-utils.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
}));

describe("name-utils", () => {
  describe("getNameForIndex", () => {
    it("returns undefined when baseName is undefined", () => {
      expect(getNameForIndex(undefined, 0, null)).toBeUndefined();
      // The baseName guard must win even when parsedNames could supply a value.
      expect(getNameForIndex(undefined, 0, ["A"])).toBeUndefined();
    });

    it("broadcasts the one name the call gave", () => {
      expect(getNameForIndex("Lead", 0, null)).toBe("Lead");
      expect(getNameForIndex("Lead", 5, null)).toBe("Lead");
    });

    it("returns parsed name at valid index", () => {
      const parsed = ["A", "B", "C"];

      expect(getNameForIndex("A,B,C", 0, parsed)).toBe("A");
      expect(getNameForIndex("A,B,C", 1, parsed)).toBe("B");
      expect(getNameForIndex("A,B,C", 2, parsed)).toBe("C");
    });

    it("returns undefined when index exceeds parsed names", () => {
      const parsed = ["A", "B"];

      expect(getNameForIndex("A,B", 2, parsed)).toBeUndefined();
      expect(getNameForIndex("A,B", 10, parsed)).toBeUndefined();
    });
  });

  describe("parseNames", () => {
    it("parses names and warns on extras in one call", async () => {
      vi.clearAllMocks();
      const result = parseNames("A,B,C", 2, "clip");
      const console = await import("#src/shared/max/v8-max-console.ts");

      expect(result).toStrictEqual(["A", "B", "C"]);
      expect(console.warn).toHaveBeenCalledWith(
        "name: 3 names for 2 clips; the extra names went unused",
      );
    });

    it("returns null when no splitting needed", async () => {
      vi.clearAllMocks();
      const result = parseNames("Lead", 1, "clip");
      const console = await import("#src/shared/max/v8-max-console.ts");

      expect(result).toBeNull();
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("warns when fewer names than items", async () => {
      vi.clearAllMocks();
      parseNames("A,B", 5, "track");
      const console = await import("#src/shared/max/v8-max-console.ts");

      expect(console.warn).toHaveBeenCalledWith(
        "name: 2 names for 5 tracks; the tracks past the last name were not renamed",
      );
    });

    it("returns parsed names without warning when count matches", async () => {
      vi.clearAllMocks();
      const result = parseNames("A,B", 2, "scene");
      const console = await import("#src/shared/max/v8-max-console.ts");

      expect(result).toStrictEqual(["A", "B"]);
      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});
