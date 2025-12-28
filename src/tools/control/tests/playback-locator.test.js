import { beforeEach, describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
} from "#src/test/mock-live-api.js";
import { playback } from "../playback.js";

describe("playback - locator support", () => {
  beforeEach(() => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") return "live_set_id";
      if (this._path === "id cue1") return "cue1";
      if (this._path === "id cue2") return "cue2";
      if (this._path === "id cue3") return "cue3";

      return this._id;
    });
  });

  describe("startLocatorId", () => {
    beforeEach(() => {
      liveApiGet.mockImplementation(function (prop) {
        if (this._path === "live_set") {
          if (prop === "signature_numerator") return [4];
          if (prop === "signature_denominator") return [4];
          if (prop === "loop") return [0];
          if (prop === "loop_start") return [0];
          if (prop === "loop_length") return [4];
          if (prop === "cue_points") return children("cue1", "cue2");
          if (prop === "tracks") return [];
        }

        if (this._path === "id cue1") {
          if (prop === "time") return [16]; // Beat 16 = 5|1 in 4/4
          if (prop === "name") return ["Verse"];
        }

        if (this._path === "id cue2") {
          if (prop === "time") return [32]; // Beat 32 = 9|1 in 4/4
          if (prop === "name") return ["Chorus"];
        }

        return [0];
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
      liveApiGet.mockImplementation(function (prop) {
        if (this._path === "live_set") {
          if (prop === "signature_numerator") return [4];
          if (prop === "signature_denominator") return [4];
          if (prop === "loop") return [0];
          if (prop === "loop_start") return [0];
          if (prop === "loop_length") return [4];
          if (prop === "cue_points") return children("cue1", "cue2");
          if (prop === "tracks") return [];
        }

        if (this._path === "id cue1") {
          if (prop === "time") return [16];
          if (prop === "name") return ["Verse"];
        }

        if (this._path === "id cue2") {
          if (prop === "time") return [32];
          if (prop === "name") return ["Chorus"];
        }

        return [0];
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
      liveApiGet.mockImplementation(function (prop) {
        if (this._path === "live_set") {
          if (prop === "signature_numerator") return [4];
          if (prop === "signature_denominator") return [4];
          if (prop === "loop") return [0];
          if (prop === "loop_start") return [16];
          if (prop === "loop_length") return [16];
          if (prop === "cue_points") return children("cue1", "cue2");
          if (prop === "tracks") return [];
        }

        if (this._path === "id cue1") {
          if (prop === "time") return [16];
          if (prop === "name") return ["Verse"];
        }

        if (this._path === "id cue2") {
          if (prop === "time") return [32];
          if (prop === "name") return ["Chorus"];
        }

        return [0];
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
      expect(result.arrangementLoop).toEqual({
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
      liveApiGet.mockImplementation(function (prop) {
        if (this._path === "live_set") {
          if (prop === "signature_numerator") return [4];
          if (prop === "signature_denominator") return [4];
          if (prop === "loop") return [0];
          if (prop === "loop_start") return [16];
          if (prop === "loop_length") return [16];
          if (prop === "cue_points") return children("cue1", "cue2");
          if (prop === "tracks") return [];
        }

        if (this._path === "id cue1") {
          if (prop === "time") return [16];
          if (prop === "name") return ["Verse"];
        }

        if (this._path === "id cue2") {
          if (prop === "time") return [32];
          if (prop === "name") return ["Chorus"];
        }

        return [0];
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
      expect(result.arrangementLoop).toEqual({
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
      liveApiGet.mockImplementation(function (prop) {
        if (this._path === "live_set") {
          if (prop === "signature_numerator") return [4];
          if (prop === "signature_denominator") return [4];
          if (prop === "loop") return [0];
          if (prop === "loop_start") return [16];
          if (prop === "loop_length") return [16];
          if (prop === "cue_points") return children("cue1", "cue2", "cue3");
          if (prop === "tracks") return [];
        }

        if (this._path === "id cue1") {
          if (prop === "time") return [0];
          if (prop === "name") return ["Intro"];
        }

        if (this._path === "id cue2") {
          if (prop === "time") return [16];
          if (prop === "name") return ["Verse"];
        }

        if (this._path === "id cue3") {
          if (prop === "time") return [32];
          if (prop === "name") return ["Chorus"];
        }

        return [0];
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
});
