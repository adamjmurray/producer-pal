import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
