// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  type PairLabels,
  pairExact,
  pairValues,
  splitList,
  valueForIndex,
  warnPairingMismatch,
} from "../lists/list-pairing.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
}));

const LABELS: PairLabels = {
  param: "toPath",
  noun: "destination",
  item: "clip",
  shortfall: "were not moved",
};

/**
 * The warn mock, cleared and ready for one call's worth of assertions.
 * @returns The mocked console module
 */
async function freshConsole(): Promise<{ warn: unknown }> {
  vi.clearAllMocks();

  return await import("#src/shared/max/v8-max-console.ts");
}

describe("list-pairing", () => {
  describe("splitList", () => {
    it("returns null when there is nothing to pair", () => {
      expect(splitList("A,B", 1, "name")).toBeNull();
      expect(splitList("Lead", 3, "name")).toBeNull();
      expect(splitList(undefined, 3, "name")).toBeNull();
    });

    it("splits and trims", () => {
      expect(splitList("A,B,C", 3, "name")).toStrictEqual(["A", "B", "C"]);
      expect(splitList(" A , B ", 2, "name")).toStrictEqual(["A", "B"]);
    });

    it("keeps a mismatched count as written, for the caller to warn about", () => {
      expect(splitList("A,B", 5, "name")).toStrictEqual(["A", "B"]);
      expect(splitList("A,B,C", 2, "name")).toStrictEqual(["A", "B", "C"]);
    });

    it("does not count a trailing comma as an entry", () => {
      expect(splitList("A,B,", 3, "name")).toStrictEqual(["A", "B"]);
      expect(splitList("A,B, ", 2, "name")).toStrictEqual(["A", "B"]);
    });

    // A gap reads two ways — a stray comma, or a value that went missing — and
    // the call doesn't say which.
    it("refuses an empty entry, naming the param", () => {
      expect(() => splitList("A,,C", 3, "name")).toThrow(
        'invalid name "A,,C" - it has an empty entry. Drop the extra comma, ' +
          "or give every item a value.",
      );
      expect(() => splitList(",B", 2, "color")).toThrow(
        'invalid color ",B" - it has an empty entry',
      );
      expect(() => splitList("A, ,C", 3, "name")).toThrow("empty entry");
    });
  });

  describe("valueForIndex", () => {
    it("broadcasts the whole value when the call named one", () => {
      expect(valueForIndex("Lead", 0, null)).toBe("Lead");
      expect(valueForIndex("Lead", 7, null)).toBe("Lead");
    });

    it("pairs positionally and stops at the end of the list", () => {
      expect(valueForIndex("A,B", 1, ["A", "B"])).toBe("B");
      expect(valueForIndex("A,B", 2, ["A", "B"])).toBeUndefined();
    });

    it("returns undefined when the call named nothing", () => {
      expect(valueForIndex(undefined, 0, ["A"])).toBeUndefined();
    });
  });

  describe("pairValues", () => {
    it("broadcasts a lone value to every item without warning", async () => {
      const console = await freshConsole();

      expect(pairValues([5], 3, LABELS)).toStrictEqual([5, 5, 5]);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("pairs an exact list 1:1 without warning", async () => {
      const console = await freshConsole();

      expect(pairValues([1, 2, 3], 3, LABELS)).toStrictEqual([1, 2, 3]);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("does not cycle a mismatched list", async () => {
      const console = await freshConsole();

      expect(pairValues([1, 2], 3, LABELS)).toStrictEqual([1, 2, null]);
      expect(console.warn).toHaveBeenCalledWith(
        "toPath: 2 destinations for 3 clips; the clips past the last destination were not moved",
      );
    });

    // A lone value that didn't parse is still one value for every item, so the
    // count was never wrong and a count warning would be a second, false story.
    it("broadcasts a lone null without warning", async () => {
      const console = await freshConsole();

      expect(pairValues([null], 2, LABELS)).toStrictEqual([null, null]);
      expect(console.warn).not.toHaveBeenCalled();
    });

    // Only the length decides: two entries are a list even when neither parsed,
    // and a list of two for three items really is the wrong length.
    it("still warns for a wrong-length list of nulls", async () => {
      const console = await freshConsole();

      expect(pairValues([null, null], 3, LABELS)).toStrictEqual([
        null,
        null,
        null,
      ]);
      expect(console.warn).toHaveBeenCalledWith(
        "toPath: 2 destinations for 3 clips; the clips past the last destination were not moved",
      );
    });
  });

  describe("pairExact", () => {
    it("refuses to broadcast, so one destination reaches one item", async () => {
      const console = await freshConsole();

      expect(pairExact(["a"], 3, LABELS)).toStrictEqual(["a", null, null]);
      expect(console.warn).toHaveBeenCalledWith(
        "toPath: 1 destination for 3 clips; the clips past the last destination were not moved",
      );
    });

    it("drops the extras and says so", async () => {
      const console = await freshConsole();

      expect(pairExact(["a", "b", "c"], 2, LABELS)).toStrictEqual(["a", "b"]);
      expect(console.warn).toHaveBeenCalledWith(
        "toPath: 3 destinations for 2 clips; the extra destinations went unused",
      );
    });
  });

  describe("warnPairingMismatch", () => {
    it("stays quiet when the counts match or nothing was named", async () => {
      const console = await freshConsole();

      warnPairingMismatch(3, 3, LABELS);
      warnPairingMismatch(0, 3, LABELS);

      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});
