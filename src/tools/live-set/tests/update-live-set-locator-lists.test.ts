// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateLiveSet } from "#src/tools/live-set/update-live-set.ts";
import { simulateLocators } from "./update-live-set-test-helpers.ts";

/** Locators the list tests start from. */
const INTRO_VERSE = [
  { time: 0, name: "Intro" },
  { time: 16, name: "Verse" },
];

/** Ids 26, 27, 28 at bars 1, 5, 9. */
const INTRO_VERSE_DROP = [...INTRO_VERSE, { time: 32, name: "Drop" }];

describe("updateLiveSet - locator lists", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerMockObject("live_set_id", { path: "live_set" });
  });

  describe("create", () => {
    it("creates one locator per position, in order", async () => {
      const set = simulateLocators(liveSet);

      const result = await updateLiveSet({
        locatorOperation: "create",
        locatorTime: "1|1,5|1,9|1",
        locatorName: "Intro,Verse,Drop",
      });

      expect(result.locator).toStrictEqual([
        { operation: "create", id: "26" },
        { operation: "create", id: "27" },
        { operation: "create", id: "28" },
      ]);
      expect(set.locators()).toStrictEqual([
        { time: 0, name: "Intro" },
        { time: 16, name: "Verse" },
        { time: 32, name: "Drop" },
      ]);
    });

    it("gives every locator the one name it was sent", async () => {
      const set = simulateLocators(liveSet);

      await updateLiveSet({
        locatorOperation: "create",
        locatorTime: "1|1,5|1",
        locatorName: "Section",
      });

      expect(set.locators()).toStrictEqual([
        { time: 0, name: "Section" },
        { time: 16, name: "Section" },
      ]);
    });

    it("keeps a comma in the name when the call names one locator", async () => {
      const set = simulateLocators(liveSet);

      const result = await updateLiveSet({
        locatorOperation: "create",
        locatorTime: "1|1",
        locatorName: "Verse, part 2",
      });

      expect(result.locator).toStrictEqual({
        operation: "create",
        id: "26",
      });
      expect(set.locators()).toStrictEqual([
        { time: 0, name: "Verse, part 2" },
      ]);
    });
  });

  describe("delete and rename", () => {
    it("deletes every locator the call names", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE_DROP);

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorTime: "1|1,9|1",
      });

      expect(result.locator).toStrictEqual([
        { operation: "delete", id: "26" },
        { operation: "delete", id: "28" },
      ]);
      expect(set.locators()).toStrictEqual([{ time: 16, name: "Verse" }]);
    });

    it("deletes by each name the call lists", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE_DROP);

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorName: "Intro,Drop",
      });

      expect(result.locator).toStrictEqual([
        { operation: "delete", count: 1, name: "Intro" },
        { operation: "delete", count: 1, name: "Drop" },
      ]);
      expect(set.locators()).toStrictEqual([{ time: 16, name: "Verse" }]);
    });

    it("renames each locator to its own name", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE);

      const result = await renameBothLocators();

      expect(result.locator).toStrictEqual([
        { operation: "rename", id: "26" },
        { operation: "rename", id: "27" },
      ]);
      expect(set.locators()).toStrictEqual([
        { time: 0, name: "Head" },
        { time: 16, name: "Chorus" },
      ]);
    });
  });

  describe("refusals", () => {
    it("refuses lists that name different numbers of locators", async () => {
      const set = simulateLocators(liveSet);

      await expect(
        updateLiveSet({
          locatorOperation: "create",
          locatorTime: "1|1,5|1,9|1",
          locatorName: "Intro,Verse",
        }),
      ).rejects.toThrow(
        "locatorTime names 3 locators but locatorName names 2 locators",
      );

      // Refused before anything was written.
      expect(set.locators()).toStrictEqual([]);
    });

    it("refuses a list with a hole in it", async () => {
      const set = simulateLocators(liveSet);

      await expect(
        updateLiveSet({
          locatorOperation: "create",
          locatorTime: "1|1,,9|1",
        }),
      ).rejects.toThrow("it has an empty entry");

      expect(set.locators()).toStrictEqual([]);
    });

    it("refuses a mismatch before the tempo is written", async () => {
      simulateLocators(liveSet);

      await expect(
        updateLiveSet({
          tempo: 100,
          locatorOperation: "rename",
          locatorId: "26,27",
          locatorName: "Head,Chorus,Drop",
        }),
      ).rejects.toThrow("locatorId names 2 locators");

      expect(liveSet.set).not.toHaveBeenCalledWith("tempo", 100);
    });
  });

  describe("partial completion", () => {
    it("refuses an unreadable time before creating any", async () => {
      const set = simulateLocators(liveSet);

      await expect(
        updateLiveSet({
          locatorOperation: "create",
          locatorTime: "1|1,nope,9|1",
          locatorName: "Intro,Verse,Drop",
        }),
      ).rejects.toThrow('Invalid bar|beat format: "nope"');
      expect(set.locators()).toStrictEqual([]);
    });

    it("refuses an unreadable time before a new meter is written", async () => {
      simulateLocators(liveSet);

      await expect(
        updateLiveSet({
          timeSignature: "6/8",
          locatorOperation: "create",
          locatorTime: "nope",
        }),
      ).rejects.toThrow('Invalid bar|beat format: "nope"');
      expect(liveSet.set).not.toHaveBeenCalledWith("signature_numerator", 6);
    });

    it("refuses an unreadable time before the tempo or any delete", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE);

      await expect(
        updateLiveSet({
          tempo: 100,
          locatorOperation: "delete",
          locatorId: "26",
          locatorTime: "nope",
        }),
      ).rejects.toThrow('Invalid bar|beat format: "nope"');
      expect(liveSet.set).not.toHaveBeenCalledWith("tempo", 100);
      expect(set.locators()).toStrictEqual(INTRO_VERSE);
    });

    it("throws when the only locator named can't be created", async () => {
      simulateLocators(liveSet);

      await expect(
        updateLiveSet({ locatorOperation: "create", locatorTime: "nope" }),
      ).rejects.toThrow("nope");
    });

    it("reports a locator Live wouldn't rename", async () => {
      simulateLocators(liveSet, INTRO_VERSE);

      const second = lookupMockObject(undefined, livePath.cuePoint(1));

      second?.set.mockImplementation(() => {
        throw new Error("Live refused the write");
      });

      const result = await renameBothLocators();

      expect(result.locator).toStrictEqual([
        { operation: "rename", id: "26" },
        {
          operation: "skipped",
          id: "27",
          name: "Chorus",
          ok: false,
          detail: "Live refused the write",
        },
      ]);
    });

    it("reports a locator that wasn't there beside one that was", async () => {
      simulateLocators(liveSet, [{ time: 0, name: "Intro" }]);

      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "26,99",
        locatorName: "Head,Tail",
      });

      expect(result.locator).toStrictEqual([
        { operation: "rename", id: "26" },
        {
          operation: "skipped",
          ok: false,
          detail: 'no locator with id "99"',
          id: "99",
        },
      ]);
    });
  });
});

// locatorId and locatorTime form one target list, ids first; on delete each
// name is a target too. A locator named twice is acted on once.
describe("updateLiveSet - locator targets", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerMockObject("live_set_id", { path: "live_set" });
  });

  /**
   * How many times the call toggled a cue.
   * @returns The set_or_delete_cue call count
   */
  function cueToggles(): number {
    return liveSet.call.mock.calls.filter((c) => c[0] === "set_or_delete_cue")
      .length;
  }

  describe("delete by a name with a comma in it", () => {
    it("deletes the locator named the whole value", async () => {
      const set = simulateLocators(liveSet, [
        { time: 0, name: "Verse, part 2" },
        { time: 16, name: "Verse" },
        { time: 32, name: "part 2" },
      ]);

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorName: "Verse, part 2",
      });

      expect(result.locator).toStrictEqual({
        operation: "delete",
        count: 1,
        name: "Verse, part 2",
      });
      expect(set.locators()).toStrictEqual([
        { time: 16, name: "Verse" },
        { time: 32, name: "part 2" },
      ]);
    });

    it("splits the value when no locator has the whole name", async () => {
      const set = simulateLocators(liveSet, [
        { time: 0, name: "Verse" },
        { time: 16, name: "Chorus" },
        { time: 32, name: "Verse" },
      ]);

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorName: "Verse, Chorus",
      });

      expect(result.locator).toStrictEqual([
        { operation: "delete", count: 2, name: "Verse" },
        { operation: "delete", count: 1, name: "Chorus" },
      ]);
      expect(set.locators()).toStrictEqual([]);
    });
  });

  describe("delete by ids, times and names together", () => {
    it("deletes each id, then each time, then each name", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE_DROP);

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorId: "27",
        locatorTime: "1|1",
        locatorName: "Drop",
      });

      expect(result.locator).toStrictEqual([
        { operation: "delete", id: "27" },
        { operation: "delete", id: "26" },
        { operation: "delete", count: 1, name: "Drop" },
      ]);
      expect(set.locators()).toStrictEqual([]);
    });

    it("doesn't spread one id across a time list", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE_DROP);

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorId: "27",
        locatorTime: "1|1,9|1",
      });

      expect(result.locator).toStrictEqual([
        { operation: "delete", id: "27" },
        { operation: "delete", id: "26" },
        { operation: "delete", id: "28" },
      ]);
      expect(set.locators()).toStrictEqual([]);
    });

    it("deletes a locator named by id and time once", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE_DROP);

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorId: "26",
        locatorTime: "1|1",
      });

      expect(result.locator).toStrictEqual([
        {
          operation: "delete",
          id: "26",
          detail: 'named again as "1|1" later in this call',
        },
        { operation: "delete", id: "26" },
      ]);
      // A second toggle at 1|1 would have created a new locator there.
      expect(cueToggles()).toBe(1);
      expect(set.locators()).toStrictEqual(INTRO_VERSE_DROP.slice(1));
    });

    it("deletes a time named twice once", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE_DROP);

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorTime: "1|1,1|1",
      });

      expect(result.locator).toStrictEqual([
        {
          operation: "delete",
          id: "26",
          detail: 'named again as "1|1" later in this call',
        },
        { operation: "delete", id: "26" },
      ]);
      expect(cueToggles()).toBe(1);
      expect(set.locators()).toStrictEqual(INTRO_VERSE_DROP.slice(1));
    });

    it("points an id at the name that deletes it", async () => {
      simulateLocators(liveSet, INTRO_VERSE_DROP);

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorId: "27",
        locatorName: "Verse",
      });

      expect(result.locator).toStrictEqual([
        {
          operation: "delete",
          id: "27",
          detail: 'named again as "Verse" later in this call',
        },
        { operation: "delete", count: 1, name: "Verse" },
      ]);
      expect(cueToggles()).toBe(1);
    });

    it("points a repeated name at the entry that deletes it", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE_DROP);

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorName: "Verse,Verse",
      });

      expect(result.locator).toStrictEqual([
        {
          operation: "delete",
          name: "Verse",
          detail: 'named again as "Verse" later in this call',
        },
        { operation: "delete", count: 1, name: "Verse" },
      ]);
      expect(cueToggles()).toBe(1);
      expect(set.locators()).toStrictEqual([
        { time: 0, name: "Intro" },
        { time: 32, name: "Drop" },
      ]);
    });

    it("deletes every locator of a name, one of them named by id too", async () => {
      const set = simulateLocators(liveSet, [
        { time: 0, name: "Verse" },
        { time: 16, name: "Chorus" },
        { time: 32, name: "Verse" },
      ]);

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorId: "26",
        locatorName: "Verse",
      });

      expect(result.locator).toStrictEqual([
        {
          operation: "delete",
          id: "26",
          detail: 'named again as "Verse" later in this call',
        },
        { operation: "delete", count: 2, name: "Verse" },
      ]);
      expect(cueToggles()).toBe(2);
      expect(set.locators()).toStrictEqual([{ time: 16, name: "Chorus" }]);
    });

    it("reads a time in the song's meter", async () => {
      // Bar 2 of 6/8 is 3 beats in; read as 8/6 it would be 5.33.
      const set = simulateLocators(
        liveSet,
        [
          { time: 0, name: "A" },
          { time: 3, name: "B" },
        ],
        { meter: [6, 8] },
      );

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorTime: "2|1",
      });

      expect(result.locator).toStrictEqual({ operation: "delete", id: "27" });
      expect(set.locators()).toStrictEqual([{ time: 0, name: "A" }]);
    });

    it("says which target in a list named nothing", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE_DROP);

      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorId: "26,99",
        locatorTime: "20|1",
        locatorName: "Outro",
      });

      expect(result.locator).toStrictEqual([
        { operation: "delete", id: "26" },
        {
          operation: "skipped",
          detail: 'nothing to delete: no locator with id "99"',
          id: "99",
        },
        {
          operation: "skipped",
          detail: "nothing to delete: no locator at 20|1",
          time: "20|1",
        },
        {
          operation: "skipped",
          detail: 'nothing to delete: no locator named "Outro"',
          name: "Outro",
        },
      ]);
      expect(set.locators()).toStrictEqual(INTRO_VERSE_DROP.slice(1));
    });
  });

  describe("rename by ids and times together", () => {
    it("pairs each name with ids first, then times", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE_DROP);

      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "27",
        locatorTime: "1|1,9|1",
        locatorName: "B,A,C",
      });

      expect(result.locator).toStrictEqual([
        { operation: "rename", id: "27" },
        { operation: "rename", id: "26" },
        { operation: "rename", id: "28" },
      ]);
      expect(set.locators().map((locator) => locator.name)).toStrictEqual([
        "A",
        "B",
        "C",
      ]);
    });

    it("gives every target the one name it was sent", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE_DROP);

      await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "26",
        locatorTime: "9|1",
        locatorName: "Same",
      });

      expect(set.locators().map((locator) => locator.name)).toStrictEqual([
        "Same",
        "Verse",
        "Same",
      ]);
    });

    it("refuses a name list that doesn't match the targets", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE_DROP);

      await expect(
        updateLiveSet({
          locatorOperation: "rename",
          locatorId: "26",
          locatorTime: "5|1,9|1",
          locatorName: "A,B",
        }),
      ).rejects.toThrow(
        "locatorId and locatorTime names 3 locators but locatorName names 2 locators",
      );
      expect(set.locators()).toStrictEqual(INTRO_VERSE_DROP);
    });

    it("keeps a comma in the name when the call names one locator", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE_DROP);

      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "26",
        locatorName: "A,B",
      });

      expect(result.locator).toStrictEqual({ operation: "rename", id: "26" });
      expect(set.locators()[0]).toStrictEqual({ time: 0, name: "A,B" });
    });

    it("renames a locator named by id and time once", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE_DROP);

      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "26",
        locatorTime: "1|1",
        locatorName: "A,B",
      });

      expect(result.locator).toStrictEqual([
        {
          operation: "rename",
          id: "26",
          detail: 'named again as "1|1" later in this call',
        },
        { operation: "rename", id: "26" },
      ]);
      expect(set.locators()[0]).toStrictEqual({ time: 0, name: "B" });
    });

    it("says which target in a list found no locator", async () => {
      simulateLocators(liveSet, INTRO_VERSE_DROP);

      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "26",
        locatorTime: "20|1",
        locatorName: "New",
      });

      expect(result.locator).toStrictEqual([
        { operation: "rename", id: "26" },
        {
          operation: "skipped",
          ok: false,
          detail: "no locator at 20|1",
          time: "20|1",
        },
      ]);
    });
  });

  describe("create", () => {
    it("creates a time named twice once", async () => {
      const set = simulateLocators(liveSet);

      const result = await updateLiveSet({
        locatorOperation: "create",
        locatorTime: "1|1,1|1",
        locatorName: "A,B",
      });

      expect(result.locator).toStrictEqual([
        {
          operation: "create",
          time: "1|1",
          detail: 'named again as "1|1" later in this call',
        },
        { operation: "create", id: "26" },
      ]);
      expect(cueToggles()).toBe(1);
      expect(set.locators()).toStrictEqual([{ time: 0, name: "B" }]);
    });
  });
});

/**
 * Rename both locators in one call: the first to Head, the second to Chorus.
 * @returns What the rename reported
 */
async function renameBothLocators(): Promise<
  Awaited<ReturnType<typeof updateLiveSet>>
> {
  return await updateLiveSet({
    locatorOperation: "rename",
    locatorId: "26,27",
    locatorName: "Head,Chorus",
  });
}
