// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import { playback } from "#src/tools/control/playback.ts";
import { resolveLocatorToBeats } from "#src/tools/control/playback-helpers.ts";
import {
  expectLiveSetProperty,
  setupCuePointMocks,
} from "./playback-test-helpers.ts";

const VERSE_CHORUS_CUE_POINTS = [
  { id: "cue1", time: 16, name: "Verse" },
  { id: "cue2", time: 32, name: "Chorus" },
] as const;

describe("playback - locator support", () => {
  describe("startLocator", () => {
    let liveSet: RegisteredMockObject;

    beforeEach(() => {
      liveSet = setupCuePointMocks({
        cuePoints: [...VERSE_CHORUS_CUE_POINTS],
      });
    });

    it("should start playback from locator by ID", () => {
      const result = playback({
        action: "play-arrangement",
        startLocator: "locator-0",
      });

      expectLiveSetProperty(liveSet, "start_time", 16);
      expect(liveSet.call).toHaveBeenCalledWith("start_playing");
      expect(result).toStrictEqual({ playing: true, currentTime: "5|1" });
    });

    it("should start playback from locator by name", () => {
      const result = playback({
        action: "play-arrangement",
        startLocator: "Chorus",
      });

      expectLiveSetProperty(liveSet, "start_time", 32);
      expect(liveSet.call).toHaveBeenCalledWith("start_playing");
      expect(result.currentTime).toBe("9|1");
    });

    it("should throw if locator ID not found", () => {
      expect(() =>
        playback({ action: "play-arrangement", startLocator: "locator-99" }),
      ).toThrow("playback failed: locator not found: locator-99");
    });

    it("should throw if locator name not found", () => {
      expect(() =>
        playback({ action: "play-arrangement", startLocator: "NonExistent" }),
      ).toThrow(
        'playback failed: no locator found with name "NonExistent" for start',
      );
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
  });

  describe("loopStartLocator and loopEndLocator", () => {
    let liveSet: RegisteredMockObject;

    beforeEach(() => {
      liveSet = setupCuePointMocks({
        cuePoints: [...VERSE_CHORUS_CUE_POINTS],
        liveSet: { loopStart: 16, loopLength: 16 },
      });
    });

    it("should set loop using locator IDs", () => {
      const result = playback({
        action: "update-arrangement",
        loop: true,
        loopStartLocator: "locator-0",
        loopEndLocator: "locator-1",
      });

      expectLiveSetProperty(liveSet, "loop_start", 16);
      expectLiveSetProperty(liveSet, "loop_length", 16);
      expect(result.arrangementLoop).toStrictEqual({
        start: "5|1",
        end: "9|1",
      });
    });

    it("should set loop using locator names", () => {
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

    it("should throw if loopStart locator not found", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loop: true,
          loopStartLocator: "locator-99",
        }),
      ).toThrow("playback failed: locator not found: locator-99");
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
        liveSet: { loopStart: 16, loopLength: 16 },
      });
    });

    it("should start from locator and set loop using locators", () => {
      const result = playback({
        action: "play-arrangement",
        startLocator: "Verse",
        loop: true,
        loopStartLocator: "locator-1",
        loopEndLocator: "locator-2",
      });

      expectLiveSetProperty(liveSet, "start_time", 16);
      expectLiveSetProperty(liveSet, "loop_start", 16);
      expectLiveSetProperty(liveSet, "loop_length", 16);
      expect(liveSet.call).toHaveBeenCalledWith("start_playing");
      expect(result).toStrictEqual({
        playing: true,
        currentTime: "5|1",
        arrangementLoop: { start: "5|1", end: "9|1" },
      });
    });
  });

  describe("resolveLocatorToBeats", () => {
    it("should return undefined when no locator is specified", () => {
      const mockLiveSet = {} as unknown as globalThis.LiveAPI;
      const result = resolveLocatorToBeats(mockLiveSet, undefined, "start");

      expect(result).toBeUndefined();
    });
  });
});
