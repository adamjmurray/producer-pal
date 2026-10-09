// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { hookCalls } from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { simulateLocators } from "#src/tools/live-set/tests/update-live-set-test-helpers.ts";
import { updateLiveSet } from "#src/tools/live-set/update-live-set.ts";

/** Bars 1 and 5 */
const LOCATORS = [
  { time: 0, name: "A" },
  { time: 16, name: "B" },
];

/** Beat 8 (bar 3): no locator is there, and no test edits one there. */
const PLAYHEAD = 8;

/** Beat 6 (bar 2, beat 3): where a Set that was playing started from. */
const START = 6;

/**
 * The positions the start marker was sent to.
 * @param liveSet - The live_set mock
 * @returns The values written to start_time, in order
 */
function startTimeWrites(liveSet: RegisteredMockObject): unknown[] {
  return liveSet.set.mock.calls
    .filter(([property]) => property === "start_time")
    .map(([, value]) => value);
}

/**
 * The positions the playhead was sent to.
 * @param liveSet - The live_set mock
 * @returns The values written to current_song_time, in order
 */
function playheadWrites(liveSet: RegisteredMockObject): unknown[] {
  return liveSet.set.mock.calls
    .filter(([property]) => property === "current_song_time")
    .map(([, value]) => value);
}

describe("the playhead after locator edits", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerMockObject("live_set_id", { path: "live_set" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is back after a create", async () => {
    const set = simulateLocators(liveSet, [], { playhead: PLAYHEAD });

    await updateLiveSet({ locatorOperation: "create", locatorTime: "5|1" });

    expect(set.locators()).toStrictEqual([{ time: 16, name: "" }]);
    expect(set.playhead()).toBe(PLAYHEAD);
  });

  it("is back after a delete", async () => {
    const set = simulateLocators(liveSet, LOCATORS, { playhead: PLAYHEAD });

    await updateLiveSet({ locatorOperation: "delete", locatorTime: "5|1" });

    expect(set.locators()).toStrictEqual([{ time: 0, name: "A" }]);
    expect(set.playhead()).toBe(PLAYHEAD);
  });

  it("is back after several locators, put back once", async () => {
    const set = simulateLocators(liveSet, [], { playhead: PLAYHEAD });

    await updateLiveSet({
      locatorOperation: "create",
      locatorTime: "1|1,5|1,9|1",
    });

    expect(set.locators()).toHaveLength(3);
    expect(set.playhead()).toBe(PLAYHEAD);
    expect(playheadWrites(liveSet)).toStrictEqual([0, 16, 32, PLAYHEAD]);
  });

  it("is back after a delete by name", async () => {
    const set = simulateLocators(
      liveSet,
      [
        { time: 0, name: "A" },
        { time: 16, name: "A" },
      ],
      { playhead: PLAYHEAD },
    );

    await updateLiveSet({ locatorOperation: "delete", locatorName: "A" });

    expect(set.locators()).toStrictEqual([]);
    expect(set.playhead()).toBe(PLAYHEAD);
  });

  it("is back after a lone call that throws", async () => {
    const set = simulateLocators(liveSet, [], {
      playhead: PLAYHEAD,
      noCueAt: 16,
    });

    await expect(
      updateLiveSet({ locatorOperation: "create", locatorTime: "5|1" }),
    ).rejects.toThrow("Live made no locator at 5|1");
    expect(set.playhead()).toBe(PLAYHEAD);
  });

  it("is back when the playhead stalled on one of the locators", async () => {
    const set = simulateLocators(liveSet, [], {
      playhead: PLAYHEAD,
      stallAt: 16,
    });

    await updateLiveSet({
      locatorOperation: "create",
      locatorTime: "1|1,5|1",
    });

    expect(set.playhead()).toBe(PLAYHEAD);
  });

  it("is back when the deadline skips the rest", async () => {
    const start = 1_000_000;
    let now = start;

    vi.spyOn(Date, "now").mockImplementation(() => now);

    const set = simulateLocators(liveSet, [], { playhead: PLAYHEAD });

    hookCalls(liveSet, /^set_or_delete_cue$/, {
      after: () => {
        now = start + 5000;
      },
    });

    await updateLiveSet(
      { locatorOperation: "create", locatorTime: "1|1,5|1,9|1" },
      { deadline: start + 1000 },
    );

    expect(set.locators()).toHaveLength(1);
    expect(set.playhead()).toBe(PLAYHEAD);
  });

  it("is put back after playback was stopped, which stays stopped", async () => {
    const set = simulateLocators(liveSet, [], {
      playhead: PLAYHEAD,
      playing: true,
    });

    await updateLiveSet({ locatorOperation: "create", locatorTime: "5|1" });

    expect(liveSet.call).toHaveBeenCalledWith("stop_playing");
    expect(capturedWarnings()).toStrictEqual([
      "Playback stopped to modify locators",
    ]);
    expect(set.playhead()).toBe(PLAYHEAD);
  });

  it("is left alone by a create where a locator already is", async () => {
    simulateLocators(liveSet, LOCATORS, { playhead: PLAYHEAD, playing: true });

    await updateLiveSet({ locatorOperation: "create", locatorTime: "5|1" });

    // Playing, and nothing moved it: writing the old spot would make it jump.
    expect(playheadWrites(liveSet)).toStrictEqual([]);
    expect(liveSet.call).not.toHaveBeenCalledWith("stop_playing");
  });

  it("is not written over a Set that started playing again", async () => {
    const set = simulateLocators(liveSet, [], { playhead: PLAYHEAD });

    const read = liveSet.get.getMockImplementation() as (
      property: string,
    ) => unknown[];
    let running = false;

    liveSet.get.mockImplementation((property: string) => {
      if (running && property === "is_playing") {
        return [1];
      }

      return running && property === "current_song_time"
        ? [40]
        : read(property);
    });
    // Playback restarts and runs on before the call's edits are over.
    hookCalls(liveSet, /^set_or_delete_cue$/, {
      after: () => {
        running = true;
      },
    });

    await updateLiveSet({ locatorOperation: "create", locatorTime: "5|1" });

    expect(set.locators()).toHaveLength(1);
    expect(playheadWrites(liveSet)).toStrictEqual([16]);
    expect(startTimeWrites(liveSet)).toStrictEqual([]);
  });

  it("is left alone by a rename", async () => {
    simulateLocators(liveSet, LOCATORS, { playhead: PLAYHEAD });

    await updateLiveSet({
      locatorOperation: "rename",
      locatorTime: "5|1",
      locatorName: "C",
    });

    expect(playheadWrites(liveSet)).toStrictEqual([]);
  });

  it("is left alone by a call with no locator work", async () => {
    simulateLocators(liveSet, LOCATORS, { playhead: PLAYHEAD });

    await updateLiveSet({ tempo: 140 });

    expect(playheadWrites(liveSet)).toStrictEqual([]);
  });
});

describe("the start marker after locator edits", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerMockObject("live_set_id", { path: "live_set" });
  });

  it("is put back after playback was stopped to edit", async () => {
    const set = simulateLocators(liveSet, [], {
      playhead: PLAYHEAD,
      playing: true,
      startTime: START,
    });

    await updateLiveSet({ locatorOperation: "create", locatorTime: "5|1" });

    expect(set.playhead()).toBe(PLAYHEAD);
    expect(set.startTime()).toBe(START);
    // After the playhead, which dragged it along.
    expect(startTimeWrites(liveSet)).toStrictEqual([START]);
    expect(capturedWarnings()).toStrictEqual([
      "Playback stopped to modify locators",
    ]);
  });

  it("is put back after a delete on a playing Set", async () => {
    const set = simulateLocators(liveSet, LOCATORS, {
      playhead: PLAYHEAD,
      playing: true,
      startTime: START,
    });

    await updateLiveSet({ locatorOperation: "delete", locatorTime: "5|1" });

    expect(set.locators()).toStrictEqual([{ time: 0, name: "A" }]);
    expect(set.startTime()).toBe(START);
  });

  it("is put back when the call throws", async () => {
    const set = simulateLocators(liveSet, [], {
      playhead: PLAYHEAD,
      playing: true,
      startTime: START,
      noCueAt: 16,
    });

    await expect(
      updateLiveSet({ locatorOperation: "create", locatorTime: "5|1" }),
    ).rejects.toThrow("Live made no locator at 5|1");
    expect(set.startTime()).toBe(START);
  });

  it("is not written on a stopped Set, where nothing drags it", async () => {
    const set = simulateLocators(liveSet, [], {
      playhead: PLAYHEAD,
      startTime: START,
    });

    await updateLiveSet({ locatorOperation: "create", locatorTime: "5|1" });

    expect(set.playhead()).toBe(PLAYHEAD);
    expect(set.startTime()).toBe(START);
    expect(startTimeWrites(liveSet)).toStrictEqual([]);
  });

  it("is not written over a rename", async () => {
    simulateLocators(liveSet, LOCATORS, { playing: true, startTime: START });

    await updateLiveSet({
      locatorOperation: "rename",
      locatorTime: "5|1",
      locatorName: "C",
    });

    expect(startTimeWrites(liveSet)).toStrictEqual([]);
  });

  it("warns when Live refuses the write, and the playhead is still put back", async () => {
    const set = simulateLocators(liveSet, [], {
      playhead: PLAYHEAD,
      playing: true,
      startTime: START,
    });
    const moveTo = liveSet.set.getMockImplementation() as (
      property: string,
      value: unknown,
    ) => void;

    liveSet.set.mockImplementation((property: string, value: unknown) => {
      if (property === "start_time") {
        throw new Error("Live refused the write");
      }

      moveTo(property, value);
    });

    const result = await updateLiveSet({
      locatorOperation: "create",
      locatorTime: "5|1",
    });

    expect(result.locator).toStrictEqual({ operation: "create", id: "26" });
    expect(set.playhead()).toBe(PLAYHEAD);
    expect(capturedWarnings()).toStrictEqual([
      "Playback stopped to modify locators",
      "Start marker not put back: Live refused the write",
    ]);
  });

  it("warns when Live never lands it, and still answers the call", async () => {
    simulateLocators(liveSet, [], {
      playhead: PLAYHEAD,
      playing: true,
      startTime: START,
    });
    const moveTo = liveSet.set.getMockImplementation() as (
      property: string,
      value: unknown,
    ) => void;

    liveSet.set.mockImplementation((property: string, value: unknown) => {
      if (property !== "start_time") {
        moveTo(property, value);
      }
    });

    const result = await updateLiveSet({
      locatorOperation: "create",
      locatorTime: "5|1",
    });

    expect(result.locator).toStrictEqual({ operation: "create", id: "26" });
    expect(capturedWarnings()).toStrictEqual([
      "Playback stopped to modify locators",
      "Start marker not put back at 2|3",
    ]);
  });
});

describe("when the playhead can't be put back", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerMockObject("live_set_id", { path: "live_set" });
  });

  it("warns, and still answers the call", async () => {
    // Live never lands the playhead on the spot it was sent back to.
    const set = simulateLocators(liveSet, [], {
      playhead: PLAYHEAD,
      stallAt: PLAYHEAD,
    });

    const result = await updateLiveSet({
      locatorOperation: "create",
      locatorTime: "5|1",
    });

    expect(result.locator).toStrictEqual({ operation: "create", id: "26" });
    expect(set.locators()).toStrictEqual([{ time: 16, name: "" }]);
    expect(capturedWarnings()).toStrictEqual(["Playhead not put back at 3|1"]);
  });

  it("warns when Live refuses the write, and still answers the call", async () => {
    const set = simulateLocators(liveSet, [], { playhead: PLAYHEAD });

    refuseSendingTo(PLAYHEAD);

    const result = await updateLiveSet({
      locatorOperation: "create",
      locatorTime: "5|1",
    });

    expect(result.locator).toStrictEqual({ operation: "create", id: "26" });
    expect(set.locators()).toStrictEqual([{ time: 16, name: "" }]);
    expect(capturedWarnings()).toStrictEqual([
      "Playhead not put back: Live refused the write",
    ]);
  });

  it("keeps the call's own error", async () => {
    simulateLocators(liveSet, [], { playhead: PLAYHEAD, noCueAt: 16 });
    refuseSendingTo(PLAYHEAD);

    await expect(
      updateLiveSet({ locatorOperation: "create", locatorTime: "5|1" }),
    ).rejects.toThrow("Live made no locator at 5|1");
    expect(capturedWarnings()).toStrictEqual([
      "Playhead not put back: Live refused the write",
    ]);
  });

  /**
   * Make Live refuse to move the playhead to a spot, and move it anywhere else.
   * @param beats - The spot
   */
  function refuseSendingTo(beats: number): void {
    const moveTo = liveSet.set.getMockImplementation() as (
      property: string,
      value: unknown,
    ) => void;

    liveSet.set.mockImplementation((property: string, value: unknown) => {
      if (value === beats) {
        throw new Error("Live refused the write");
      }

      moveTo(property, value);
    });
  }
});
