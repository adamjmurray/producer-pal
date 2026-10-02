// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type InsertionSpot,
  planInsertions,
} from "../../lists/insertion-plan.ts";

/**
 * The parts of a plan most tests check: where each entry is created, how many
 * empties it pads first, where it ends up and the empties right below it.
 * @param spots - Where each new object goes
 * @param padsGaps - Fill a gap past the end (scenes)
 * @returns [atIndex, padCount, finalIndex, emptyBelow] per entry
 */
function plan(spots: InsertionSpot[], padsGaps: boolean): number[][] {
  return planInsertions(spots, 2, padsGaps).map((insertion) => [
    insertion.atIndex,
    insertion.padCount,
    insertion.finalIndex,
    insertion.emptyBelow,
  ]);
}

describe("planInsertions", () => {
  describe("with gaps filled (scenes), on two existing", () => {
    it("appends an end entry after one past the end", () => {
      expect(planInsertions([5, "end"], 2, true)).toStrictEqual([
        {
          insertIndex: 5,
          atIndex: 5,
          reachIndex: 5,
          padCount: 3,
          finalIndex: 5,
          emptyBelow: 3,
        },
        {
          insertIndex: "end",
          atIndex: 6,
          reachIndex: "end",
          padCount: 0,
          finalIndex: 6,
          emptyBelow: 0,
        },
      ]);
    });

    it("pads an end entry that runs before one past the end", () => {
      expect(plan(["end", 5], true)).toStrictEqual([
        [2, 0, 2, 0],
        [5, 2, 5, 2],
      ]);
    });

    it("puts entries past the end at exactly the index each names", () => {
      expect(plan([5, 6], true)).toStrictEqual([
        [5, 3, 5, 3],
        [6, 0, 6, 0],
      ]);
      expect(plan([6, 5], true)).toStrictEqual([
        [5, 3, 6, 0],
        [5, 0, 5, 3],
      ]);
    });

    it("stacks entries past the end that name one index", () => {
      expect(plan([5, 5], true)).toStrictEqual([
        [5, 3, 5, 3],
        [6, 0, 6, 0],
      ]);
    });

    // The insert inside takes the place of one empty scene, so the entry past
    // the end stays where it was named, whichever runs first.
    it("keeps an entry past the end in place around an insert inside", () => {
      expect(plan([1, 5], true)).toStrictEqual([
        [1, 0, 1, 0],
        [5, 2, 5, 2],
      ]);
      expect(plan([5, 1], true)).toStrictEqual([
        [4, 2, 5, 2],
        [1, 0, 1, 0],
      ]);
    });

    it("splits the gap when a later entry lands inside it", () => {
      expect(plan([6, 3], true)).toStrictEqual([
        [5, 3, 6, 2],
        [3, 0, 3, 1],
      ]);
    });

    // An insert inside pushes the existing ones up past the index they name.
    it("keeps list order for entries pushed past the existing ones", () => {
      expect(plan([0, 2, 2], true)).toStrictEqual([
        [0, 0, 0, 0],
        [3, 0, 3, 0],
        [4, 0, 4, 0],
      ]);
    });

    it("puts a later, higher entry after a stack past the end", () => {
      expect(plan([5, 5, 6], true)).toStrictEqual([
        [5, 3, 5, 3],
        [6, 0, 6, 0],
        [7, 0, 7, 0],
      ]);
    });

    it("never puts an entry past the end among the existing ones", () => {
      expect(plan([0, 0, 3], true)).toStrictEqual([
        [0, 0, 0, 0],
        [1, 0, 1, 0],
        [4, 0, 4, 0],
      ]);
    });
  });

  describe("without gaps filled (tracks), on two existing", () => {
    it("stacks two at one index in list order", () => {
      expect(plan([2, 2], false)).toStrictEqual([
        [2, 0, 2, 0],
        [3, 0, 3, 0],
      ]);
    });

    it("appends spots past the end in list order", () => {
      expect(plan([0, 4, 3], false)).toStrictEqual([
        [0, 0, 0, 0],
        [3, 0, 3, 0],
        [4, 0, 4, 0],
      ]);
    });

    it("clamps a spot past the end and reports the reach", () => {
      expect(planInsertions([3, 1], 2)).toStrictEqual([
        {
          insertIndex: 2,
          atIndex: 2,
          reachIndex: 3,
          padCount: 0,
          finalIndex: 3,
          emptyBelow: 0,
        },
        {
          insertIndex: 1,
          atIndex: 1,
          reachIndex: 1,
          padCount: 0,
          finalIndex: 1,
          emptyBelow: 0,
        },
      ]);
    });

    it("keeps end as end around numbered entries", () => {
      expect(
        planInsertions(["end", 2], 2).map((i) => [i.insertIndex, i.finalIndex]),
      ).toStrictEqual([
        ["end", 3],
        [2, 2],
      ]);
      expect(
        planInsertions([5, "end"], 2).map((i) => [i.insertIndex, i.finalIndex]),
      ).toStrictEqual([
        [2, 2],
        ["end", 3],
      ]);
    });
  });
});
