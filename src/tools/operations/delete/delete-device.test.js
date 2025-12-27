import { beforeEach, describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/v8-max-console.js";
import {
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "../../../test/mock-live-api.js";
import { deleteObject } from "./delete.js";

describe("deleteObject device deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete a device from a regular track", () => {
    const id = "device_1";
    const path = "live_set tracks 0 devices 1";
    liveApiId.mockImplementation(function () {
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === id) {
        return path;
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === id) {
        return "Device";
      }
    });

    const result = deleteObject({ ids: id, type: "device" });

    expect(result).toEqual({ id, type: "device", deleted: true });
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0" }),
      "delete_device",
      1,
    );
  });

  it("should delete a device from a return track", () => {
    const id = "device_2";
    const path = "live_set return_tracks 0 devices 1";
    liveApiId.mockImplementation(function () {
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === id) {
        return path;
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === id) {
        return "Device";
      }
    });

    const result = deleteObject({ ids: id, type: "device" });

    expect(result).toEqual({ id, type: "device", deleted: true });
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set return_tracks 0" }),
      "delete_device",
      1,
    );
  });

  it("should delete a device from the master track", () => {
    const id = "device_3";
    const path = "live_set master_track devices 0";
    liveApiId.mockImplementation(function () {
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === id) {
        return path;
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === id) {
        return "Device";
      }
    });

    const result = deleteObject({ ids: id, type: "device" });

    expect(result).toEqual({ id, type: "device", deleted: true });
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set master_track" }),
      "delete_device",
      0,
    );
  });

  it("should delete multiple devices", () => {
    const ids = "device_1,device_2";
    liveApiId.mockImplementation(function () {
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "device_1":
          return "live_set tracks 0 devices 0";
        case "device_2":
          return "live_set tracks 1 devices 1";
        default:
          return this._path;
      }
    });
    liveApiType.mockImplementation(function () {
      if (["device_1", "device_2"].includes(this._id)) {
        return "Device";
      }
    });

    const result = deleteObject({ ids, type: "device" });

    expect(result).toEqual([
      { id: "device_1", type: "device", deleted: true },
      { id: "device_2", type: "device", deleted: true },
    ]);
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0" }),
      "delete_device",
      0,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 1" }),
      "delete_device",
      1,
    );
  });

  it("should throw error when device path is malformed", () => {
    const id = "device_0";
    liveApiId.mockImplementation(function () {
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === id) {
        return "invalid_path_without_devices";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === id) {
        return "Device";
      }
    });

    expect(() => deleteObject({ ids: id, type: "device" })).toThrow(
      'delete failed: could not find device index in path "invalid_path_without_devices"',
    );
  });

  describe("nested device deletion", () => {
    it("should delete a device nested in a chain", () => {
      const id = "nested_device";
      const path = "live_set tracks 1 devices 0 chains 2 devices 1";
      liveApiId.mockImplementation(function () {
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._id === id) {
          return path;
        }
        return this._path;
      });
      liveApiType.mockImplementation(function () {
        if (this._id === id) {
          return "Device";
        }
      });

      const result = deleteObject({ ids: id, type: "device" });

      expect(result).toEqual({ id, type: "device", deleted: true });
      // Should call delete_device on the chain, not the track
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 1 devices 0 chains 2",
        }),
        "delete_device",
        1,
      );
    });

    it("should delete a device nested in a return chain", () => {
      const id = "return_chain_device";
      const path = "live_set tracks 0 devices 0 return_chains 1 devices 0";
      liveApiId.mockImplementation(function () {
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._id === id) {
          return path;
        }
        return this._path;
      });
      liveApiType.mockImplementation(function () {
        if (this._id === id) {
          return "Device";
        }
      });

      const result = deleteObject({ ids: id, type: "device" });

      expect(result).toEqual({ id, type: "device", deleted: true });
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 devices 0 return_chains 1",
        }),
        "delete_device",
        0,
      );
    });

    it("should delete a deeply nested device", () => {
      const id = "deep_device";
      // Device inside chain inside chain (rack in a rack)
      const path =
        "live_set tracks 0 devices 0 chains 0 devices 1 chains 0 devices 2";
      liveApiId.mockImplementation(function () {
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._id === id) {
          return path;
        }
        return this._path;
      });
      liveApiType.mockImplementation(function () {
        if (this._id === id) {
          return "Device";
        }
      });

      const result = deleteObject({ ids: id, type: "device" });

      expect(result).toEqual({ id, type: "device", deleted: true });
      // Should call delete_device on the innermost chain
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 devices 0 chains 0 devices 1 chains 0",
        }),
        "delete_device",
        2,
      );
    });
  });

  describe("path-based deletion", () => {
    it("should delete a device by path", () => {
      const deviceId = "device_by_path";
      const devicePath = "live_set tracks 0 devices 1";
      liveApiId.mockImplementation(function () {
        // When looking up by path, return the device ID
        if (this._path === devicePath) {
          return deviceId;
        }
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._id === deviceId || this._path === devicePath) {
          return devicePath;
        }
        return this._path;
      });
      liveApiType.mockImplementation(function () {
        if (this._id === deviceId || this._path === devicePath) {
          return "Device";
        }
      });

      const result = deleteObject({ path: "0/1", type: "device" });

      expect(result).toEqual({ id: deviceId, type: "device", deleted: true });
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "delete_device",
        1,
      );
    });

    it("should delete multiple devices by path", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 devices 0") return "dev_0_0";
        if (this._path === "live_set tracks 1 devices 1") return "dev_1_1";
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._id === "dev_0_0") return "live_set tracks 0 devices 0";
        if (this._id === "dev_1_1") return "live_set tracks 1 devices 1";
        return this._path;
      });
      liveApiType.mockImplementation(function () {
        if (["dev_0_0", "dev_1_1"].includes(this._id)) return "Device";
        if (this._path?.includes("devices")) return "Device";
      });

      const result = deleteObject({ path: "0/0, 1/1", type: "device" });

      expect(result).toEqual([
        { id: "dev_0_0", type: "device", deleted: true },
        { id: "dev_1_1", type: "device", deleted: true },
      ]);
    });

    it("should delete devices from both ids and path", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 devices 0") return "dev_by_path";
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._id === "dev_by_id") return "live_set tracks 1 devices 1";
        if (this._id === "dev_by_path") return "live_set tracks 0 devices 0";
        return this._path;
      });
      liveApiType.mockImplementation(function () {
        if (["dev_by_id", "dev_by_path"].includes(this._id)) return "Device";
        if (this._path?.includes("devices")) return "Device";
      });

      const result = deleteObject({
        ids: "dev_by_id",
        path: "0/0",
        type: "device",
      });

      expect(result).toEqual([
        { id: "dev_by_id", type: "device", deleted: true },
        { id: "dev_by_path", type: "device", deleted: true },
      ]);
    });

    it("should delete nested device by path", () => {
      const devicePath = "live_set tracks 1 devices 0 chains 2 devices 1";
      liveApiId.mockImplementation(function () {
        if (this._path === devicePath) return "nested_dev";
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._id === "nested_dev" || this._path === devicePath) {
          return devicePath;
        }
        return this._path;
      });
      liveApiType.mockImplementation(function () {
        if (this._id === "nested_dev" || this._path === devicePath) {
          return "Device";
        }
      });

      const result = deleteObject({ path: "1/0/2/1", type: "device" });

      expect(result).toEqual({
        id: "nested_dev",
        type: "device",
        deleted: true,
      });
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 1 devices 0 chains 2",
        }),
        "delete_device",
        1,
      );
    });

    it("should skip invalid paths and continue with valid ones", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 devices 0") return "valid_dev";
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._id === "valid_dev") return "live_set tracks 0 devices 0";
        return this._path;
      });
      liveApiType.mockImplementation(function () {
        if (this._id === "valid_dev") return "Device";
        if (this._path === "live_set tracks 0 devices 0") return "Device";
      });

      const result = deleteObject({ path: "0/0, 99/99", type: "device" });

      expect(result).toEqual({
        id: "valid_dev",
        type: "device",
        deleted: true,
      });
    });

    it("should return empty array when all paths are invalid", () => {
      liveApiType.mockReturnValue(undefined);

      const result = deleteObject({ path: "99/99", type: "device" });

      expect(result).toEqual([]);
    });

    it("should warn when path is used with non-device type", () => {
      const consoleSpy = vi.spyOn(console, "error");
      liveApiId.mockImplementation(function () {
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._id === "track_1") return "live_set tracks 0";
        return this._path;
      });
      liveApiType.mockImplementation(function () {
        if (this._id === "track_1") return "Track";
      });

      deleteObject({ ids: "track_1", path: "0/0", type: "track" });

      expect(consoleSpy).toHaveBeenCalledWith(
        'delete: path parameter is only valid for type "device", ignoring paths',
      );
    });
  });
});
