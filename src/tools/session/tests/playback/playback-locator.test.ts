// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import { playback } from "#src/tools/session/playback.ts";
import {
  expectLiveSetProperty,
  setupCuePointMocks,
} from "./playback-test-helpers.ts";

const VERSE_CHORUS_CUE_POINTS = [
  { id: "cue1", time: 16, name: "Verse" },
  { id: "cue2", time: 32, name: "Chorus" },
] as const;

describe("playback - song positions", () => {
  describe("loc: on startTime", () => {
    let liveSet: RegisteredMockObject;

    beforeEach(() => {
      liveSet = setupCuePointMocks({
        cuePoints: [...VERSE_CHORUS_CUE_POINTS],
        liveSet: { startTime: 16 },
      });
    });

    it("should start playback from a locator id", () => {
      const result = playback({
        action: "play-arrangement",
        startTime: "loc:locator-0",
      });

      expectLiveSetProperty(liveSet, "start_time", 16);
      expect(liveSet.call).toHaveBeenCalledWith("start_playing");
      expect(result).toStrictEqual({
        playing: true,
        currentTime: "5|1",
        startTime: "5|1",
      });
    });

    it("should start playback from a locator name", () => {
      const result = playback({
        action: "play-arrangement",
        startTime: "loc:Chorus",
      });

      expectLiveSetProperty(liveSet, "start_time", 32);
      expect(result.currentTime).toBe("9|1");
    });

    it("should accept the undocumented locator: spelling", () => {
      const result = playback({
        action: "play-arrangement",
        startTime: "locator:Chorus",
      });

      expect(result.currentTime).toBe("9|1");
    });

    it("should accept the prefix in any case", () => {
      const result = playback({
        action: "play-arrangement",
        startTime: "LOC:Verse",
      });

      expect(result.currentTime).toBe("5|1");
    });

    it("should throw when the prefix names no locator", () => {
      expect(() =>
        playback({ action: "play-arrangement", startTime: "loc:" }),
      ).toThrow('playback failed: startTime "loc:" names no locator');
    });

    it("should throw if the locator id is not found", () => {
      expect(() =>
        playback({ action: "play-arrangement", startTime: "loc:locator-99" }),
      ).toThrow("playback failed: locator not found: locator-99");
    });

    it("should throw if the locator name is not found", () => {
      expect(() =>
        playback({ action: "play-arrangement", startTime: "loc:NonExistent" }),
      ).toThrow(
        'playback failed: no locator found with name "NonExistent" for startTime',
      );
    });

    it("should not sniff a bare name as a locator", () => {
      expect(() =>
        playback({ action: "play-arrangement", startTime: "Chorus" }),
      ).toThrow('Invalid bar|beat format: "Chorus"');
    });
  });

  describe("loc: on loopStart and loopEnd", () => {
    let liveSet: RegisteredMockObject;

    beforeEach(() => {
      liveSet = setupCuePointMocks({
        cuePoints: [...VERSE_CHORUS_CUE_POINTS],
        liveSet: { startTime: 16, loopStart: 16, loopLength: 16 },
      });
    });

    // Every spelling of the same 5|1-9|1 loop: two locator ids, two names, and
    // one of each — the two ends resolve independently.
    it.each([
      ["locator ids", "loc:locator-0", "loc:locator-1"],
      ["locator names", "loc:Verse", "loc:Chorus"],
      ["a bar|beat and a locator", "5|1", "loc:Chorus"],
    ])("should set the loop from %s", (_label, loopStart, loopEnd) => {
      const result = playback({
        action: "update-arrangement",
        loop: true,
        loopStart,
        loopEnd,
      });

      expectLiveSetProperty(liveSet, "loop_start", 16);
      expectLiveSetProperty(liveSet, "loop_length", 16);
      expect(result.arrangementLoop).toStrictEqual({
        start: "5|1",
        end: "9|1",
      });
    });

    it("should throw if the loopStart locator is not found", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loop: true,
          loopStart: "loc:locator-99",
        }),
      ).toThrow("playback failed: locator not found: locator-99");
    });

    it("should throw if the loopEnd locator is not found", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loop: true,
          loopEnd: "loc:NonExistent",
        }),
      ).toThrow(
        'playback failed: no locator found with name "NonExistent" for loopEnd',
      );
    });
  });

  describe("deprecated *Locator params", () => {
    let liveSet: RegisteredMockObject;

    beforeEach(() => {
      liveSet = setupCuePointMocks({
        cuePoints: [...VERSE_CHORUS_CUE_POINTS],
        liveSet: { startTime: 16, loopStart: 16, loopLength: 16 },
      });
    });

    it("should fold startLocator into startTime", () => {
      const result = playback({
        action: "play-arrangement",
        startLocator: "locator-0",
      });

      expectLiveSetProperty(liveSet, "start_time", 16);
      expect(result).toStrictEqual({
        playing: true,
        currentTime: "5|1",
        startTime: "5|1",
      });
    });

    it("should fold loopStartLocator and loopEndLocator into the loop", () => {
      const result = playback({
        action: "update-arrangement",
        loop: true,
        loopStartLocator: "Verse",
        loopEndLocator: "Chorus",
      });

      expectLiveSetProperty(liveSet, "loop_start", 16);
      expectLiveSetProperty(liveSet, "loop_length", 16);
      expect(result.arrangementLoop).toStrictEqual({
        start: "5|1",
        end: "9|1",
      });
    });

    it("should not allow startTime with startLocator", () => {
      expect(() =>
        playback({
          action: "play-arrangement",
          startTime: "1|1",
          startLocator: "locator-0",
        }),
      ).toThrow("playback failed: startTime cannot be used with startLocator");
    });

    it("should not allow loopStart with loopStartLocator", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loopStart: "1|1",
          loopStartLocator: "locator-0",
        }),
      ).toThrow(
        "playback failed: loopStart cannot be used with loopStartLocator",
      );
    });

    it("should not allow loopEnd with loopEndLocator", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loopEnd: "10|1",
          loopEndLocator: "Chorus",
        }),
      ).toThrow("playback failed: loopEnd cannot be used with loopEndLocator");
    });
  });

  describe("combined locator start and loop", () => {
    let liveSet: RegisteredMockObject;

    beforeEach(() => {
      liveSet = setupCuePointMocks({
        cuePoints: [
          { id: "cue1", time: 0, name: "Intro" },
          { id: "cue2", time: 16, name: "Verse" },
          { id: "cue3", time: 32, name: "Chorus" },
        ],
        liveSet: { startTime: 16, loopStart: 16, loopLength: 16 },
      });
    });

    it("should start from a locator and set the loop from locators", () => {
      const result = playback({
        action: "play-arrangement",
        startTime: "loc:Verse",
        loop: true,
        loopStart: "loc:locator-1",
        loopEnd: "loc:locator-2",
      });

      expectLiveSetProperty(liveSet, "start_time", 16);
      expectLiveSetProperty(liveSet, "loop_start", 16);
      expectLiveSetProperty(liveSet, "loop_length", 16);
      expect(liveSet.call).toHaveBeenCalledWith("start_playing");
      expect(result).toStrictEqual({
        playing: true,
        currentTime: "5|1",
        startTime: "5|1",
        arrangementLoop: { start: "5|1", end: "9|1" },
      });
    });
  });
});
