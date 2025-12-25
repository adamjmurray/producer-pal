import { beforeEach, describe, expect, it } from "vitest";
import {
  children,
  liveApiGet,
  liveApiId,
} from "../../../test/mock-live-api.js";
import {
  findCue,
  findCuesByName,
  getCueId,
  readCuePoints,
} from "./cue-helpers.js";

describe("cue-helpers", () => {
  describe("getCueId", () => {
    it("should generate cue ID from index", () => {
      expect(getCueId(0)).toBe("cue-0");
      expect(getCueId(1)).toBe("cue-1");
      expect(getCueId(10)).toBe("cue-10");
    });
  });

  describe("readCuePoints", () => {
    beforeEach(() => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set") return "live_set_id";
        if (this._path === "id cue1") return "cue1";
        if (this._path === "id cue2") return "cue2";
        return this._id;
      });
    });

    it("should read cue points with bar|beat times", () => {
      liveApiGet.mockImplementation(function (prop) {
        if (this._path === "live_set" && prop === "cue_points") {
          return children("cue1", "cue2");
        }
        if (this._path === "id cue1") {
          if (prop === "name") return ["Intro"];
          if (prop === "time") return [0]; // Beat 0 = 1|1
        }
        if (this._path === "id cue2") {
          if (prop === "name") return ["Verse"];
          if (prop === "time") return [16]; // Beat 16 = 5|1 in 4/4
        }
        return [0];
      });

      const liveSet = new LiveAPI("live_set");
      const result = readCuePoints(liveSet, 4, 4);

      expect(result).toEqual([
        { id: "cue-0", name: "Intro", time: "1|1" },
        { id: "cue-1", name: "Verse", time: "5|1" },
      ]);
    });

    it("should handle empty cue points", () => {
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "cue_points") return [];
        return [0];
      });

      const liveSet = new LiveAPI("live_set");
      const result = readCuePoints(liveSet, 4, 4);

      expect(result).toEqual([]);
    });

    it("should handle fractional beat times", () => {
      liveApiGet.mockImplementation(function (prop) {
        if (this._path === "live_set" && prop === "cue_points") {
          return children("cue1");
        }
        if (this._path === "id cue1") {
          if (prop === "name") return ["Bridge"];
          if (prop === "time") return [2.5]; // 2.5 beats = 1|3.5 in 4/4
        }
        return [0];
      });

      const liveSet = new LiveAPI("live_set");
      const result = readCuePoints(liveSet, 4, 4);

      expect(result).toEqual([{ id: "cue-0", name: "Bridge", time: "1|3.5" }]);
    });
  });

  describe("findCue", () => {
    beforeEach(() => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set") return "live_set_id";
        return this._id;
      });

      liveApiGet.mockImplementation(function (prop) {
        if (this._path === "live_set" && prop === "cue_points") {
          return children("cue1", "cue2");
        }
        if (this._path === "id cue1") {
          if (prop === "time") return [0];
        }
        if (this._path === "id cue2") {
          if (prop === "time") return [16];
        }
        return [0];
      });
    });

    it("should find cue by ID", () => {
      const liveSet = new LiveAPI("live_set");
      const result = findCue(liveSet, { cueId: "cue-1" });

      expect(result).not.toBeNull();
      expect(result.index).toBe(1);
    });

    it("should find cue by time", () => {
      const liveSet = new LiveAPI("live_set");
      const result = findCue(liveSet, { timeInBeats: 16 });

      expect(result).not.toBeNull();
      expect(result.index).toBe(1);
    });

    it("should return null for non-existent ID", () => {
      const liveSet = new LiveAPI("live_set");
      const result = findCue(liveSet, { cueId: "cue-99" });

      expect(result).toBeNull();
    });

    it("should return null for non-existent time", () => {
      const liveSet = new LiveAPI("live_set");
      const result = findCue(liveSet, { timeInBeats: 100 });

      expect(result).toBeNull();
    });
  });

  describe("findCuesByName", () => {
    beforeEach(() => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set") return "live_set_id";
        return this._id;
      });

      liveApiGet.mockImplementation(function (prop) {
        if (this._path === "live_set" && prop === "cue_points") {
          return children("cue1", "cue2", "cue3");
        }
        if (this._path === "id cue1") {
          if (prop === "name") return ["Verse"];
          if (prop === "time") return [0];
        }
        if (this._path === "id cue2") {
          if (prop === "name") return ["Chorus"];
          if (prop === "time") return [16];
        }
        if (this._path === "id cue3") {
          if (prop === "name") return ["Verse"];
          if (prop === "time") return [32];
        }
        return [0];
      });
    });

    it("should find all cues matching name", () => {
      const liveSet = new LiveAPI("live_set");
      const result = findCuesByName(liveSet, "Verse");

      expect(result).toHaveLength(2);
      expect(result[0].index).toBe(0);
      expect(result[0].time).toBe(0);
      expect(result[1].index).toBe(2);
      expect(result[1].time).toBe(32);
    });

    it("should return empty array for non-matching name", () => {
      const liveSet = new LiveAPI("live_set");
      const result = findCuesByName(liveSet, "Bridge");

      expect(result).toEqual([]);
    });
  });
});
