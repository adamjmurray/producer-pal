import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  children,
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
} from "../../../test/mock-live-api.js";
import { updateLiveSet } from "../update-live-set.js";

describe("updateLiveSet - cue operations", () => {
  beforeEach(() => {
    liveApiId.mockReturnValue("live_set_id");
    vi.clearAllMocks();
  });

  describe("create cue", () => {
    beforeEach(() => {
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [0];
        if (prop === "cue_points") return children("new_cue");
        if (prop === "time") return [0];
        return [0];
      });
    });

    it("should create cue at specified position", () => {
      const result = updateLiveSet({
        cueOperation: "create",
        cueTime: "1|1",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "current_song_time",
        0,
      );
      expect(liveApiCall).toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.cue).toEqual({
        operation: "created",
        time: "1|1",
        id: "cue-0",
      });
    });

    it("should create cue with name", () => {
      // Track the cue that gets its name set
      let cueNameSet = null;

      liveApiSet.mockImplementation(function (prop, value) {
        if (prop === "name") {
          cueNameSet = value;
        }
      });

      const result = updateLiveSet({
        cueOperation: "create",
        cueTime: "5|1",
        cueName: "Verse",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "current_song_time",
        16,
      );
      expect(liveApiCall).toHaveBeenCalledWith("set_or_delete_cue");
      expect(cueNameSet).toBe("Verse");
      expect(result.cue).toEqual({
        operation: "created",
        time: "5|1",
        name: "Verse",
        id: "cue-0",
      });
    });

    it("should stop playback before creating cue", () => {
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [1];
        if (prop === "cue_points") return children("new_cue");
        if (prop === "time") return [0];
        return [0];
      });

      updateLiveSet({
        cueOperation: "create",
        cueTime: "1|1",
      });

      expect(liveApiCall).toHaveBeenCalledWith("stop_playing");
    });

    it("should throw if cueTime is missing for create", () => {
      expect(() =>
        updateLiveSet({
          cueOperation: "create",
        }),
      ).toThrow("cueTime is required for create operation");
    });
  });

  describe("delete cue", () => {
    beforeEach(() => {
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [0];
        if (prop === "cue_points") return children("cue1", "cue2");
        if (this._path === "id cue1") {
          if (prop === "time") return [0];
          if (prop === "name") return ["Intro"];
        }
        if (this._path === "id cue2") {
          if (prop === "time") return [16];
          if (prop === "name") return ["Verse"];
        }
        return [0];
      });
    });

    it("should delete cue by ID", () => {
      const result = updateLiveSet({
        cueOperation: "delete",
        cueId: "cue-0",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "current_song_time",
        0,
      );
      expect(liveApiCall).toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.cue).toEqual({
        operation: "deleted",
        id: "cue-0",
      });
    });

    it("should delete cue by time", () => {
      const result = updateLiveSet({
        cueOperation: "delete",
        cueTime: "5|1",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "current_song_time",
        16,
      );
      expect(liveApiCall).toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.cue).toEqual({
        operation: "deleted",
        time: "5|1",
      });
    });

    it("should delete all cues by name", () => {
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [0];
        if (prop === "cue_points") return children("cue1", "cue2", "cue3");
        if (this._path === "id cue1") {
          if (prop === "time") return [0];
          if (prop === "name") return ["Verse"];
        }
        if (this._path === "id cue2") {
          if (prop === "time") return [16];
          if (prop === "name") return ["Chorus"];
        }
        if (this._path === "id cue3") {
          if (prop === "time") return [32];
          if (prop === "name") return ["Verse"];
        }
        return [0];
      });

      const result = updateLiveSet({
        cueOperation: "delete",
        cueName: "Verse",
      });

      expect(liveApiCall).toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.cue).toEqual({
        operation: "deleted",
        count: 2,
        name: "Verse",
      });
    });

    it("should throw if no identifier provided for delete", () => {
      expect(() =>
        updateLiveSet({
          cueOperation: "delete",
        }),
      ).toThrow("delete requires cueId, cueTime, or cueName");
    });

    it("should throw if cue ID not found", () => {
      expect(() =>
        updateLiveSet({
          cueOperation: "delete",
          cueId: "cue-99",
        }),
      ).toThrow("Cue not found: cue-99");
    });

    it("should throw if no cue at specified time", () => {
      expect(() =>
        updateLiveSet({
          cueOperation: "delete",
          cueTime: "100|1",
        }),
      ).toThrow("No cue found at position: 100|1");
    });

    it("should throw if no cues match name", () => {
      expect(() =>
        updateLiveSet({
          cueOperation: "delete",
          cueName: "NonExistent",
        }),
      ).toThrow("No cues found with name: NonExistent");
    });
  });

  describe("rename cue", () => {
    beforeEach(() => {
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [0];
        if (prop === "cue_points") return children("cue1", "cue2");
        if (this._path === "id cue1") {
          if (prop === "time") return [0];
        }
        if (this._path === "id cue2") {
          if (prop === "time") return [16];
        }
        return [0];
      });
    });

    it("should rename cue by ID", () => {
      const result = updateLiveSet({
        cueOperation: "rename",
        cueId: "cue-0",
        cueName: "New Intro",
      });

      expect(liveApiSet).toHaveBeenCalledWith("name", "New Intro");
      expect(result.cue).toEqual({
        operation: "renamed",
        id: "cue-0",
        name: "New Intro",
      });
    });

    it("should rename cue by time", () => {
      const result = updateLiveSet({
        cueOperation: "rename",
        cueTime: "5|1",
        cueName: "New Verse",
      });

      expect(liveApiSet).toHaveBeenCalledWith("name", "New Verse");
      expect(result.cue).toEqual({
        operation: "renamed",
        id: "cue-1",
        name: "New Verse",
      });
    });

    it("should throw if cueName is missing for rename", () => {
      expect(() =>
        updateLiveSet({
          cueOperation: "rename",
          cueId: "cue-0",
        }),
      ).toThrow("cueName is required for rename operation");
    });

    it("should throw if no identifier provided for rename", () => {
      expect(() =>
        updateLiveSet({
          cueOperation: "rename",
          cueName: "New Name",
        }),
      ).toThrow("rename requires cueId or cueTime");
    });

    it("should throw if cue ID not found for rename", () => {
      expect(() =>
        updateLiveSet({
          cueOperation: "rename",
          cueId: "cue-99",
          cueName: "New Name",
        }),
      ).toThrow("Cue not found: cue-99");
    });
  });

  describe("combined with other operations", () => {
    beforeEach(() => {
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [0];
        if (prop === "cue_points") return children("new_cue");
        if (prop === "time") return [0];
        return [0];
      });
    });

    it("should allow cue operation with tempo change", () => {
      const result = updateLiveSet({
        tempo: 140,
        cueOperation: "create",
        cueTime: "1|1",
      });

      expect(result.tempo).toBe(140);
      expect(result.cue).toEqual({
        operation: "created",
        time: "1|1",
        id: "cue-0",
      });
    });
  });
});
