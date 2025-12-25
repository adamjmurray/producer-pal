import { beforeEach, describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
} from "../../../test/mock-live-api.js";
import { playback } from "../playback.js";

describe("playback - cue support", () => {
  beforeEach(() => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") return "live_set_id";
      if (this._path === "id cue1") return "cue1";
      if (this._path === "id cue2") return "cue2";
      if (this._path === "id cue3") return "cue3";
      return this._id;
    });
  });

  describe("startCueId", () => {
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

    it("should start playback from cue by ID", () => {
      const result = playback({
        action: "play-arrangement",
        startCueId: "cue-0",
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

    it("should throw if cue ID not found", () => {
      expect(() =>
        playback({
          action: "play-arrangement",
          startCueId: "cue-99",
        }),
      ).toThrow("playback failed: cue not found: cue-99");
    });

    it("should not allow startTime with startCueId", () => {
      expect(() =>
        playback({
          action: "play-arrangement",
          startTime: "1|1",
          startCueId: "cue-0",
        }),
      ).toThrow(
        "playback failed: startTime cannot be used with startCueId or startCueName",
      );
    });
  });

  describe("startCueName", () => {
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

    it("should start playback from cue by name", () => {
      const result = playback({
        action: "play-arrangement",
        startCueName: "Chorus",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "start_time",
        32,
      );
      expect(liveApiCall).toHaveBeenCalledWith("start_playing");
      expect(result.currentTime).toBe("9|1");
    });

    it("should throw if cue name not found", () => {
      expect(() =>
        playback({
          action: "play-arrangement",
          startCueName: "NonExistent",
        }),
      ).toThrow(
        'playback failed: no cue found with name "NonExistent" for start',
      );
    });

    it("should not allow startCueId with startCueName", () => {
      expect(() =>
        playback({
          action: "play-arrangement",
          startCueId: "cue-0",
          startCueName: "Verse",
        }),
      ).toThrow(
        "playback failed: startCueId and startCueName are mutually exclusive",
      );
    });
  });

  describe("loopStartCueId and loopEndCueId", () => {
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

    it("should set loop using cue IDs", () => {
      const result = playback({
        action: "update-arrangement",
        loop: true,
        loopStartCueId: "cue-0",
        loopEndCueId: "cue-1",
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

    it("should throw if loopStart cue ID not found", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loop: true,
          loopStartCueId: "cue-99",
        }),
      ).toThrow("playback failed: cue not found: cue-99");
    });

    it("should not allow loopStart with loopStartCueId", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loopStart: "1|1",
          loopStartCueId: "cue-0",
        }),
      ).toThrow(
        "playback failed: loopStart cannot be used with loopStartCueId or loopStartCueName",
      );
    });
  });

  describe("loopStartCueName and loopEndCueName", () => {
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

    it("should set loop using cue names", () => {
      const result = playback({
        action: "update-arrangement",
        loop: true,
        loopStartCueName: "Verse",
        loopEndCueName: "Chorus",
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

    it("should throw if loopStart cue name not found", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loop: true,
          loopStartCueName: "NonExistent",
        }),
      ).toThrow(
        'playback failed: no cue found with name "NonExistent" for loopStart',
      );
    });

    it("should not allow loopStartCueId with loopStartCueName", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loopStartCueId: "cue-0",
          loopStartCueName: "Verse",
        }),
      ).toThrow(
        "playback failed: loopStartCueId and loopStartCueName are mutually exclusive",
      );
    });

    it("should not allow loopEnd with loopEndCueName", () => {
      expect(() =>
        playback({
          action: "update-arrangement",
          loopEnd: "10|1",
          loopEndCueName: "Chorus",
        }),
      ).toThrow(
        "playback failed: loopEnd cannot be used with loopEndCueId or loopEndCueName",
      );
    });
  });

  describe("combined cue start and loop", () => {
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

    it("should start from cue and set loop using cues", () => {
      const result = playback({
        action: "play-arrangement",
        startCueName: "Verse",
        loop: true,
        loopStartCueId: "cue-1",
        loopEndCueId: "cue-2",
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
