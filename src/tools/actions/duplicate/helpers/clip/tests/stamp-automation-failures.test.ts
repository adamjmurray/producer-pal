// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live can fail, or the request can run out of time, with the lane already
// changed. The clip is still placed when it can be, the scratch copy and its
// scene are always removed, and the entry says what the lane got.

import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../tests/duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { lookupMockObject } from "#src/test/mocks/mock-registry.ts";
import { createShortenedClipInHoldingMock } from "../../../tests/setup.ts";
import {
  copyAtLength,
  LANE_WRITE_NOTE,
} from "./stamp-automation-test-helpers.ts";
import {
  registerStampWorld,
  type StampWorld,
} from "./stamp-world-test-helpers.ts";

/**
 * @param world - The Set
 * @returns Whether a scratch clip or scene is left in it
 */
function leftBehind(world: StampWorld): boolean {
  const slotCleared = world.events.some(
    (event) => event.kind === "slot-cleared",
  );

  return !slotCleared || world.sceneCount() !== 1;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("stamping that stops partway", () => {
  it("still places the clip, and says how far the lane got, when a stamp is declined", async () => {
    const world = registerStampWorld();

    world.declinesCopy = (count) => count === 1;

    const clips = await copyAtLength(world, 10);

    expect(clips).toHaveLength(1);
    expect(clips[0]?.detail).toBe(
      "automation written for the first 4 of 10 beats only (Live made no copy at 20 beats)",
    );
    expect(leftBehind(world)).toBe(false);
  });

  it("says so when a stamp throws", async () => {
    const world = registerStampWorld();

    world.beforeCopy = (count) => {
      if (count === 2) {
        throw new Error("Live says no");
      }
    };

    const clips = await copyAtLength(world, 10);

    expect(clips[0]?.detail).toBe(
      "automation written for the first 8 of 10 beats only (Live says no)",
    );
    expect(leftBehind(world)).toBe(false);
  });

  it("says so when a marker write throws, before any stamp is taken", async () => {
    const world = registerStampWorld({ source: { start_marker: 1 } });

    world.beforeSet = () => {
      throw new Error("Live says no");
    };

    const clips = await copyAtLength(world, 10);

    expect(clips[0]?.detail).toBe("automation not written (Live says no)");
    expect(world.copies().filter((copy) => copy.envelopes)).toHaveLength(0);
    expect(leftBehind(world)).toBe(false);
  });

  it("says so when a marker write throws after the first stamp", async () => {
    const world = registerStampWorld({ source: { start_marker: 1 } });
    let stamps = 0;

    world.beforeCopy = () => {
      stamps++;
    };

    world.beforeSet = () => {
      if (stamps > 0) {
        throw new Error("Live says no");
      }
    };

    const clips = await copyAtLength(world, 10);

    expect(clips[0]?.detail).toBe(
      "automation written for the first 3 of 10 beats only (Live says no)",
    );
    expect(leftBehind(world)).toBe(false);
  });

  it("says a stamp copy it couldn't delete, which the clip's copy then covers", async () => {
    const world = registerStampWorld();

    world.beforeDelete = (count) => {
      if (count === 0) {
        throw new Error("Live says no");
      }
    };

    const clips = await copyAtLength(world, 10);

    expect(clips[0]?.detail).toBe(
      "automation written for the first 4 of 10 beats only (couldn't delete a scratch copy at 16 beats (Live says no))",
    );
    expect(leftBehind(world)).toBe(false);
  });

  it("writes none of the lane when the deadline has passed before the first stamp", async () => {
    const world = registerStampWorld();

    const clips = await copyAtLength(world, 10, { deadline: Date.now() - 1 });

    expect(clips[0]?.detail).toBe("automation not written (ran out of time)");
    expect(world.stamps().filter((stamp) => stamp.envelopes)).toHaveLength(0);
    expect(leftBehind(world)).toBe(false);
  });

  it("stops at the deadline between stamps, and says how far it got", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const world = registerStampWorld();

    world.beforeDelete = (count) => {
      if (count === 0) {
        vi.setSystemTime(2000);
      }
    };

    const clips = await copyAtLength(world, 10, { deadline: 1000 });

    expect(clips[0]?.detail).toBe(
      "automation written for the first 4 of 10 beats only (ran out of time)",
    );
    expect(world.stamps()).toHaveLength(1);
    expect(leftBehind(world)).toBe(false);
  });
});

describe("a failure after the lane changed", () => {
  it("refuses with nothing changed when Live makes no scratch copy", async () => {
    const world = registerStampWorld();

    world.declinesSlotCopy = () => true;

    await expect(copyAtLength(world, 10)).rejects.toThrow(
      "Live made no scratch copy of the clip, so its automation can't be carried over",
    );
    expect(world.copies()).toHaveLength(0);
    expect(world.sceneCount()).toBe(1);
  });

  it("says what changed when the second scratch copy fails", async () => {
    const world = registerStampWorld();

    world.declinesSlotCopy = (count) => count === 1;

    await expect(copyAtLength(world, 10)).rejects.toThrow(
      "Live made no scratch copy of the clip, so its automation can't be carried over; already changed: automation written for all 10 beats",
    );
    expect(leftBehind(world)).toBe(false);
  });

  it("says what changed when the envelopes can't be cleared", async () => {
    const world = registerStampWorld();

    world.beforeClear = () => {
      throw new Error("Live says no");
    };

    await expect(copyAtLength(world, 6)).rejects.toThrow(
      "Live says no; already changed: automation written for all 6 beats",
    );
    expect(leftBehind(world)).toBe(false);
  });

  it("says what changed when placing the clip throws", async () => {
    const world = registerStampWorld();

    createShortenedClipInHoldingMock.mockImplementationOnce(() => {
      throw new Error("holding says no");
    });

    await expect(copyAtLength(world, 3)).rejects.toThrow(
      "holding says no; already changed: automation written for all 3 beats",
    );
    expect(leftBehind(world)).toBe(false);
  });

  it("says what changed when Live makes no copy of the clip", async () => {
    const world = registerStampWorld();

    // Three stamps, then the clip's own copy.
    world.declinesCopy = (count) => count === 3;

    await expect(copyAtLength(world, 10)).rejects.toThrow(
      "Live made no copy there; already changed: automation written for all 10 beats",
    );
    expect(leftBehind(world)).toBe(false);
  });

  it("includes a partial stamping in the failure", async () => {
    const world = registerStampWorld();

    world.declinesCopy = (count) => count === 1 || count === 2;

    await expect(copyAtLength(world, 10)).rejects.toThrow(
      "Live made no copy there; already changed: automation written for the first 4 of 10 beats only (Live made no copy at 20 beats)",
    );
  });
});

describe("a scratch copy Live won't remove", () => {
  it("says so on the clip's entry, and still removes the scene", async () => {
    const world = registerStampWorld();

    world.beforeSlotClear = () => {
      throw new Error("Live says no");
    };

    const clips = await copyAtLength(world, 10);

    expect(clips[0]?.detail).toBe(
      `${LANE_WRITE_NOTE}; couldn't remove the scratch session clip (Live says no)`,
    );
    expect(world.sceneCount()).toBe(1);
  });

  it("says so when the scene stays, and goes on", async () => {
    const world = registerStampWorld();
    const liveSet = lookupMockObject(undefined, livePath.liveSet);

    (liveSet as { methods: Record<string, () => void> }).methods.delete_scene =
      () => {
        throw new Error("Live says no");
      };

    const clips = await copyAtLength(world, 10);

    expect(clips[0]?.detail).toBe(
      `${LANE_WRITE_NOTE}; left an empty scene behind: couldn't remove the scratch scene (Live says no)`,
    );
  });

  it("hands it to the caller's reporter instead, when it has one", async () => {
    const world = registerStampWorld();
    const said: string[] = [];

    world.beforeSlotClear = () => {
      throw new Error("Live says no");
    };

    const clips = await copyAtLength(world, 10, {
      reportScratch: (message: string) => said.push(message),
    });

    expect(said).toStrictEqual([
      "couldn't remove the scratch session clip (Live says no)",
    ]);
    expect(clips[0]?.detail).toBe(LANE_WRITE_NOTE);
  });

  it("keeps it on a failure that follows", async () => {
    const world = registerStampWorld();

    world.beforeSlotClear = () => {
      throw new Error("Live says no");
    };

    world.declinesSlotCopy = (count) => count === 1;

    await expect(copyAtLength(world, 10)).rejects.toThrow(
      "already changed: automation written for all 10 beats; couldn't remove the scratch session clip (Live says no)",
    );
  });
});

describe("a failure while finding the scratch slot", () => {
  /** Live fails the first read of the scenes after a scene is made. */
  function failAfterSceneMade(): void {
    const liveSet = lookupMockObject(undefined, livePath.liveSet);
    const makeScene = liveSet!.methods.create_scene as (
      index: unknown,
    ) => unknown;

    liveSet!.methods.create_scene = (index) => {
      const made = makeScene(index);

      liveSet!.get.mockImplementationOnce(() => {
        throw new Error("Live says no");
      });

      return made;
    };
  }

  it("removes the scene it made before the failure goes on", async () => {
    const world = registerStampWorld();

    failAfterSceneMade();

    await expect(copyAtLength(world, 10)).rejects.toThrow("Live says no");
    expect(world.sceneCount()).toBe(1);
  });

  it("says a scene it couldn't remove in the failure", async () => {
    const world = registerStampWorld();

    failAfterSceneMade();

    const liveSet = lookupMockObject(undefined, livePath.liveSet);

    liveSet!.methods.delete_scene = () => {
      throw new Error("Live says no more");
    };

    await expect(copyAtLength(world, 10)).rejects.toThrow(
      "left an empty scene behind: couldn't remove the scratch scene (Live says no more)",
    );
  });
});
