import { beforeEach, describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/v8-max-console.js";
import "#src/live-api-adapter/live-api-extensions.js";
import {
  children,
  liveApiGet,
  liveApiId,
  liveApiType,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.js";
import { deleteObject } from "./delete.js";

describe("deleteObject device path error cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should warn when device path through drum pad does not exist", () => {
    const consoleSpy = vi.spyOn(console, "error");
    const drumRackPath = "live_set tracks 0 devices 0";
    const chainId = "chain-1";

    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === drumRackPath) return "drum-rack";
      if (this._id?.startsWith("id ")) return this._id.slice(3);

      return this._id;
    });
    liveApiType.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._id === chainId) return "DrumChain";
      if (this._path === drumRackPath) return "DrumGroupDevice";
    });
    liveApiGet.mockImplementation(function (this: MockLiveAPIContext, prop) {
      const id = this._id ?? this.id;

      if (
        (this._path === drumRackPath || id === "drum-rack") &&
        prop === "chains"
      ) {
        return children(chainId);
      }

      if (this._path === drumRackPath && prop === "can_have_drum_pads") {
        return [1];
      }

      if (id === chainId) {
        if (prop === "in_note") return [36]; // C1
        if (prop === "devices") return []; // No devices in chain
      }

      return [];
    });

    // Path goes to drum pad chain, then asks for device 0 which doesn't exist
    expect(() =>
      deleteObject({ path: "t0/d0/pC1/c0/d0", type: "device" }),
    ).toThrow("delete failed: ids or path is required");

    expect(consoleSpy).toHaveBeenCalledWith(
      'delete: device at path "t0/d0/pC1/c0/d0" does not exist',
    );
  });

  it("should warn when device type requested but path resolves to chain", () => {
    const consoleSpy = vi.spyOn(console, "error");

    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "live_set tracks 0 devices 0") return "device_0";
      if (this._path === "live_set tracks 0 devices 0 chains 0")
        return "chain_0";

      return this._id;
    });
    liveApiType.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "live_set tracks 0 devices 0") return "Device";
      if (this._path === "live_set tracks 0 devices 0 chains 0") return "Chain";
      if (this._id === "device_0") return "Device";
      if (this._id === "chain_0") return "Chain";
    });
    liveApiGet.mockImplementation(function (this: MockLiveAPIContext, prop) {
      if (this._path === "live_set tracks 0 devices 0" && prop === "chains") {
        return children("chain_0");
      }

      return [];
    });

    // Path t0/d0/c0 resolves to chain, not device
    expect(() => deleteObject({ path: "t0/d0/c0", type: "device" })).toThrow(
      "delete failed: ids or path is required",
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      'delete: path "t0/d0/c0" resolves to chain, not device',
    );
  });

  it("should warn and skip when path resolution throws an error", () => {
    const consoleSpy = vi.spyOn(console, "error");

    // Path with invalid format that causes resolvePathToLiveApi to throw
    // "t0/p" is invalid because drum pad notation requires a note (like "pC1")
    expect(() => deleteObject({ path: "t0/d0/p", type: "device" })).toThrow(
      "delete failed: ids or path is required",
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      "delete: Invalid drum pad note in path: t0/d0/p",
    );
  });

  it("should warn when direct device path does not exist", () => {
    const consoleSpy = vi.spyOn(console, "error");

    // Mock liveApiId to return "0" for non-existent device (exists() checks id !== "0")
    liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._path === "live_set tracks 0 devices 0") return "0";

      return this._id;
    });

    expect(() => deleteObject({ path: "t0/d0", type: "device" })).toThrow(
      "delete failed: ids or path is required",
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      'delete: device at path "t0/d0" does not exist',
    );
  });
});
