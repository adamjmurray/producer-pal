// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { simulateLocators } from "#src/tools/live-set/tests/update-live-set-test-helpers.ts";
import { updateLiveSet } from "#src/tools/live-set/update-live-set.ts";
import {
  stopPlaybackIfNeeded,
  waitForPlayheadPosition,
} from "../locator-updates.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

/** Ids 26 and 27 at bars 1 and 5. */
const LOCATORS = [
  { time: 0, name: "A" },
  { time: 16, name: "B" },
];

describe("stopPlaybackIfNeeded", () => {
  it("stops playback and warns when the set is playing", () => {
    const liveSet = registerMockObject("live_set", {
      path: "live_set",
      properties: { is_playing: 1 },
    });

    const stopped = stopPlaybackIfNeeded(LiveAPI.from("live_set"));

    expect(stopped).toBe(true);
    expect(liveSet.call).toHaveBeenCalledWith("stop_playing");
    expect(capturedWarnings()).toContain("Playback stopped to modify locators");
  });

  it("does nothing when the set is stopped (is_playing 0 is not playing)", () => {
    const liveSet = registerMockObject("live_set", {
      path: "live_set",
      properties: { is_playing: 0 },
    });

    const stopped = stopPlaybackIfNeeded(LiveAPI.from("live_set"));

    expect(stopped).toBe(false);
    expect(liveSet.call).not.toHaveBeenCalledWith("stop_playing");
    expect(capturedWarnings()).toHaveLength(0);
  });
});

describe("waitForPlayheadPosition", () => {
  /**
   * Register a live_set whose current_song_time reads back as `position`.
   * @param position - The value get("current_song_time") returns
   * @returns A LiveAPI handle for the registered live_set
   */
  function liveSetAt(position: number): LiveAPI {
    registerMockObject("live_set", {
      path: "live_set",
      properties: { current_song_time: position },
    });

    return LiveAPI.from("live_set");
  }

  beforeEach(() => {
    // Clear any previous registration so each case controls the playhead.
    registerMockObject("live_set", { path: "live_set" });
  });

  it("says yes once the playhead reaches the target", async () => {
    expect(await waitForPlayheadPosition(liveSetAt(16), 16)).toBe(true);
  });

  it("says no when the playhead never reaches the target", async () => {
    expect(await waitForPlayheadPosition(liveSetAt(9999), 16)).toBe(false);
  });

  it("treats a difference of exactly the epsilon as not reached", async () => {
    // SAME_TIME_EPSILON is 0.001; the tolerance is strict (< not <=).
    expect(await waitForPlayheadPosition(liveSetAt(0.001), 0)).toBe(false);
  });
});

// A cue toggle acts wherever the playhead is, so one that didn't arrive must
// not toggle at all: it would delete or create the wrong locator.
describe("locators when the playhead stalls", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerMockObject("live_set_id", { path: "live_set" });
  });

  it("skips a create the playhead never reached", async () => {
    const set = simulateLocators(liveSet, [], { stallAt: 16 });

    const result = await updateLiveSet({
      locatorOperation: "create",
      locatorTime: "1|1,5|1",
    });

    expect(result.locator).toStrictEqual([
      { operation: "create", id: "26" },
      {
        operation: "skipped",
        time: "5|1",
        ok: false,
        detail:
          "Live didn't move the playhead to 5|1, so nothing changed there",
      },
    ]);
    expect(set.locators()).toStrictEqual([{ time: 0, name: "" }]);
  });

  it("skips a delete the playhead never reached", async () => {
    const set = simulateLocators(liveSet, LOCATORS, { stallAt: 16 });

    const result = await updateLiveSet({
      locatorOperation: "delete",
      locatorTime: "1|1,5|1",
    });

    expect(result.locator).toStrictEqual([
      { operation: "delete", id: "26" },
      {
        operation: "skipped",
        time: "5|1",
        ok: false,
        detail:
          "Live didn't move the playhead to 5|1, so nothing changed there",
      },
    ]);
    expect(set.locators()).toStrictEqual([{ time: 16, name: "B" }]);
  });

  it("says how many of a name it deleted before stalling", async () => {
    const set = simulateLocators(
      liveSet,
      [
        { time: 0, name: "A" },
        { time: 16, name: "A" },
      ],
      { stallAt: 0 },
    );

    await expect(
      updateLiveSet({ locatorOperation: "delete", locatorName: "A" }),
    ).rejects.toThrow(
      "Live didn't move the playhead to 1|1, so nothing changed there; " +
        'deleted 1 of 2 named "A"',
    );
    expect(set.locators()).toStrictEqual([{ time: 0, name: "A" }]);
  });

  it("reports a create that made no locator as failed", async () => {
    const set = simulateLocators(liveSet, [], { noCueAt: 16 });

    const result = await updateLiveSet({
      locatorOperation: "create",
      locatorTime: "5|1",
      locatorName: "B",
    });

    expect(result.locator).toStrictEqual({
      operation: "skipped",
      time: "5|1",
      name: "B",
      ok: false,
      detail: "Live made no locator at 5|1",
    });
    expect(set.locators()).toStrictEqual([]);
  });
});
