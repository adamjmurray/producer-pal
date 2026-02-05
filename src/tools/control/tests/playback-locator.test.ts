// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiSet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { playback } from "#src/tools/control/playback.ts";
import { resolveLocatorToBeats } from "#src/tools/control/playback-helpers.ts";
import { setupCuePointMocks } from "./playback-test-helpers.ts";

describe("playback - locator support", () => {
  beforeEach(() => {
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "live_set") return "live_set_id";
      if (this._path === "id cue1") return "cue1";
      if (this._path === "id cue2") return "cue2";
      if (this._path === "id cue3") return "cue3";

      return this._id;
    });
  });

  describe("startLocatorId", () => {
    beforeEach(() => {
      setupCuePointMocks({
        cuePoints: [
          { id: "cue1", time: 16, name: "Verse" }, // Beat 16 = 5|1 in 4/4
          { id: "cue2", time: 32, name: "Chorus" }, // Beat 32 = 9|1 in 4/4
        ],
      });
    });

    it("should start playback from locator by ID", () => {
      const result = playback({
        action: "play-arrangement",
        startLocatorId: "locator-0",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "start_time",
        16,
      );
      expect(liveApiCall).toHaveBeenCalledWith("start_playing");
      expect(result).toStrictEqual({
        playing: true,
        currentTime: "5|1",
        arrangementFollowerTrackIds: "",
      });
    });

    it("should throw if locator ID not found", () => {
      expect(() =>
        playback({
          action: "play-arrangement",
          startLocatorId: "locator-99",
        }),
      ).toThrow("playback failed: locator not found: locator-99");
    });

    it("should not allow startTime with startLocatorId", () => {
      expect(() =>
        playback({
          action: "play-arrangement",
          startTime: "1|1",
          startLocatorId: "locator-0",
        }),
      ).toThrow(
        "playback failed: startTime cannot be used with startLocatorId or startLocatorName",
      );
    });
  });

  describe("startLocatorName", () => {
    beforeEach(() => {
      setupCuePointMocks({
        cuePoints: [
          { id: "cue1", time: 16, name: "Verse" },
          { id: "cue2", time: 32, name: "Chorus" },
        ],
      });
    });

    it("should start playback from locator by name", () => {
      const result = playback({
        action: "play-arrangement",
        startLocatorName: "Chorus",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "start_time",
        32,
      );
      expect(liveApiCall).toHaveBeenCalledWith("start_playing");
      expect(result.currentTime).toBe("9|1");
    });

    it("should throw if locator name not found", () => {
      expect(() =>
        playback({
          action: "play-arrangement",
          startLocatorName: "NonExistent",
        }),
      ).toThrow(
        'playback failed: no locator found with name "NonExistent" for start',
      );
    });

    it("should not allow startLocatorId with startLocatorName", () => {
      expect(() =>
        playback({
          action: "play-arrangement",
          startLocatorId: "locator-0",
          startLocatorName: "Verse",
        }),
      ).toThrow(
        "playback failed: startLocatorId and startLocatorName are mutually exclusive",
      );
    });
  });

  describe("loopStartLocatorId and loopEndLocatorId", () => {
    beforeEach(() => {
      setupCuePointMocks({
        cuePoints: [
          { id: "cue1", time: 16, name: "Verse" },
          { id: "cue2", time: 32, name: "Chorus" },
        ],
        liveSet: { loopStart: 16, loopLength: 16 },
      });
    });

    it("should set loop using locator IDs", () => {
      const result = playback({
        action: "update-arrangement",
        loop: true,
        loopStartLocatorId: "locator-0",
        loopEndLocatorId: "locator-1",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "loop_start",
        16,
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "loop_length",
        16, // 32 - 16 = 16 beats
      );
      expect(result.arrangementLoop).toStrictEqual({
        start: "5|1",
        end: "9|1",
      });
    });

    it("should throw if loopStart locator ID not found", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loop: true,
          loopStartLocatorId: "locator-99",
        }),
      ).toThrow("playback failed: locator not found: locator-99");
    });

    it("should not allow loopStart with loopStartLocatorId", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loopStart: "1|1",
          loopStartLocatorId: "locator-0",
        }),
      ).toThrow(
        "playback failed: loopStart cannot be used with loopStartLocatorId or loopStartLocatorName",
      );
    });
  });

  describe("loopStartLocatorName and loopEndLocatorName", () => {
    beforeEach(() => {
      setupCuePointMocks({
        cuePoints: [
          { id: "cue1", time: 16, name: "Verse" },
          { id: "cue2", time: 32, name: "Chorus" },
        ],
        liveSet: { loopStart: 16, loopLength: 16 },
      });
    });

    it("should set loop using locator names", () => {
      const result = playback({
        action: "update-arrangement",
        loop: true,
        loopStartLocatorName: "Verse",
        loopEndLocatorName: "Chorus",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "loop_start",
        16,
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "loop_length",
        16,
      );
      expect(result.arrangementLoop).toStrictEqual({
        start: "5|1",
        end: "9|1",
      });
    });

    it("should throw if loopStart locator name not found", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loop: true,
          loopStartLocatorName: "NonExistent",
        }),
      ).toThrow(
        'playback failed: no locator found with name "NonExistent" for loopStart',
      );
    });

    it("should not allow loopStartLocatorId with loopStartLocatorName", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loopStartLocatorId: "locator-0",
          loopStartLocatorName: "Verse",
        }),
      ).toThrow(
        "playback failed: loopStartLocatorId and loopStartLocatorName are mutually exclusive",
      );
    });

    it("should not allow loopEnd with loopEndLocatorName", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loopEnd: "10|1",
          loopEndLocatorName: "Chorus",
        }),
      ).toThrow(
        "playback failed: loopEnd cannot be used with loopEndLocatorId or loopEndLocatorName",
      );
    });
  });

  describe("combined locator start and loop", () => {
    beforeEach(() => {
      setupCuePointMocks({
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
        startLocatorName: "Verse",
        loop: true,
        loopStartLocatorId: "locator-1",
        loopEndLocatorId: "locator-2",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "start_time",
        16,
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "loop_start",
        16,
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "loop_length",
        16,
      );
      expect(liveApiCall).toHaveBeenCalledWith("start_playing");
      expect(result).toStrictEqual({
        playing: true,
        currentTime: "5|1",
        arrangementLoop: {
          start: "5|1",
          end: "9|1",
        },
        arrangementFollowerTrackIds: "",
      });
    });
  });

  describe("resolveLocatorToBeats", () => {
    it("should return undefined when no locator is specified", () => {
      const mockLiveSet = {} as unknown as globalThis.LiveAPI;
      const result = resolveLocatorToBeats(
        mockLiveSet,
        { locatorId: undefined, locatorName: undefined },
        "start",
      );

      expect(result).toBeUndefined();
    });
  });
});
