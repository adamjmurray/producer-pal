import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiId,
  liveApiPath,
  liveApiSet,
} from "../../../test/mock-live-api.js";
import { updateDevice } from "./update-device.js";
import "../../../live-api-adapter/live-api-extensions.js";

describe("updateDevice", () => {
  beforeEach(() => {
    vi.clearAllMocks();

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

  it("should set a single param value", () => {
    const result = updateDevice({
      ids: "123",
      params: '{"789": 0.5}',
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "789" }),
      "value",
      0.5,
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should set multiple param values", () => {
    const result = updateDevice({
      ids: "123",
      params: '{"789": 0.5, "790": 1.0}',
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "789" }),
      "value",
      0.5,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "790" }),
      "value",
      1.0,
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should set param display value", () => {
    const result = updateDevice({
      ids: "123",
      paramDisplayValues: '{"789": "-6 dB"}',
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "789" }),
      "display_value",
      "-6 dB",
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should set both params and paramDisplayValues", () => {
    const result = updateDevice({
      ids: "123",
      params: '{"789": 0.5}',
      paramDisplayValues: '{"790": "50%"}',
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "789" }),
      "value",
      0.5,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "790" }),
      "display_value",
      "50%",
    );
    expect(result).toEqual({ id: "123" });
  });

  it("should log error for invalid param ID but continue", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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

  it("should throw error for invalid JSON in paramDisplayValues", () => {
    expect(() =>
      updateDevice({
        ids: "123",
        paramDisplayValues: "not valid json",
      }),
    ).toThrow();
  });
});
