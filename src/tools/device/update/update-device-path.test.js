import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiGet,
  liveApiId,
  liveApiSet,
  liveApiType,
} from "#src/test/mock-live-api.js";
import "#src/live-api-adapter/live-api-extensions.js";
import { updateDevice } from "./update-device.js";

describe("updateDevice with path parameter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw error when neither ids nor path is provided", () => {
    expect(() => updateDevice({})).toThrow(
      "Either ids or path must be provided",
    );
  });

  it("should throw error when both ids and path are provided", () => {
    expect(() => updateDevice({ ids: "123", path: "t1/d0" })).toThrow(
      "Provide either ids or path, not both",
    );
  });

  describe("device paths", () => {
    beforeEach(() => {
      liveApiType.mockReturnValue("Device");
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 1 devices 0") return "device-456";
        if (this._path === "live_set tracks 1 devices 0 view")
          return "view-456";
        if (this._path === "live_set return_tracks 0 devices 0")
          return "return-device-123";
        if (this._path === "live_set return_tracks 0 devices 0 view")
          return "view-return-123";
        if (this._path === "live_set master_track devices 0")
          return "master-device-789";
        if (this._path === "live_set master_track devices 0 view")
          return "view-master-789";

        return "0";
      });
    });

    it("should update device by path on regular track", () => {
      const result = updateDevice({ path: "t1/d0", name: "My Device" });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "device-456" }),
        "name",
        "My Device",
      );
      expect(result).toStrictEqual({ id: "device-456" });
    });

    it("should update device collapsed state by path", () => {
      const result = updateDevice({ path: "t1/d0", collapsed: true });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "view-456" }),
        "is_collapsed",
        1,
      );
      expect(result).toStrictEqual({ id: "device-456" });
    });

    it("should return empty array for non-existent device by path", () => {
      liveApiId.mockReturnValue("0");

      const result = updateDevice({ path: "t1/d0", name: "Test" });

      expect(result).toStrictEqual([]);
    });

    it("should update device by path on return track", () => {
      const result = updateDevice({ path: "r0/d0", name: "Return Device" });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "return-device-123" }),
        "name",
        "Return Device",
      );
      expect(result).toStrictEqual({ id: "return-device-123" });
    });

    it("should update device by path on master track", () => {
      const result = updateDevice({ path: "m/d0", name: "Master Device" });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "master-device-789" }),
        "name",
        "Master Device",
      );
      expect(result).toStrictEqual({ id: "master-device-789" });
    });
  });

  describe("chain paths", () => {
    beforeEach(() => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 1 devices 0 chains 0")
          return "chain-123";
        if (this._path === "live_set tracks 1 devices 0 return_chains 0")
          return "return-chain-456";

        return "0";
      });
      liveApiType.mockImplementation(function () {
        if (this._path === "live_set tracks 1 devices 0 chains 0")
          return "Chain";
        if (this._path === "live_set tracks 1 devices 0 return_chains 0")
          return "Chain";

        return "Device";
      });
    });

    it("should update chain by path", () => {
      const result = updateDevice({ path: "t1/d0/c0", name: "My Chain" });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "chain-123" }),
        "name",
        "My Chain",
      );
      expect(result).toStrictEqual({ id: "chain-123" });
    });

    it("should update chain mute state by path", () => {
      const result = updateDevice({ path: "t1/d0/c0", mute: true });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "chain-123" }),
        "mute",
        1,
      );
      expect(result).toStrictEqual({ id: "chain-123" });
    });

    it("should update chain solo state by path", () => {
      const result = updateDevice({ path: "t1/d0/c0", solo: true });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "chain-123" }),
        "solo",
        1,
      );
      expect(result).toStrictEqual({ id: "chain-123" });
    });

    it("should update chain color by path", () => {
      const result = updateDevice({ path: "t1/d0/c0", color: "#FF0000" });

      // setColor converts #FF0000 to (0xFF << 16) | (0x00 << 8) | 0x00 = 16711680
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "chain-123" }),
        "color",
        16711680,
      );
      expect(result).toStrictEqual({ id: "chain-123" });
    });

    it("should return empty array for non-existent chain by path", () => {
      liveApiId.mockReturnValue("0");

      const result = updateDevice({ path: "t1/d0/c0", name: "Test" });

      expect(result).toStrictEqual([]);
    });

    it("should update return chain by path", () => {
      const result = updateDevice({ path: "t1/d0/e0", name: "Return Chain" });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "return-chain-456" }),
        "name",
        "Return Chain",
      );
      expect(result).toStrictEqual({ id: "return-chain-456" });
    });
  });

  describe("drum pad paths", () => {
    // Helper functions for drum chain mock property lookups
    const getChainProperty = (id, prop, chainProperties) => {
      const chainProps = chainProperties[id] ?? {};
      const propMap = {
        in_note: [chainProps.inNote ?? 36],
        name: [chainProps.name ?? "Chain"],
        mute: [chainProps.mute ?? 0],
        solo: [chainProps.solo ?? 0],
        devices: (chainProps.deviceIds ?? []).flatMap((d) => ["id", d]),
      };

      return propMap[prop] ?? [];
    };

    const getDeviceProperty = (id, prop, deviceProperties) => {
      const devProps = deviceProperties[id] ?? {};

      if (prop === "name") return [devProps.name ?? "Device"];

      return [];
    };

    const setupDrumPadMocks = (config) => {
      const {
        deviceId = "drum-rack-1",
        chainIds = ["chain-36"],
        chainProperties = {},
        deviceProperties = {},
      } = config;

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 1 devices 0") return deviceId;

        return this._id ?? "0";
      });

      liveApiType.mockImplementation(function () {
        const id = this._id ?? this.id;

        if (id?.startsWith("chain-"))
          return chainProperties[id]?.type ?? "DrumChain";
        if (id?.startsWith("device-")) return "Device";

        return "RackDevice";
      });

      liveApiGet.mockImplementation(function (prop) {
        const id = this._id ?? this.id;

        if (id === deviceId || this._path?.includes("devices 0")) {
          if (prop === "can_have_drum_pads") return [1];
          if (prop === "chains") return chainIds.flatMap((c) => ["id", c]);
        }

        if (id?.startsWith("chain-"))
          return getChainProperty(id, prop, chainProperties);
        if (id?.startsWith("device-"))
          return getDeviceProperty(id, prop, deviceProperties);

        return [];
      });
    };

    it("should update drum chain mute state by path (pNOTE)", () => {
      setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, name: "Kick" } },
      });

      const result = updateDevice({ path: "t1/d0/pC1", mute: true });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "chain-36" }),
        "mute",
        1,
      );
      expect(result).toStrictEqual({ id: "chain-36" });
    });

    it("should update drum chain solo state by path (pNOTE)", () => {
      setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, name: "Kick" } },
      });

      const result = updateDevice({ path: "t1/d0/pC1", solo: true });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "chain-36" }),
        "solo",
        1,
      );
      expect(result).toStrictEqual({ id: "chain-36" });
    });

    it("should return empty array for non-existent drum chain by path", () => {
      setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, name: "Kick" } }, // C1, not C3
      });

      const result = updateDevice({ path: "t1/d0/pC3", mute: true });

      expect(result).toStrictEqual([]);
    });

    it("should update drum chain by path (pNOTE/index)", () => {
      setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, name: "Kick" } },
      });

      const result = updateDevice({ path: "t1/d0/pC1/c0", name: "New Layer" });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "chain-36" }),
        "name",
        "New Layer",
      );
      expect(result).toStrictEqual({ id: "chain-36" });
    });

    it("should update drum chain mute state by path (pNOTE/index)", () => {
      setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, name: "Kick" } },
      });

      const result = updateDevice({ path: "t1/d0/pC1/c0", mute: true });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "chain-36" }),
        "mute",
        1,
      );
      expect(result).toStrictEqual({ id: "chain-36" });
    });

    it("should return empty array for invalid chain index", () => {
      setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, name: "Kick" } },
      });

      const result = updateDevice({ path: "t1/d0/pC1/c5", name: "Test" });

      expect(result).toStrictEqual([]);
    });

    it("should update device inside drum chain by path", () => {
      setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: {
          "chain-36": { inNote: 36, name: "Kick", deviceIds: ["device-1"] },
        },
        deviceProperties: { "device-1": { name: "Simpler" } },
      });

      const result = updateDevice({
        path: "t1/d0/pC1/c0/d0",
        name: "New Simpler",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "device-1" }),
        "name",
        "New Simpler",
      );
      expect(result).toStrictEqual({ id: "device-1" });
    });

    it("should return empty array for invalid device index in drum chain", () => {
      setupDrumPadMocks({
        chainIds: ["chain-36"],
        chainProperties: {
          "chain-36": { inNote: 36, name: "Kick", deviceIds: [] },
        },
      });

      const result = updateDevice({ path: "t1/d0/pC1/c0/d5", name: "Test" });

      expect(result).toStrictEqual([]);
    });
  });

  describe("path validation", () => {
    it("should throw error for empty path (treated as no path)", () => {
      expect(() => updateDevice({ path: "", name: "Test" })).toThrow(
        "Either ids or path must be provided",
      );
    });

    it("should return empty array for track-only path (invalid)", () => {
      const result = updateDevice({ path: "t1", name: "Test" });

      expect(result).toStrictEqual([]);
    });
  });

  describe("multiple comma-separated paths", () => {
    beforeEach(() => {
      liveApiType.mockReturnValue("Device");
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 devices 0") return "device-100";
        if (this._path === "live_set tracks 0 devices 1") return "device-101";
        if (this._path === "live_set tracks 1 devices 0") return "device-200";
        if (this._path === "live_set tracks 1 devices 1") return "0"; // non-existent

        return "0";
      });
    });

    it("should update multiple devices by comma-separated paths", () => {
      const result = updateDevice({
        path: "t0/d0, t0/d1, t1/d0",
        name: "Updated",
      });

      expect(liveApiSet).toHaveBeenCalledTimes(3);
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "device-100" }),
        "name",
        "Updated",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "device-101" }),
        "name",
        "Updated",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "device-200" }),
        "name",
        "Updated",
      );
      expect(result).toStrictEqual([
        { id: "device-100" },
        { id: "device-101" },
        { id: "device-200" },
      ]);
    });

    it("should skip non-existent paths and continue with valid ones", () => {
      const result = updateDevice({
        path: "t0/d0, t1/d1, t1/d0",
        name: "Updated",
      });

      // t1/d1 doesn't exist, but t0/d0 and t1/d0 should be updated
      expect(liveApiSet).toHaveBeenCalledTimes(2);
      expect(result).toStrictEqual([
        { id: "device-100" },
        { id: "device-200" },
      ]);
    });

    it("should return empty array when all paths are invalid", () => {
      liveApiId.mockReturnValue("0"); // All paths non-existent

      const result = updateDevice({ path: "t0/d0, t1/d0", name: "Updated" });

      expect(liveApiSet).not.toHaveBeenCalled();
      expect(result).toStrictEqual([]);
    });

    it("should return single object when only one path provided", () => {
      const result = updateDevice({ path: "t0/d0", name: "Single" });

      expect(result).toStrictEqual({ id: "device-100" });
    });

    it("should return single object when only one path valid out of many", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 devices 0") return "device-100";

        return "0";
      });

      const result = updateDevice({
        path: "t0/d0, t1/d0, t2/d0",
        name: "Updated",
      });

      expect(result).toStrictEqual({ id: "device-100" });
    });

    it("should handle whitespace in comma-separated paths", () => {
      const result = updateDevice({
        path: "  t0/d0  ,  t1/d0  ",
        name: "Trimmed",
      });

      expect(liveApiSet).toHaveBeenCalledTimes(2);
      expect(result).toStrictEqual([
        { id: "device-100" },
        { id: "device-200" },
      ]);
    });

    it("should skip invalid path formats gracefully", () => {
      // Track-only path is invalid, but device paths should work
      const result = updateDevice({
        path: "t0, t0/d0, t1/d0",
        name: "Updated",
      });

      // "t0" is invalid (no device index), but "t0/d0" and "t1/d0" should work
      expect(liveApiSet).toHaveBeenCalledTimes(2);
      expect(result).toStrictEqual([
        { id: "device-100" },
        { id: "device-200" },
      ]);
    });
  });

  describe("multiple paths with mixed types", () => {
    it("should update mixed device and chain types", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 devices 0") return "device-100";
        if (this._path === "live_set tracks 1 devices 0 chains 0")
          return "chain-200";

        return "0";
      });
      liveApiType.mockImplementation(function () {
        if (this._path === "live_set tracks 1 devices 0 chains 0")
          return "Chain";

        return "Device";
      });

      const result = updateDevice({ path: "t0/d0, t1/d0/c0", name: "Mixed" });

      expect(liveApiSet).toHaveBeenCalledTimes(2);
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "device-100" }),
        "name",
        "Mixed",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "chain-200" }),
        "name",
        "Mixed",
      );
      expect(result).toStrictEqual([{ id: "device-100" }, { id: "chain-200" }]);
    });
  });
});
