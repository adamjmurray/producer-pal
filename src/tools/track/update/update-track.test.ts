// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type MockObjectHandle,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { MONITORING_STATE } from "#src/tools/constants.ts";
import { updateTrack } from "./update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateTrack", () => {
  let track123: MockObjectHandle;
  let track456: MockObjectHandle;
  let track789: MockObjectHandle;

  beforeEach(() => {
    track123 = registerMockObject("123", { path: "live_set tracks 0" });
    track456 = registerMockObject("456", { path: "live_set tracks 1" });
    track789 = registerMockObject("789", { path: "live_set tracks 2" });
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

    expect(track123.set).toHaveBeenCalledWith("name", "Updated Track");
    expect(track123.set).toHaveBeenCalledWith("color", 16711680);
    expect(track123.set).toHaveBeenCalledWith("mute", true);
    expect(track123.set).toHaveBeenCalledWith("solo", false);
    expect(track123.set).toHaveBeenCalledWith("arm", true);
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should update multiple tracks by comma-separated IDs", () => {
    const result = updateTrack({
      ids: "123, 456",
      color: "#00FF00",
      mute: true,
    });

    expect(track123.set).toHaveBeenCalledWith("color", 65280);
    expect(track123.set).toHaveBeenCalledWith("mute", true);
    expect(track123.set).toHaveBeenCalledTimes(2);
    expect(track456.set).toHaveBeenCalledTimes(2);

    expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should handle 'id ' prefixed track IDs", () => {
    const result = updateTrack({
      ids: "id 123",
      name: "Prefixed ID Track",
    });

    expect(track123.set).toHaveBeenCalledWith("name", "Prefixed ID Track");
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should not update properties when not provided", () => {
    const result = updateTrack({
      ids: "123",
      name: "Only Name Update",
    });

    expect(track123.set).toHaveBeenCalledWith("name", "Only Name Update");
    expect(track123.set).toHaveBeenCalledTimes(1);
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should handle boolean false values correctly", () => {
    const result = updateTrack({
      ids: "123",
      mute: false,
      solo: false,
      arm: false,
    });

    expect(track123.set).toHaveBeenCalledWith("mute", false);
    expect(track123.set).toHaveBeenCalledWith("solo", false);
    expect(track123.set).toHaveBeenCalledWith("arm", false);
    expect(result).toStrictEqual({ id: "123" });
  });

  it("should throw error when ids is missing", () => {
    expect(() =>
      updateTrack({} as unknown as Parameters<typeof updateTrack>[0]),
    ).toThrow("updateTrack failed: ids is required");
    expect(() =>
      updateTrack({ name: "Test" } as unknown as Parameters<
        typeof updateTrack
      >[0]),
    ).toThrow("updateTrack failed: ids is required");
  });

  it("should log warning when track ID doesn't exist", () => {
    mockNonExistentObjects();

    const result = updateTrack({ ids: "nonexistent" });

    expect(result).toStrictEqual([]);
    expect(outlet).toHaveBeenCalledWith(
      1,
      'updateTrack: id "nonexistent" does not exist',
    );
  });

  it("should skip invalid track IDs in comma-separated list and update valid ones", () => {
    mockNonExistentObjects();

    const result = updateTrack({ ids: "123, nonexistent", name: "Test" });

    expect(result).toStrictEqual({ id: "123" });
    expect(outlet).toHaveBeenCalledWith(
      1,
      'updateTrack: id "nonexistent" does not exist',
    );
    expect(track123.set).toHaveBeenCalledWith("name", "Test");
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

    expect(track123.set).toHaveBeenCalledTimes(1);
    expect(track456.set).toHaveBeenCalledTimes(1);
    expect(track789.set).toHaveBeenCalledTimes(1);
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

      expect(track123.set).toHaveBeenCalledWith(
        "input_routing_type",
        '{"input_routing_type":{"identifier":17}}',
      );
      expect(track123.set).toHaveBeenCalledWith(
        "input_routing_channel",
        '{"input_routing_channel":{"identifier":1}}',
      );
      expect(track123.set).toHaveBeenCalledWith(
        "output_routing_type",
        '{"output_routing_type":{"identifier":25}}',
      );
      expect(track123.set).toHaveBeenCalledWith(
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

      expect(track123.set).toHaveBeenCalledWith("current_monitoring_state", 1);

      expect(result).toStrictEqual({ id: "123" });
    });

    it("should update monitoring state for all valid values", () => {
      // Test IN state
      updateTrack({
        ids: "123",
        monitoringState: MONITORING_STATE.IN,
      });
      expect(track123.set).toHaveBeenCalledWith("current_monitoring_state", 0);

      // Test OFF state
      updateTrack({
        ids: "456",
        monitoringState: MONITORING_STATE.OFF,
      });
      expect(track456.set).toHaveBeenCalledWith("current_monitoring_state", 2);
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

      expect(track123.set).toHaveBeenCalledWith("name", "Test Track");
      expect(track123.set).toHaveBeenCalledWith("color", 16711680);
      expect(track123.set).toHaveBeenCalledWith("mute", true);
      expect(track123.set).toHaveBeenCalledWith(
        "input_routing_type",
        '{"input_routing_type":{"identifier":17}}',
      );
      expect(track123.set).toHaveBeenCalledWith("current_monitoring_state", 0);

      expect(result).toStrictEqual({ id: "123" });
    });

    it("should handle routing properties in bulk operations", () => {
      const result = updateTrack({
        ids: "123, 456",
        outputRoutingTypeId: "25",
        monitoringState: MONITORING_STATE.AUTO,
      });

      expect(track123.set).toHaveBeenCalledWith(
        "output_routing_type",
        '{"output_routing_type":{"identifier":25}}',
      );
      expect(track456.set).toHaveBeenCalledWith(
        "output_routing_type",
        '{"output_routing_type":{"identifier":25}}',
      );
      expect(track123.set).toHaveBeenCalledWith("current_monitoring_state", 1);
      expect(track456.set).toHaveBeenCalledWith("current_monitoring_state", 1);

      expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
    });

    it("should not update routing properties when not provided", () => {
      const result = updateTrack({
        ids: "123",
        name: "Only Name Update",
      });

      // Should only have the name call, no routing calls
      expect(track123.set).toHaveBeenCalledTimes(1);
      expect(track123.set).toHaveBeenCalledWith("name", "Only Name Update");

      expect(result).toStrictEqual({ id: "123" });
    });
  });

  describe("arrangementFollower parameter", () => {
    it("should set arrangementFollower to true (track follows arrangement)", () => {
      const result = updateTrack({
        ids: "123",
        arrangementFollower: true,
      });

      expect(track123.set).toHaveBeenCalledWith("back_to_arranger", 0);

      expect(result).toStrictEqual({ id: "123" });
    });

    it("should set arrangementFollower to false (track doesn't follow arrangement)", () => {
      const result = updateTrack({
        ids: "123",
        arrangementFollower: false,
      });

      expect(track123.set).toHaveBeenCalledWith("back_to_arranger", 1);

      expect(result).toStrictEqual({ id: "123" });
    });

    it("should set arrangementFollower for multiple tracks", () => {
      const result = updateTrack({
        ids: "123,456",
        arrangementFollower: true,
      });

      expect(track123.set).toHaveBeenCalledWith("back_to_arranger", 0);
      expect(track456.set).toHaveBeenCalledWith("back_to_arranger", 0);

      expect(result).toStrictEqual([{ id: "123" }, { id: "456" }]);
    });

    it("should combine arrangementFollower with other parameters", () => {
      const result = updateTrack({
        ids: "123",
        name: "Updated Track",
        mute: true,
        arrangementFollower: false,
      });

      expect(track123.set).toHaveBeenCalledWith("name", "Updated Track");
      expect(track123.set).toHaveBeenCalledWith("mute", true);
      expect(track123.set).toHaveBeenCalledWith("back_to_arranger", 1);

      expect(result).toStrictEqual({ id: "123" });
    });
  });

  describe("color quantization verification", () => {
    it("should emit warning when color is quantized by Live", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.ts");
      const consoleSpy = vi.spyOn(consoleModule, "warn");

      // Override get to return quantized color (different from input)
      track123.get.mockImplementation((prop: string) => {
        if (prop === "color") {
          return [16725558]; // #FF3636 (quantized from #FF0000)
        }

        return [0];
      });

      updateTrack({
        ids: "123",
        color: "#FF0000",
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Requested track color #FF0000 was mapped to nearest palette color #FF3636. Live uses a fixed color palette.",
      );

      consoleSpy.mockRestore();
    });

    it("should not emit warning when color matches exactly", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.ts");
      const consoleSpy = vi.spyOn(consoleModule, "warn");

      // Override get to return exact color (same as input)
      track123.get.mockImplementation((prop: string) => {
        if (prop === "color") {
          return [16711680]; // #FF0000 (exact match)
        }

        return [0];
      });

      updateTrack({
        ids: "123",
        color: "#FF0000",
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should emit warning for each track when updating multiple tracks", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.ts");
      const consoleSpy = vi.spyOn(consoleModule, "warn");

      const colorMock = (prop: string) => {
        if (prop === "color") {
          return [1768495]; // #1AFC2F (quantized from #00FF00)
        }

        return [0];
      };

      track123.get.mockImplementation(colorMock);
      track456.get.mockImplementation(colorMock);

      updateTrack({
        ids: "123,456",
        color: "#00FF00",
      });

      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenNthCalledWith(
        1,
        "Requested track color #00FF00 was mapped to nearest palette color #1AFC2F. Live uses a fixed color palette.",
      );
      expect(consoleSpy).toHaveBeenNthCalledWith(
        2,
        "Requested track color #00FF00 was mapped to nearest palette color #1AFC2F. Live uses a fixed color palette.",
      );

      consoleSpy.mockRestore();
    });

    it("should not verify color if color parameter is not provided", async () => {
      const consoleModule = await import("#src/shared/v8-max-console.ts");
      const consoleSpy = vi.spyOn(consoleModule, "warn");

      updateTrack({
        ids: "123",
        name: "No color update",
      });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
