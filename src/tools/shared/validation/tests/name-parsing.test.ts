// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { getNameForIndex, parseNames } from "../name-parsing.ts";

describe("name-parsing", () => {
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
    it("refuses more names than items", () => {
      expect(() => parseNames("A,B,C", 2, "clip")).toThrow(
        "name names 3 names but the call acts on 2 clips",
      );
    });

    it("returns null when no splitting needed", () => {
      expect(parseNames("Lead", 1, "clip")).toBeNull();
    });

    it("refuses fewer names than items", () => {
      expect(() => parseNames("A,B", 5, "track")).toThrow(
        "name names 2 names but the call acts on 5 tracks",
      );
    });

    it("returns parsed names when the count matches", () => {
      expect(parseNames("A,B", 2, "scene")).toStrictEqual(["A", "B"]);
    });
  });
});
