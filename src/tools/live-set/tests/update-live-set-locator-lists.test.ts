// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateLiveSet } from "#src/tools/live-set/update-live-set.ts";

/** Locators the list tests start from. */
const INTRO_VERSE = [
  { time: 0, name: "Intro" },
  { time: 16, name: "Verse" },
];

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
        { operation: "created", time: "1|1", name: "Intro", id: "locator-0" },
        { operation: "created", time: "5|1", name: "Verse", id: "locator-1" },
        { operation: "created", time: "9|1", name: "Drop", id: "locator-2" },
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
        operation: "created",
        time: "1|1",
        name: "Verse, part 2",
        id: "locator-0",
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
        { operation: "deleted", time: "1|1" },
        { operation: "deleted", time: "9|1" },
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
        { operation: "deleted", count: 1, name: "Intro" },
        { operation: "deleted", count: 1, name: "Drop" },
      ]);
      expect(set.locators()).toStrictEqual([{ time: 16, name: "Verse" }]);
    });

    it("renames each locator to its own name", async () => {
      const set = simulateLocators(liveSet, INTRO_VERSE);

      const result = await renameBothLocators();

      expect(result.locator).toStrictEqual([
        { operation: "renamed", id: "locator-0", name: "Head" },
        { operation: "renamed", id: "locator-1", name: "Chorus" },
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
          locatorId: "locator-0,locator-1",
          locatorName: "Head,Chorus,Drop",
        }),
      ).rejects.toThrow("locatorId names 2 locators");

      expect(liveSet.set).not.toHaveBeenCalledWith("tempo", 100);
    });
  });

  describe("partial completion", () => {
    it("keeps going past a locator it can't create", async () => {
      const set = simulateLocators(liveSet);

      const result = await updateLiveSet({
        locatorOperation: "create",
        locatorTime: "1|1,nope,9|1",
        locatorName: "Intro,Verse,Drop",
      });

      const entries = result.locator as Array<Record<string, unknown>>;

      expect(entries[0]).toStrictEqual({
        operation: "created",
        time: "1|1",
        name: "Intro",
        id: "locator-0",
      });
      // The skip carries every spelling the caller wrote, so they can tell
      // which section it was.
      expect(entries[1]).toStrictEqual({
        operation: "skipped",
        time: "nope",
        name: "Verse",
        ok: false,
        reason: expect.stringContaining('Invalid bar|beat format: "nope"'),
      });
      expect(entries[2]).toStrictEqual({
        operation: "created",
        time: "9|1",
        name: "Drop",
        id: "locator-1",
      });
      expect(set.locators()).toStrictEqual([
        { time: 0, name: "Intro" },
        { time: 32, name: "Drop" },
      ]);
    });

    it("throws when the only locator named can't be created", async () => {
      simulateLocators(liveSet);

      await expect(
        updateLiveSet({ locatorOperation: "create", locatorTime: "nope" }),
      ).rejects.toThrow("nope");
    });

    it("names an unnamed locator by its position alone", async () => {
      simulateLocators(liveSet);

      const result = await updateLiveSet({
        locatorOperation: "create",
        locatorTime: "1|1,nope",
      });

      expect(
        (result.locator as Array<Record<string, unknown>>)[1],
      ).toStrictEqual({
        operation: "skipped",
        time: "nope",
        ok: false,
        reason: expect.stringContaining('Invalid bar|beat format: "nope"'),
      });
    });

    it("reports a locator Live wouldn't rename", async () => {
      simulateLocators(liveSet, INTRO_VERSE);

      const second = lookupMockObject(undefined, livePath.cuePoint(1));

      second?.set.mockImplementation(() => {
        throw new Error("Live refused the write");
      });

      const result = await renameBothLocators();

      expect(result.locator).toStrictEqual([
        { operation: "renamed", id: "locator-0", name: "Head" },
        {
          operation: "skipped",
          id: "locator-1",
          name: "Chorus",
          ok: false,
          reason: "Live refused the write",
        },
      ]);
    });

    it("reports a locator that wasn't there beside one that was", async () => {
      simulateLocators(liveSet, [{ time: 0, name: "Intro" }]);

      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "locator-0,locator-7",
        locatorName: "Head,Tail",
      });

      expect(result.locator).toStrictEqual([
        { operation: "renamed", id: "locator-0", name: "Head" },
        {
          operation: "skipped",
          ok: false,
          reason: 'no locator with id "locator-7"',
          id: "locator-7",
        },
      ]);
    });
  });
});

interface SimulatedLocator {
  time: number;
  name: string;
}

/**
 * A live_set whose cue points really come and go, so a call that creates or
 * deletes several locators reads back what the earlier ones did.
 * @param liveSetHandle - The live_set mock object handle
 * @param initial - Locators already in the Set, in time order
 * @returns A reader for the locators the Set holds now
 */
function simulateLocators(
  liveSetHandle: RegisteredMockObject,
  initial: SimulatedLocator[] = [],
): { locators: () => SimulatedLocator[] } {
  const cues: Array<{ id: string; properties: Record<string, unknown> }> = [];
  let playhead = 0;
  let nextId = 0;

  const register = (): void => {
    for (const [index, cue] of cues.entries()) {
      const handle = registerMockObject(cue.id, {
        path: livePath.cuePoint(index),
        properties: cue.properties,
      });

      // The default set mock only stores numbers, so a name write needs this to
      // read back.
      handle.set.mockImplementation((property: string, value: unknown) => {
        cue.properties[property] = value;
      });
    }
  };

  const addCue = (time: number, name: string): void => {
    cues.push({ id: `cue-${nextId++}`, properties: { time, name } });
    cues.sort(
      (a, b) => (a.properties.time as number) - (b.properties.time as number),
    );
    register();
  };

  for (const locator of initial) {
    addCue(locator.time, locator.name);
  }

  liveSetHandle.get.mockImplementation((prop: string) => {
    switch (prop) {
      case "signature_numerator":
      case "signature_denominator":
        return [4];
      case "song_length":
        return [1000];
      case "current_song_time":
        return [playhead];
      case "cue_points":
        return children(...cues.map((cue) => cue.id));
      default:
        return [0];
    }
  });

  liveSetHandle.set.mockImplementation((prop: string, value: unknown) => {
    if (prop === "current_song_time") {
      playhead = value as number;
    }
  });

  // set_or_delete_cue toggles a locator at the playhead, the way Live does.
  liveSetHandle.call.mockImplementation((method: string) => {
    if (method !== "set_or_delete_cue") {
      return;
    }

    const index = cues.findIndex((cue) => cue.properties.time === playhead);

    if (index === -1) {
      addCue(playhead, "");
    } else {
      cues.splice(index, 1);
      register();
    }
  });

  return {
    locators: () =>
      cues.map((cue) => ({
        time: cue.properties.time as number,
        name: cue.properties.name as string,
      })),
  };
}

/**
 * Rename both locators in one call: locator-0 to Head, locator-1 to Chorus.
 * @returns What the rename reported
 */
async function renameBothLocators(): Promise<
  Awaited<ReturnType<typeof updateLiveSet>>
> {
  return await updateLiveSet({
    locatorOperation: "rename",
    locatorId: "locator-0,locator-1",
    locatorName: "Head,Chorus",
  });
}
