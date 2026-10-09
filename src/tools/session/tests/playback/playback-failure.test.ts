// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { getMockWrites } from "#src/test/mocks/registry/mock-write-log.ts";
import { playback } from "#src/tools/session/playback.ts";
import {
  registerClipSlot,
  setupCuePointMocks,
  setupMultiClipMocks,
} from "./playback-test-helpers.ts";

/**
 * Every `set` and mutating `call` the mocks have seen.
 * @returns The writes, in order
 */
function writesMade(): Array<{ name: string; args: unknown[] }> {
  return getMockWrites()
    .filter((write) => write.kind === "set" || !write.name.startsWith("get_"))
    .map(({ name, args }) => ({ name, args }));
}

const ACTIONS = ["stop", "play-arrangement", "update-arrangement"] as const;

// Each of these is a timeline the call can't read. Every action that reads the
// timeline refuses it with the Set untouched: stop used to stop the transport
// first and throw afterwards.
const BAD_TIMELINES: Array<[string, Record<string, unknown>, string]> = [
  ["a bad startTime", { startTime: "garbage" }, "Invalid bar|beat format"],
  [
    "a bad loopStart",
    { startTime: "5|1", loopStart: "garbage" },
    "Invalid bar|beat format",
  ],
  ["a bad loopEnd", { loop: true, loopEnd: "nope" }, "Invalid bar|beat format"],
  ["an unknown locator", { startTime: "loc:Nope" }, "no locator found"],
  [
    "an unknown loop locator",
    { startTime: "5|1", loopEnd: "loc:Nope" },
    "no locator found",
  ],
];

describe("playback - a timeline that can't be read", () => {
  beforeEach(() => {
    setupCuePointMocks({
      cuePoints: [{ id: "26", time: 16, name: "Verse" }],
      liveSet: { startTime: 8 },
    });
  });

  describe.each(ACTIONS)("%s", (action) => {
    it.each(BAD_TIMELINES)("refuses %s, changing nothing", (_, args, why) => {
      expect(() => playback({ action, ...args })).toThrow(why);
      expect(writesMade()).toStrictEqual([]);
    });
  });

  it("still writes a timeline it can read, after the stop", () => {
    playback({ action: "stop", startTime: "loc:Verse" });

    expect(writesMade().map(({ name }) => name)).toStrictEqual([
      "stop_playing",
      "start_time",
      "start_time",
    ]);
    expect(writesMade().at(-1)?.args).toStrictEqual([16]);
  });
});

// Live changed before the throw, so the error says what the caller now has.
describe("playback - a failure after Live changed", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = setupCuePointMocks({
      cuePoints: [],
      liveSet: { startTime: 8 },
    });
  });

  it("names the stop when writing the start position then fails", () => {
    liveSet.set.mockImplementation(() => {
      throw new Error("Live refused start_time");
    });

    expect(() => playback({ action: "stop", startTime: "5|1" })).toThrow(
      "Live refused start_time; already changed: transport stopped",
    );
  });

  it("names the timeline when starting the arrangement then fails", () => {
    liveSet.call.mockImplementation((name: string) => {
      if (name === "start_playing") {
        throw new Error("Live refused start_playing");
      }
    });

    expect(() =>
      playback({
        action: "play-arrangement",
        startTime: "5|1",
        loopStart: "5|1",
        loopEnd: "9|1",
      }),
    ).toThrow("Live refused start_playing; already changed: start time, loop");
  });

  it("names the transport start when reading the position back then fails", () => {
    liveSet.get.mockImplementation((property: string) => {
      if (property === "start_time") {
        throw new Error("Live refused start_time");
      }

      return [0];
    });

    expect(() => playback({ action: "play-arrangement" })).toThrow(
      "Live refused start_time; already changed: transport started",
    );
  });

  it("names the clips fired when the transport restart then fails", () => {
    const { clipSlots } = setupMultiClipMocks();

    liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    liveSet.call.mockImplementation((name: string) => {
      if (name === "start_playing") {
        throw new Error("Live refused start_playing");
      }
    });

    expect(() =>
      playback({ action: "play-session-clips", id: "clip1,clip2" }),
    ).toThrow(
      "Live refused start_playing; already changed: session clips fired, transport stopped",
    );
    expect(clipSlots[0]?.call).toHaveBeenCalledWith("fire");
    expect(clipSlots[1]?.call).toHaveBeenCalledWith("fire");
  });

  it("keeps the track stopped before a later track's stop failed", () => {
    const first = registerMockObject(livePath.track(0), {
      path: livePath.track(0),
    });
    const second = registerMockObject(livePath.track(1), {
      path: livePath.track(1),
    });

    registerClipSlot(0, 0);
    registerClipSlot(1, 0);
    second.call.mockImplementation(() => {
      throw new Error("Live refused stop_all_clips");
    });

    const result = playback({
      action: "stop-session-clips",
      path: "t0/s0,t1/s0",
    });

    expect(first.call).toHaveBeenCalledWith("stop_all_clips");
    expect(result.clip).toStrictEqual([
      { id: "live_set/tracks/0/clip_slots/0/clip", path: "t0/s0" },
      { path: "t1/s0", ok: false, detail: "Live refused stop_all_clips" },
    ]);
  });
});
