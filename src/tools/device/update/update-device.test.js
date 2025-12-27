import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
} from "../../../test/mock-live-api.js";
import { updateDevice } from "./update-device.js";
import "../../../live-api-adapter/live-api-extensions.js";

describe("updateDevice", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: all objects are Device type (valid for update)
    liveApiType.mockImplementation(() => "Device");

    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id 456":
          return "456";
        case "id 789":
          return "789";
        case "id 790":
          return "790";
        case "id 791":
          return "791";
        case "id 792":
          return "792";
        case "live_set tracks 0 devices 0 view":
          return "view-123";
        case "live_set tracks 0 devices 1 view":
          return "view-456";
        default:
          return "0";
      }
    });

    liveApiPath.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "live_set tracks 0 devices 0";
        case "id 456":
          return "live_set tracks 0 devices 1";
        default:
          return this._path;
      }
    });

    // Default mocks for param types
    liveApiGet.mockImplementation(function (prop) {
      if (prop === "is_quantized") return [0];
      if (prop === "value") return [0.5];
      if (prop === "min") return [0];
      if (prop === "max") return [1];
      return [0];
    });

    liveApiCall.mockImplementation(function (method, value) {
      if (method === "str_for_value") {
        // Default to numeric label
        return String(value);
      }
      return null;
    });
  });

  it("should update a single device name", () => {
    const result = updateDevice({
      ids: "123",
      name: "My Device",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "My Device",
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should update collapsed state to true", () => {
    const result = updateDevice({
      ids: "123",
      collapsed: true,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "view-123" }),
      "is_collapsed",
      1,
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should update collapsed state to false", () => {
    const result = updateDevice({
      ids: "123",
      collapsed: false,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "view-123" }),
      "is_collapsed",
      0,
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should update both name and collapsed", () => {
    const result = updateDevice({
      ids: "123",
      name: "Collapsed Device",
      collapsed: true,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Collapsed Device",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "view-123" }),
      "is_collapsed",
      1,
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should update multiple devices", () => {
    const result = updateDevice({
      ids: "123, 456",
      name: "Same Name",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Same Name",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "456" }),
      "name",
      "Same Name",
    );
    expect(result).toEqual([{ id: "123" }, { id: "456" }]);
  });

  it("should skip non-existent devices with warning", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = updateDevice({
      ids: "123, 999, 456",
      name: "Test",
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      'updateDevice: id "999" does not exist',
    );
    expect(result).toEqual([{ id: "123" }, { id: "456" }]);

    consoleSpy.mockRestore();
  });

  it("should return empty array when all devices are invalid", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = updateDevice({
      ids: "998, 999",
      name: "Test",
    });

    expect(result).toEqual([]);

    consoleSpy.mockRestore();
  });

  it("should handle 'id ' prefixed device IDs", () => {
    const result = updateDevice({
      ids: "id 123",
      name: "Prefixed ID",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "123" }),
      "name",
      "Prefixed ID",
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should not call set when no properties provided", () => {
    const result = updateDevice({
      ids: "123",
    });

    expect(liveApiSet).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "123" });
  });

  describe("params - numeric values", () => {
    it("should set display_value for numeric params", () => {
      const result = updateDevice({
        ids: "123",
        params: '{"789": 1000}',
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 789" }),
        "display_value",
        1000,
      );
      expect(result).toEqual({ id: "123" });
    });

    it("should set multiple param values", () => {
      const result = updateDevice({
        ids: "123",
        params: '{"789": 500, "790": 1000}',
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 789" }),
        "display_value",
        500,
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 790" }),
        "display_value",
        1000,
      );
      expect(result).toEqual({ id: "123" });
    });

    it("should log error for invalid param ID but continue", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "123",
        params: '{"999": 0.5}',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'updateDevice: param id "999" does not exist',
      );
      expect(result).toEqual({ id: "123" });

      consoleSpy.mockRestore();
    });

    it("should throw error for invalid JSON in params", () => {
      expect(() =>
        updateDevice({
          ids: "123",
          params: "not valid json",
        }),
      ).toThrow();
    });
  });

  describe("params - enum values", () => {
    beforeEach(() => {
      liveApiGet.mockImplementation(function (prop) {
        if (this._path === "id 791") {
          if (prop === "is_quantized") return [1];
          if (prop === "value_items") return ["Repitch", "Fade", "Jump"];
        }
        if (prop === "is_quantized") return [0];
        return [0];
      });
    });

    it("should convert string value to index for quantized param", () => {
      const result = updateDevice({
        ids: "123",
        params: '{"791": "Fade"}',
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 791" }),
        "value",
        1,
      );
      expect(result).toEqual({ id: "123" });
    });

    it("should log error for invalid enum value", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "123",
        params: '{"791": "InvalidValue"}',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'updateDevice: "InvalidValue" is not valid. Options: Repitch, Fade, Jump',
      );
      expect(liveApiSet).not.toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 791" }),
        "value",
        expect.anything(),
      );
      expect(result).toEqual({ id: "123" });

      consoleSpy.mockRestore();
    });
  });

  describe("params - note values", () => {
    it("should convert note name to MIDI number (Live convention: C3=60)", () => {
      const result = updateDevice({
        ids: "123",
        params: '{"789": "C3"}',
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 789" }),
        "value",
        60,
      );
      expect(result).toEqual({ id: "123" });
    });

    it("should handle sharps and flats", () => {
      updateDevice({
        ids: "123",
        params: '{"789": "F#-1"}',
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 789" }),
        "value",
        18,
      );
    });
  });

  describe("params - pan values", () => {
    beforeEach(() => {
      liveApiGet.mockImplementation(function (prop) {
        if (this._path === "id 792") {
          if (prop === "is_quantized") return [0];
          if (prop === "value") return [0.5];
          if (prop === "min") return [0];
          if (prop === "max") return [1];
        }
        if (prop === "is_quantized") return [0];
        return [0];
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "str_for_value" && this._path === "id 792") {
          return "C"; // Pan label indicating center
        }
        return "0";
      });
    });

    it("should convert -1 to 1 range to internal range for pan", () => {
      const result = updateDevice({
        ids: "123",
        params: '{"792": -0.5}',
      });

      // -0.5 → internal: ((-0.5 + 1) / 2) * (1 - 0) + 0 = 0.25
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 792" }),
        "value",
        0.25,
      );
      expect(result).toEqual({ id: "123" });
    });

    it("should handle full left pan", () => {
      updateDevice({
        ids: "123",
        params: '{"792": -1}',
      });

      // -1 → internal: 0
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 792" }),
        "value",
        0,
      );
    });

    it("should handle full right pan", () => {
      updateDevice({
        ids: "123",
        params: '{"792": 1}',
      });

      // 1 → internal: 1
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 792" }),
        "value",
        1,
      );
    });
  });

  // macroVariation tests are in update-device-macro-variation.test.js
  // Chain and DrumPad tests are in update-device-chains.test.js

  describe("macroCount", () => {
    beforeEach(() => {
      // id 123 is a RackDevice (supports macroCount), id 456 is a regular Device
      liveApiType.mockImplementation(function () {
        return this._path === "id 123" ? "RackDevice" : "Device";
      });

      liveApiGet.mockImplementation(function (prop) {
        if (this._path === "id 123") {
          if (prop === "can_have_chains") return [1];
          if (prop === "visible_macro_count") return [4];
        }
        if (this._path === "id 456") {
          if (prop === "can_have_chains") return [0];
        }
        return [0];
      });
    });

    it("should reject non-rack devices with error", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "456",
        macroCount: 8,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "updateDevice: 'macroCount' not applicable to Device",
      );
      expect(liveApiCall).not.toHaveBeenCalled();
      expect(result).toEqual({ id: "456" });

      consoleSpy.mockRestore();
    });

    it("should call add_macro when increasing count (macros added in pairs)", () => {
      const result = updateDevice({
        ids: "123",
        macroCount: 8, // 4 -> 8 = diff of 4 = 2 pairs
      });

      expect(liveApiCall).toHaveBeenCalledTimes(2);
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 123" }),
        "add_macro",
      );
      expect(result).toEqual({ id: "123" });
    });

    it("should call remove_macro when decreasing count (macros removed in pairs)", () => {
      const result = updateDevice({
        ids: "123",
        macroCount: 0, // 4 -> 0 = diff of 4 = 2 pairs
      });

      expect(liveApiCall).toHaveBeenCalledTimes(2);
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 123" }),
        "remove_macro",
      );
      expect(result).toEqual({ id: "123" });
    });

    it("should do nothing when count matches", () => {
      const result = updateDevice({
        ids: "123",
        macroCount: 4, // 4 -> 4 = no change
      });

      expect(liveApiCall).not.toHaveBeenCalled();
      expect(result).toEqual({ id: "123" });
    });

    it("should round odd counts up to next even and warn", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "123",
        macroCount: 7, // rounds to 8, 4 -> 8 = 2 pairs
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "updateDevice: macro count rounded from 7 to 8 (macros come in pairs)",
      );
      expect(liveApiCall).toHaveBeenCalledTimes(2);
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 123" }),
        "add_macro",
      );
      expect(result).toEqual({ id: "123" });

      consoleSpy.mockRestore();
    });
  });

  describe("abCompare", () => {
    beforeEach(() => {
      liveApiGet.mockImplementation(function (prop) {
        // Device with AB Compare support (id 123)
        if (this._path === "id 123") {
          if (prop === "can_compare_ab") return [1];
        }
        // Device without AB Compare support (id 456)
        if (this._path === "id 456") {
          if (prop === "can_compare_ab") return [0];
        }
        return [0];
      });
    });

    it("should reject devices without AB Compare support", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = updateDevice({
        ids: "456",
        abCompare: "b",
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        "updateDevice: A/B Compare not available on this device",
      );
      expect(liveApiSet).not.toHaveBeenCalled();
      expect(liveApiCall).not.toHaveBeenCalled();
      expect(result).toEqual({ id: "456" });

      consoleSpy.mockRestore();
    });

    it("should set is_using_compare_preset_b to 0 for 'a'", () => {
      const result = updateDevice({
        ids: "123",
        abCompare: "a",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 123" }),
        "is_using_compare_preset_b",
        0,
      );
      expect(result).toEqual({ id: "123" });
    });

    it("should set is_using_compare_preset_b to 1 for 'b'", () => {
      const result = updateDevice({
        ids: "123",
        abCompare: "b",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 123" }),
        "is_using_compare_preset_b",
        1,
      );
      expect(result).toEqual({ id: "123" });
    });

    it("should call save_preset_to_compare_ab_slot for 'save'", () => {
      const result = updateDevice({
        ids: "123",
        abCompare: "save",
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ _path: "id 123" }),
        "save_preset_to_compare_ab_slot",
      );
      expect(result).toEqual({ id: "123" });
    });
  });
});
