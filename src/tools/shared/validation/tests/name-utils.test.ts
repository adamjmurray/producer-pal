// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  getNameForIndex,
  parseCommaSeparatedNames,
  parseNames,
  warnExtraNames,
} from "../name-utils.ts";

vi.mock(import("#src/shared/v8-max-console.ts"), () => ({
  warn: vi.fn(),
}));

describe("name-utils", () => {
  describe("parseCommaSeparatedNames", () => {
    it("returns null when count is 1", () => {
      expect(parseCommaSeparatedNames("A,B", 1)).toBeNull();
    });

    it("returns null when value has no commas", () => {
      expect(parseCommaSeparatedNames("Lead", 3)).toBeNull();
    });

    it("returns null when value is undefined", () => {
      expect(parseCommaSeparatedNames(undefined, 3)).toBeNull();
    });

    it("splits comma-separated values when count > 1", () => {
      expect(parseCommaSeparatedNames("A,B,C", 3)).toStrictEqual([
        "A",
        "B",
        "C",
      ]);
    });

    it("trims whitespace from values", () => {
      expect(parseCommaSeparatedNames(" A , B ", 2)).toStrictEqual(["A", "B"]);
    });

    it("returns fewer names than count when not enough provided", () => {
      expect(parseCommaSeparatedNames("A,B", 5)).toStrictEqual(["A", "B"]);
    });

    it("returns more names than count when too many provided", () => {
      expect(parseCommaSeparatedNames("A,B,C", 2)).toStrictEqual([
        "A",
        "B",
        "C",
      ]);
    });
  });

  describe("getNameForIndex", () => {
    it("returns undefined when baseName is undefined", () => {
      expect(getNameForIndex(undefined, 0, null)).toBeUndefined();
    });

    it("returns baseName when parsedNames is null", () => {
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

  describe("warnExtraNames", () => {
    it("does nothing when parsedNames is null", async () => {
      vi.clearAllMocks();
      warnExtraNames(null, 3, "testTool");
      const console = await import("#src/shared/v8-max-console.ts");

      expect(console.warn).not.toHaveBeenCalled();
    });

    it("does nothing when names count matches item count", async () => {
      vi.clearAllMocks();
      warnExtraNames(["A", "B"], 2, "testTool");
      const console = await import("#src/shared/v8-max-console.ts");

      expect(console.warn).not.toHaveBeenCalled();
    });

    it("does nothing when fewer names than items", async () => {
      vi.clearAllMocks();
      warnExtraNames(["A"], 3, "testTool");
      const console = await import("#src/shared/v8-max-console.ts");

      expect(console.warn).not.toHaveBeenCalled();
    });

    it("warns when more names than items", async () => {
      vi.clearAllMocks();
      warnExtraNames(["A", "B", "C"], 2, "testTool");
      const console = await import("#src/shared/v8-max-console.ts");

      expect(console.warn).toHaveBeenCalledWith(
        "testTool: 3 names provided but only 2 items — ignoring extra",
      );
    });
  });

  describe("parseNames", () => {
    it("parses names and warns on extras in one call", async () => {
      vi.clearAllMocks();
      const result = parseNames("A,B,C", 2, "myTool");
      const console = await import("#src/shared/v8-max-console.ts");

      expect(result).toStrictEqual(["A", "B", "C"]);
      expect(console.warn).toHaveBeenCalledWith(
        "myTool: 3 names provided but only 2 items — ignoring extra",
      );
    });

    it("returns null when no splitting needed", async () => {
      vi.clearAllMocks();
      const result = parseNames("Lead", 1, "myTool");
      const console = await import("#src/shared/v8-max-console.ts");

      expect(result).toBeNull();
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("warns when fewer names than items", async () => {
      vi.clearAllMocks();
      parseNames("A,B", 5, "myTool");
      const console = await import("#src/shared/v8-max-console.ts");

      expect(console.warn).toHaveBeenCalledWith(
        "myTool: 2 names provided for 5 items — extras will keep default names",
      );
    });

    it("returns parsed names without warning when count matches", async () => {
      vi.clearAllMocks();
      const result = parseNames("A,B", 2, "myTool");
      const console = await import("#src/shared/v8-max-console.ts");

      expect(result).toStrictEqual(["A", "B"]);
      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});
