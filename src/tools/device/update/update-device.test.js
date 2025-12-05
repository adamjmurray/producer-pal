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
});
