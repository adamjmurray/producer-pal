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
    it("should create cue at specified position", async () => {
      // Track whether set_or_delete_cue was called (simulates cue creation)
      let cueCreated = false;

      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [0];
        // Return empty before creation, return cue after
        if (prop === "cue_points") {
          return cueCreated ? children("new_cue") : children();
        }
        if (prop === "time") return [0]; // 1|1 = 0 beats
        return [0];
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "set_or_delete_cue") {
          cueCreated = true;
        }
      });

      const result = await updateLiveSet({
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

    it("should create cue with name", async () => {
      let cueCreated = false;
      let cueNameSet = null;

      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [0];
        if (prop === "cue_points") {
          return cueCreated ? children("new_cue") : children();
        }
        if (prop === "time") return [16]; // 5|1 = 16 beats
        return [0];
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "set_or_delete_cue") {
          cueCreated = true;
        }
      });

      liveApiSet.mockImplementation(function (prop, value) {
        if (prop === "name") {
          cueNameSet = value;
        }
      });

      const result = await updateLiveSet({
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

    it("should stop playback before creating cue", async () => {
      let cueCreated = false;

      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [1];
        if (prop === "cue_points") {
          return cueCreated ? children("new_cue") : children();
        }
        if (prop === "time") return [0];
        return [0];
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "set_or_delete_cue") {
          cueCreated = true;
        }
      });

      await updateLiveSet({
        cueOperation: "create",
        cueTime: "1|1",
      });

      expect(liveApiCall).toHaveBeenCalledWith("stop_playing");
    });

    it("should skip creation if cue already exists at position", async () => {
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [0];
        if (prop === "cue_points") return children("existing_cue");
        if (prop === "time") return [16]; // 5|1 = 16 beats
        if (prop === "name") return ["Existing"];
        return [0];
      });

      const result = await updateLiveSet({
        cueOperation: "create",
        cueTime: "5|1",
        cueName: "New Cue",
      });

      // Should NOT call set_or_delete_cue (would delete existing cue)
      expect(liveApiCall).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.cue).toEqual({
        operation: "skipped",
        reason: "cue_exists",
        time: "5|1",
        existingId: "cue-0",
      });
    });

    it("should throw if cueTime is missing for create", async () => {
      await expect(
        updateLiveSet({
          cueOperation: "create",
        }),
      ).rejects.toThrow("cueTime is required for create operation");
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

    it("should delete cue by ID", async () => {
      const result = await updateLiveSet({
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

    it("should delete cue by time", async () => {
      const result = await updateLiveSet({
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

    it("should delete all cues by name", async () => {
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

      const result = await updateLiveSet({
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

    it("should throw if no identifier provided for delete", async () => {
      await expect(
        updateLiveSet({
          cueOperation: "delete",
        }),
      ).rejects.toThrow("delete requires cueId, cueTime, or cueName");
    });

    it("should skip if cue ID not found", async () => {
      const result = await updateLiveSet({
        cueOperation: "delete",
        cueId: "cue-99",
      });

      expect(liveApiCall).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.cue).toEqual({
        operation: "skipped",
        reason: "cue_not_found",
        id: "cue-99",
      });
    });

    it("should skip if no cue at specified time", async () => {
      const result = await updateLiveSet({
        cueOperation: "delete",
        cueTime: "100|1",
      });

      expect(liveApiCall).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.cue).toEqual({
        operation: "skipped",
        reason: "cue_not_found",
        time: "100|1",
      });
    });

    it("should skip if no cues match name", async () => {
      const result = await updateLiveSet({
        cueOperation: "delete",
        cueName: "NonExistent",
      });

      expect(liveApiCall).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.cue).toEqual({
        operation: "skipped",
        reason: "no_cues_found",
        name: "NonExistent",
      });
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

    it("should rename cue by ID", async () => {
      const result = await updateLiveSet({
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

    it("should rename cue by time", async () => {
      const result = await updateLiveSet({
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

    it("should throw if cueName is missing for rename", async () => {
      await expect(
        updateLiveSet({
          cueOperation: "rename",
          cueId: "cue-0",
        }),
      ).rejects.toThrow("cueName is required for rename operation");
    });

    it("should throw if no identifier provided for rename", async () => {
      await expect(
        updateLiveSet({
          cueOperation: "rename",
          cueName: "New Name",
        }),
      ).rejects.toThrow("rename requires cueId or cueTime");
    });

    it("should throw if cue ID not found for rename", async () => {
      await expect(
        updateLiveSet({
          cueOperation: "rename",
          cueId: "cue-99",
          cueName: "New Name",
        }),
      ).rejects.toThrow("Cue not found: cue-99");
    });
  });

  describe("combined with other operations", () => {
    it("should allow cue operation with tempo change", async () => {
      let cueCreated = false;

      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [0];
        if (prop === "cue_points") {
          return cueCreated ? children("new_cue") : children();
        }
        if (prop === "time") return [0];
        return [0];
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "set_or_delete_cue") {
          cueCreated = true;
        }
      });

      const result = await updateLiveSet({
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
