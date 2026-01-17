import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
} from "#src/test/mock-live-api.js";
import { MONITORING_STATE } from "#src/tools/constants.js";
import { updateTrack } from "./update-track.js";
import "#src/live-api-adapter/live-api-extensions.js";

describe("updateTrack", () => {
  beforeEach(() => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id 456":
          return "456";
        case "id 789":
          return "789";
        default:
          return this._id;
      }
    });

    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "123":
          return "live_set tracks 0";
        case "456":
          return "live_set tracks 1";
        case "789":
          return "live_set tracks 2";
        default:
          return this._path;
      }
    });
  });

  it("should update a single track by ID", () => {
    const result = updateTrack({
      ids: "123",
      name: "Updated Track",
      color: "#FF0000",
      mute: true,
      solo: false,
      arm: true,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Updated Track",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "color",
      16711680,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "mute",
      true,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "solo",
      false,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "arm",
      true,
    );
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should update multiple tracks by comma-separated IDs", () => {
    const result = updateTrack({
      ids: "123, 456",
      color: "#00FF00",
      mute: true,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "color",
      65280,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "mute",
      true,
    );
    expect(liveApiSet).toHaveBeenCalledTimes(4); // 2 calls per track

    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should handle 'id ' prefixed track IDs", () => {
    const result = updateTrack({
      ids: "id 123",
      name: "Prefixed ID Track",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Prefixed ID Track",
    );
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should not update properties when not provided", () => {
    const result = updateTrack({
      ids: "123",
      name: "Only Name Update",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Only Name Update",
    );
    expect(liveApiSet).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should handle boolean false values correctly", () => {
    const result = updateTrack({
      ids: "123",
      mute: false,
      solo: false,
      arm: false,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "mute",
      false,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "solo",
      false,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "arm",
      false,
    );
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should throw error when ids is missing", () => {
    expect(() => updateTrack({})).toThrow(
      "updateTrack failed: ids is required",
    );
    expect(() => updateTrack({ name: "Test" })).toThrow(
      "updateTrack failed: ids is required",
    );
  });

  it("should log warning when track ID doesn't exist", () => {
    liveApiId.mockReturnValue("id 0"); // non-existent
    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = updateTrack({ ids: "nonexistent" });

    expect(result).toStrictEqual([]); // Empty array, no valid tracks
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'updateTrack: id "nonexistent" does not exist',
    );
  });

  it("should skip invalid track IDs in comma-separated list and update valid ones", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id nonexistent":
          return "id 0"; // non-existent
        default:
          return "id 0";
      }
    });
    liveApiType.mockReturnValue("Track");

    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = updateTrack({ ids: "123, nonexistent", name: "Test" });

    expect(result).toStrictEqual({ id: "123" }); // Only valid track updated
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'updateTrack: id "nonexistent" does not exist',
    );
    expect(liveApiSet).toHaveBeenCalledWith("name", "Test");
  });

  it("should return single object for single ID and array for comma-separated IDs", () => {
    const singleResult = updateTrack({ ids: "123", name: "Single" });
    const arrayResult = updateTrack({ ids: "123, 456", name: "Multiple" });

    expect(singleResult).toStrictEqual({ id: "123" });
    expect(arrayResult).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should handle whitespace in comma-separated IDs", () => {
    const result = updateTrack({
      ids: " 123 , 456 , 789 ",
      color: "#0000FF",
    });

    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }, { id: "789" }]);
  });

  it("should filter out empty IDs from comma-separated list", () => {
    const result = updateTrack({
      ids: "123,,456,  ,789",
      name: "Filtered",
    });

    expect(liveApiSet).toHaveBeenCalledTimes(3); // Only 3 valid IDs
    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }, { id: "789" }]);
  });

  describe("routing properties", () => {
    it("should update routing properties when provided", () => {
      const result = updateTrack({
        ids: "123",
        inputRoutingTypeId: "17",
        inputRoutingChannelId: "1",
        outputRoutingTypeId: "25",
        outputRoutingChannelId: "26",
      });

      // Verify setProperty calls with proper JSON format
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "input_routing_type",
        '{"input_routing_type":{"identifier":17}}',
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "input_routing_channel",
        '{"input_routing_channel":{"identifier":1}}',
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "output_routing_type",
        '{"output_routing_type":{"identifier":25}}',
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "output_routing_channel",
        '{"output_routing_channel":{"identifier":26}}',
      );

      expect(result).toStrictEqual({ id: "123" });
    });

    it("should update monitoring state when provided", () => {
      const result = updateTrack({
        ids: "123",
        monitoringState: MONITORING_STATE.AUTO,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "current_monitoring_state",
        1, // LIVE_API_MONITORING_STATE_AUTO
      );

      expect(result).toStrictEqual({ id: "123" });
    });

    it("should update monitoring state for all valid values", () => {
      // Test IN state
      updateTrack({
        ids: "123",
        monitoringState: MONITORING_STATE.IN,
      });
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "current_monitoring_state",
        0, // LIVE_API_MONITORING_STATE_IN
      );

      // Test OFF state
      updateTrack({
        ids: "456",
        monitoringState: MONITORING_STATE.OFF,
      });
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "456" }),
        "current_monitoring_state",
        2, // LIVE_API_MONITORING_STATE_OFF
      );
    });

    it("should warn and skip for invalid monitoring state", () => {
      // Should not throw, just warn and skip the monitoring state update
      const result = updateTrack({
        ids: "123",
        monitoringState: "invalid",
      });

      expect(result).toStrictEqual({ id: "123" });
    });

    it("should handle mixed routing and basic properties", () => {
      const result = updateTrack({
        ids: "123",
        name: "Test Track",
        color: "#FF0000",
        mute: true,
        inputRoutingTypeId: "17",
        monitoringState: MONITORING_STATE.IN,
      });

      // Verify basic properties
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "name",
        "Test Track",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "color",
        16711680,
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "mute",
        true,
      );

      // Verify routing properties
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "input_routing_type",
        '{"input_routing_type":{"identifier":17}}',
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "current_monitoring_state",
        0,
      );

      expect(result).toStrictEqual({ id: "123" });
    });

    it("should handle routing properties in bulk operations", () => {
      const result = updateTrack({
        ids: "123, 456",
        outputRoutingTypeId: "25",
        monitoringState: MONITORING_STATE.AUTO,
      });

      // Verify both tracks get updated
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "output_routing_type",
        '{"output_routing_type":{"identifier":25}}',
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "456" }),
        "output_routing_type",
        '{"output_routing_type":{"identifier":25}}',
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "current_monitoring_state",
        1,
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "456" }),
        "current_monitoring_state",
        1,
      );

      expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
    });

    it("should not update routing properties when not provided", () => {
      const result = updateTrack({
        ids: "123",
        name: "Only Name Update",
      });

      // Should only have the name call, no routing calls
      expect(liveApiSet).toHaveBeenCalledTimes(1);
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "name",
        "Only Name Update",
      );

      expect(result).toStrictEqual({ id: "123" });
    });
  });

  describe("arrangementFollower parameter", () => {
    it("should set arrangementFollower to true (track follows arrangement)", () => {
      const result = updateTrack({
        ids: "123",
        arrangementFollower: true,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "back_to_arranger",
        0, // 0 = following arrangement
      );

      expect(result).toStrictEqual({ id: "123" });
    });

    it("should set arrangementFollower to false (track doesn't follow arrangement)", () => {
      const result = updateTrack({
        ids: "123",
        arrangementFollower: false,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "back_to_arranger",
        1, // 1 = not following arrangement
      );

      expect(result).toStrictEqual({ id: "123" });
    });

    it("should set arrangementFollower for multiple tracks", () => {
      const result = updateTrack({
        ids: "123,456",
        arrangementFollower: true,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "back_to_arranger",
        0,
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "456" }),
        "back_to_arranger",
        0,
      );

      expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
    });

    it("should combine arrangementFollower with other parameters", () => {
      const result = updateTrack({
        ids: "123",
        name: "Updated Track",
        mute: true,
        arrangementFollower: false,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "name",
        "Updated Track",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "mute",
        true,
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "123" }),
        "back_to_arranger",
        1,
      );

      expect(result).toStrictEqual({ id: "123" });
    });
  });

  describe("color quantization verification", () => {
    it("should emit warning when color is quantized by Live", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.js");
      const consoleSpy = vi.spyOn(consoleModule, "error");

      // Mock getProperty to return quantized color (different from input)
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "color") {
          return [16725558]; // #FF3636 (quantized from #FF0000)
        }

        return null;
      });

      updateTrack({
        ids: "123",
        color: "#FF0000",
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Note: Requested track color #FF0000 was mapped to nearest palette color #FF3636. Live uses a fixed color palette.",
      );

      consoleSpy.mockRestore();
    });

    it("should not emit warning when color matches exactly", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.js");
      const consoleSpy = vi.spyOn(consoleModule, "error");

      // Mock getProperty to return exact color (same as input)
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "color") {
          return [16711680]; // #FF0000 (exact match)
        }

        return null;
      });

      updateTrack({
        ids: "123",
        color: "#FF0000",
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should emit warning for each track when updating multiple tracks", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.js");
      const consoleSpy = vi.spyOn(consoleModule, "error");

      // Mock getProperty to return quantized color
      liveApiGet.mockImplementation(function (prop) {
        if (prop === "color") {
          return [1768495]; // #1AFC2F (quantized from #00FF00)
        }

        return null;
      });

      updateTrack({
        ids: "123,456",
        color: "#00FF00",
      });

      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenNthCalledWith(
        1,
        "Note: Requested track color #00FF00 was mapped to nearest palette color #1AFC2F. Live uses a fixed color palette.",
      );
      expect(consoleSpy).toHaveBeenNthCalledWith(
        2,
        "Note: Requested track color #00FF00 was mapped to nearest palette color #1AFC2F. Live uses a fixed color palette.",
      );

      consoleSpy.mockRestore();
    });

    it("should not verify color if color parameter is not provided", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.js");
      const consoleSpy = vi.spyOn(consoleModule, "error");

      updateTrack({
        ids: "123",
        name: "No color update",
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
