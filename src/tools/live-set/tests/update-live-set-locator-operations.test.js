import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  children,
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
} from "#src/test/mock-live-api.js";
import { updateLiveSet } from "#src/tools/live-set/update-live-set.js";

describe("updateLiveSet - locator operations", () => {
  beforeEach(() => {
    liveApiId.mockReturnValue("live_set_id");
    vi.clearAllMocks();
  });

  describe("create locator", () => {
    it("should create locator at specified position", async () => {
      // Track whether set_or_delete_cue was called (simulates locator creation)
      let locatorCreated = false;

      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [0];
        if (prop === "song_length") return [1000]; // Large value so no extension needed

        // Return empty before creation, return locator after
        if (prop === "cue_points") {
          return locatorCreated ? children("new_cue") : children();
        }

        if (prop === "time") return [0]; // 1|1 = 0 beats

        return [0];
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "set_or_delete_cue") {
          locatorCreated = true;
        }
      });

      const result = await updateLiveSet({
        locatorOperation: "create",
        locatorTime: "1|1",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "current_song_time",
        0,
      );
      expect(liveApiCall).toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "created",
        time: "1|1",
        id: "locator-0",
      });
    });

    it("should create locator with name", async () => {
      let locatorCreated = false;
      let locatorNameSet = null;

      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [0];
        if (prop === "song_length") return [1000]; // Large value so no extension needed

        if (prop === "cue_points") {
          return locatorCreated ? children("new_cue") : children();
        }

        if (prop === "time") return [16]; // 5|1 = 16 beats

        return [0];
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "set_or_delete_cue") {
          locatorCreated = true;
        }
      });

      liveApiSet.mockImplementation(function (prop, value) {
        if (prop === "name") {
          locatorNameSet = value;
        }
      });

      const result = await updateLiveSet({
        locatorOperation: "create",
        locatorTime: "5|1",
        locatorName: "Verse",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "current_song_time",
        16,
      );
      expect(liveApiCall).toHaveBeenCalledWith("set_or_delete_cue");
      expect(locatorNameSet).toBe("Verse");
      expect(result.locator).toStrictEqual({
        operation: "created",
        time: "5|1",
        name: "Verse",
        id: "locator-0",
      });
    });

    it("should stop playback before creating locator", async () => {
      let locatorCreated = false;

      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [1];
        if (prop === "song_length") return [1000]; // Large value so no extension needed

        if (prop === "cue_points") {
          return locatorCreated ? children("new_cue") : children();
        }

        if (prop === "time") return [0];

        return [0];
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "set_or_delete_cue") {
          locatorCreated = true;
        }
      });

      await updateLiveSet({
        locatorOperation: "create",
        locatorTime: "1|1",
      });

      expect(liveApiCall).toHaveBeenCalledWith("stop_playing");
    });

    it("should skip creation if locator already exists at position", async () => {
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
        locatorOperation: "create",
        locatorTime: "5|1",
        locatorName: "New Locator",
      });

      // Should NOT call set_or_delete_cue (would delete existing locator)
      expect(liveApiCall).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "skipped",
        reason: "locator_exists",
        time: "5|1",
        existingId: "locator-0",
      });
    });

    it("should skip if locatorTime is missing for create", async () => {
      const result = await updateLiveSet({
        locatorOperation: "create",
      });

      expect(result.locator).toStrictEqual({
        operation: "skipped",
        reason: "missing_locatorTime",
      });
    });
  });

  describe("delete locator", () => {
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

    it("should delete locator by ID", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorId: "locator-0",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "current_song_time",
        0,
      );
      expect(liveApiCall).toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "deleted",
        id: "locator-0",
      });
    });

    it("should delete locator by time", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorTime: "5|1",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "current_song_time",
        16,
      );
      expect(liveApiCall).toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "deleted",
        time: "5|1",
      });
    });

    it("should delete all locators by name", async () => {
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
        locatorOperation: "delete",
        locatorName: "Verse",
      });

      expect(liveApiCall).toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "deleted",
        count: 2,
        name: "Verse",
      });
    });

    it("should skip if no identifier provided for delete", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
      });

      expect(result.locator).toStrictEqual({
        operation: "skipped",
        reason: "missing_identifier",
      });
    });

    it("should skip if locator ID not found", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorId: "locator-99",
      });

      expect(liveApiCall).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "skipped",
        reason: "locator_not_found",
        id: "locator-99",
      });
    });

    it("should skip if no locator at specified time", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorTime: "100|1",
      });

      expect(liveApiCall).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "skipped",
        reason: "locator_not_found",
        time: "100|1",
      });
    });

    it("should skip if no locators match name", async () => {
      const result = await updateLiveSet({
        locatorOperation: "delete",
        locatorName: "NonExistent",
      });

      expect(liveApiCall).not.toHaveBeenCalledWith("set_or_delete_cue");
      expect(result.locator).toStrictEqual({
        operation: "skipped",
        reason: "no_locators_found",
        name: "NonExistent",
      });
    });
  });

  describe("rename locator", () => {
    beforeEach(() => {
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [0];
        if (prop === "cue_points") return children("cue1", "cue2");

        if (this._path === "id cue1" && prop === "time") return [0];

        if (this._path === "id cue2" && prop === "time") return [16];

        return [0];
      });
    });

    it("should rename locator by ID", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "locator-0",
        locatorName: "New Intro",
      });

      expect(liveApiSet).toHaveBeenCalledWith("name", "New Intro");
      expect(result.locator).toStrictEqual({
        operation: "renamed",
        id: "locator-0",
        name: "New Intro",
      });
    });

    it("should rename locator by time", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorTime: "5|1",
        locatorName: "New Verse",
      });

      expect(liveApiSet).toHaveBeenCalledWith("name", "New Verse");
      expect(result.locator).toStrictEqual({
        operation: "renamed",
        id: "locator-1",
        name: "New Verse",
      });
    });

    it("should skip if locatorName is missing for rename", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "locator-0",
      });

      expect(result.locator).toStrictEqual({
        operation: "skipped",
        reason: "missing_locatorName",
      });
    });

    it("should skip if no identifier provided for rename", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorName: "New Name",
      });

      expect(result.locator).toStrictEqual({
        operation: "skipped",
        reason: "missing_identifier",
      });
    });

    it("should skip if locator ID not found for rename", async () => {
      const result = await updateLiveSet({
        locatorOperation: "rename",
        locatorId: "locator-99",
        locatorName: "New Name",
      });

      expect(result.locator).toStrictEqual({
        operation: "skipped",
        reason: "locator_not_found",
        id: "locator-99",
      });
    });
  });

  describe("combined with other operations", () => {
    it("should allow locator operation with tempo change", async () => {
      let locatorCreated = false;

      liveApiGet.mockImplementation(function (prop) {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
        if (prop === "is_playing") return [0];

        if (prop === "cue_points") {
          return locatorCreated ? children("new_cue") : children();
        }

        if (prop === "time") return [0];

        return [0];
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "set_or_delete_cue") {
          locatorCreated = true;
        }
      });

      const result = await updateLiveSet({
        tempo: 140,
        locatorOperation: "create",
        locatorTime: "1|1",
      });

      expect(result.tempo).toBe(140);
      expect(result.locator).toStrictEqual({
        operation: "created",
        time: "1|1",
        id: "locator-0",
      });
    });
  });
});
