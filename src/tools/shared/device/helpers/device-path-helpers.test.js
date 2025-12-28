import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiGet, liveApiId, liveApiType } from "#src/test/mock-live-api.js";
import "#src/live-api-adapter/live-api-extensions.js";
import {
  extractDevicePath,
  buildChainPath,
  buildReturnChainPath,
  buildDrumPadPath,
  resolvePathToLiveApi,
  resolveDrumPadFromPath,
} from "./device-path-helpers.js";

describe("device-path-helpers", () => {
  describe("extractDevicePath", () => {
    describe("regular track devices", () => {
      it("extracts path for track device", () => {
        expect(extractDevicePath("live_set tracks 1 devices 0")).toBe("1/0");
      });

      it("extracts path for nested chain device", () => {
        expect(
          extractDevicePath("live_set tracks 2 devices 0 chains 1 devices 2"),
        ).toBe("2/0/1/2");
      });

      it("extracts path for deeply nested device", () => {
        expect(
          extractDevicePath(
            "live_set tracks 0 devices 1 chains 2 devices 3 chains 4 devices 5",
          ),
        ).toBe("0/1/2/3/4/5");
      });

      it("extracts path for chain only (no device)", () => {
        expect(extractDevicePath("live_set tracks 1 devices 0 chains 2")).toBe(
          "1/0/2",
        );
      });
    });

    describe("return track devices", () => {
      it("extracts path for return track device", () => {
        expect(extractDevicePath("live_set return_tracks 0 devices 0")).toBe(
          "r0/0",
        );
      });

      it("extracts path for return track nested device", () => {
        expect(
          extractDevicePath(
            "live_set return_tracks 1 devices 0 chains 0 devices 1",
          ),
        ).toBe("r1/0/0/1");
      });
    });

    describe("master track devices", () => {
      it("extracts path for master track device", () => {
        expect(extractDevicePath("live_set master_track devices 0")).toBe(
          "m/0",
        );
      });

      it("extracts path for master track nested device", () => {
        expect(
          extractDevicePath("live_set master_track devices 0 chains 0"),
        ).toBe("m/0/0");
      });

      it("extracts path for master track deeply nested", () => {
        expect(
          extractDevicePath(
            "live_set master_track devices 0 chains 1 devices 2",
          ),
        ).toBe("m/0/1/2");
      });
    });

    describe("return chains in racks", () => {
      it("extracts path for return chain", () => {
        expect(
          extractDevicePath("live_set tracks 1 devices 0 return_chains 0"),
        ).toBe("1/0/r0");
      });

      it("extracts path for device in return chain", () => {
        expect(
          extractDevicePath(
            "live_set tracks 1 devices 0 return_chains 0 devices 1",
          ),
        ).toBe("1/0/r0/1");
      });

      it("extracts path for return chain in return track rack", () => {
        expect(
          extractDevicePath(
            "live_set return_tracks 0 devices 0 return_chains 1",
          ),
        ).toBe("r0/0/r1");
      });
    });

    describe("invalid paths", () => {
      it("returns null for invalid path without track prefix", () => {
        expect(extractDevicePath("devices 0")).toBe(null);
        expect(extractDevicePath("some random string")).toBe(null);
      });

      it("returns null for empty string", () => {
        expect(extractDevicePath("")).toBe(null);
      });
    });
  });

  describe("buildChainPath", () => {
    it("builds chain path from device path", () => {
      expect(buildChainPath("1/0", 2)).toBe("1/0/2");
    });

    it("builds chain path for return track device", () => {
      expect(buildChainPath("r0/0", 0)).toBe("r0/0/0");
    });

    it("builds chain path for master track device", () => {
      expect(buildChainPath("m/0", 1)).toBe("m/0/1");
    });

    it("builds nested chain path", () => {
      expect(buildChainPath("1/0/0/1", 3)).toBe("1/0/0/1/3");
    });
  });

  describe("buildReturnChainPath", () => {
    it("builds return chain path", () => {
      expect(buildReturnChainPath("1/0", 0)).toBe("1/0/r0");
    });

    it("builds return chain path for return track device", () => {
      expect(buildReturnChainPath("r0/0", 1)).toBe("r0/0/r1");
    });

    it("builds return chain path for master track device", () => {
      expect(buildReturnChainPath("m/0", 0)).toBe("m/0/r0");
    });
  });

  describe("buildDrumPadPath", () => {
    it("builds drum pad path with natural note", () => {
      expect(buildDrumPadPath("1/0", "C1")).toBe("1/0/pC1");
    });

    it("builds drum pad path with sharp note", () => {
      expect(buildDrumPadPath("1/0", "F#2")).toBe("1/0/pF#2");
    });

    it("builds drum pad path with flat note", () => {
      expect(buildDrumPadPath("2/1", "Bb0")).toBe("2/1/pBb0");
    });

    it("builds drum pad path for return track device", () => {
      expect(buildDrumPadPath("r0/0", "C3")).toBe("r0/0/pC3");
    });
  });

  describe("resolvePathToLiveApi", () => {
    describe("device paths", () => {
      it("resolves regular track device", () => {
        expect(resolvePathToLiveApi("1/0")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0",
          targetType: "device",
        });
      });

      it("resolves return track device", () => {
        expect(resolvePathToLiveApi("r0/0")).toStrictEqual({
          liveApiPath: "live_set return_tracks 0 devices 0",
          targetType: "device",
        });
      });

      it("resolves master track device", () => {
        expect(resolvePathToLiveApi("m/0")).toStrictEqual({
          liveApiPath: "live_set master_track devices 0",
          targetType: "device",
        });
      });

      it("resolves nested device in chain", () => {
        expect(resolvePathToLiveApi("1/0/0/1")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0 chains 0 devices 1",
          targetType: "device",
        });
      });

      it("resolves deeply nested device", () => {
        expect(resolvePathToLiveApi("2/0/1/2/3/4")).toStrictEqual({
          liveApiPath:
            "live_set tracks 2 devices 0 chains 1 devices 2 chains 3 devices 4",
          targetType: "device",
        });
      });
    });

    describe("chain paths", () => {
      it("resolves chain path", () => {
        expect(resolvePathToLiveApi("1/0/0")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0 chains 0",
          targetType: "chain",
        });
      });

      it("resolves nested chain path", () => {
        expect(resolvePathToLiveApi("1/0/0/1/2")).toStrictEqual({
          liveApiPath:
            "live_set tracks 1 devices 0 chains 0 devices 1 chains 2",
          targetType: "chain",
        });
      });

      it("resolves master track chain", () => {
        expect(resolvePathToLiveApi("m/0/0")).toStrictEqual({
          liveApiPath: "live_set master_track devices 0 chains 0",
          targetType: "chain",
        });
      });
    });

    describe("return chain paths", () => {
      it("resolves return chain in rack", () => {
        expect(resolvePathToLiveApi("1/0/r0")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0 return_chains 0",
          targetType: "return-chain",
        });
      });

      it("resolves device in return chain", () => {
        expect(resolvePathToLiveApi("1/0/r0/1")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0 return_chains 0 devices 1",
          targetType: "device",
        });
      });

      it("resolves return chain in return track rack", () => {
        expect(resolvePathToLiveApi("r0/0/r1")).toStrictEqual({
          liveApiPath: "live_set return_tracks 0 devices 0 return_chains 1",
          targetType: "return-chain",
        });
      });
    });

    describe("drum pad paths", () => {
      it("resolves drum pad path", () => {
        expect(resolvePathToLiveApi("1/0/pC1")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0",
          targetType: "drum-pad",
          drumPadNote: "C1",
          remainingSegments: [],
        });
      });

      it("resolves drum pad with chain index", () => {
        expect(resolvePathToLiveApi("1/0/pC1/0")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0",
          targetType: "drum-pad",
          drumPadNote: "C1",
          remainingSegments: ["0"],
        });
      });

      it("resolves drum pad with chain and device", () => {
        expect(resolvePathToLiveApi("1/0/pC1/0/0")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0",
          targetType: "drum-pad",
          drumPadNote: "C1",
          remainingSegments: ["0", "0"],
        });
      });

      it("resolves drum pad with sharp note", () => {
        expect(resolvePathToLiveApi("1/0/pF#2")).toStrictEqual({
          liveApiPath: "live_set tracks 1 devices 0",
          targetType: "drum-pad",
          drumPadNote: "F#2",
          remainingSegments: [],
        });
      });

      it("resolves drum pad with flat note", () => {
        expect(resolvePathToLiveApi("2/1/pBb0")).toStrictEqual({
          liveApiPath: "live_set tracks 2 devices 1",
          targetType: "drum-pad",
          drumPadNote: "Bb0",
          remainingSegments: [],
        });
      });
    });

    describe("error handling", () => {
      it("throws on empty path", () => {
        expect(() => resolvePathToLiveApi("")).toThrow(
          "Path must be a non-empty string",
        );
      });

      it("throws on null path", () => {
        expect(() => resolvePathToLiveApi(null)).toThrow(
          "Path must be a non-empty string",
        );
      });

      it("throws on track-only path", () => {
        expect(() => resolvePathToLiveApi("1")).toThrow(
          "Path must include at least a device index",
        );
      });

      it("throws on invalid track index", () => {
        expect(() => resolvePathToLiveApi("abc/0")).toThrow(
          "Invalid track index",
        );
      });

      it("throws on invalid return track index", () => {
        expect(() => resolvePathToLiveApi("rx/0")).toThrow(
          "Invalid return track index",
        );
      });

      it("throws on invalid device index", () => {
        expect(() => resolvePathToLiveApi("1/abc")).toThrow(
          "Expected device index",
        );
      });

      it("throws on invalid chain index", () => {
        expect(() => resolvePathToLiveApi("1/0/abc")).toThrow(
          "Invalid chain index",
        );
      });

      it("throws on invalid return chain index", () => {
        expect(() => resolvePathToLiveApi("1/0/rx")).toThrow(
          "Invalid return chain index",
        );
      });

      it("throws on empty drum pad note", () => {
        expect(() => resolvePathToLiveApi("1/0/p")).toThrow(
          "Invalid drum pad note",
        );
      });
    });
  });

  describe("resolveDrumPadFromPath", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    // Helper to set up drum pad mocks
    const setupDrumPadMocks = (config = {}) => {
      const {
        deviceId = "drum-rack-1",
        padIds = ["pad-36"],
        padProperties = {},
        chainProperties = {},
      } = config;

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 1 devices 0") return deviceId;

        return this._id ?? "0";
      });

      liveApiType.mockImplementation(function () {
        const id = this._id ?? this.id;

        if (id?.startsWith("pad-")) return "DrumPad";
        if (id?.startsWith("chain-"))
          return chainProperties[id]?.type ?? "DrumChain";
        if (id?.startsWith("device-")) return "Device";

        return "RackDevice";
      });

      liveApiGet.mockImplementation(function (prop) {
        const id = this._id ?? this.id;

        if (id === deviceId || this._path?.includes("devices 0")) {
          if (prop === "drum_pads") return padIds.flatMap((p) => ["id", p]);
        }

        if (id?.startsWith("pad-")) {
          const padProps = padProperties[id] ?? {};

          if (prop === "note") return [padProps.note ?? 36];
          if (prop === "chains")
            return (padProps.chainIds ?? []).flatMap((c) => ["id", c]);
        }

        if (id?.startsWith("chain-")) {
          const chainProps = chainProperties[id] ?? {};

          if (prop === "devices")
            return (chainProps.deviceIds ?? []).flatMap((d) => ["id", d]);
        }

        return [];
      });
    };

    it("returns drum pad when no remaining segments", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: { "pad-36": { note: 36 } },
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "C1",
        [],
      );

      expect(result.target).not.toBeNull();
      expect(result.target.id).toBe("pad-36");
      expect(result.targetType).toBe("drum-pad");
    });

    it("returns chain when one remaining segment", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: { "pad-36": { note: 36, chainIds: ["chain-1"] } },
        chainProperties: { "chain-1": {} },
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "C1",
        ["0"],
      );

      expect(result.target).not.toBeNull();
      expect(result.target.id).toBe("chain-1");
      expect(result.targetType).toBe("chain");
    });

    it("returns device when two remaining segments", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: { "pad-36": { note: 36, chainIds: ["chain-1"] } },
        chainProperties: { "chain-1": { deviceIds: ["device-1"] } },
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "C1",
        ["0", "0"],
      );

      expect(result.target).not.toBeNull();
      expect(result.target.id).toBe("device-1");
      expect(result.targetType).toBe("device");
    });

    it("returns null for non-existent drum pad note", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: { "pad-36": { note: 36 } }, // C1
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "C3", // Different note - MIDI 48
        [],
      );

      expect(result.target).toBeNull();
      expect(result.targetType).toBe("drum-pad");
    });

    it("returns null for invalid chain index", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: { "pad-36": { note: 36, chainIds: [] } }, // No chains
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "C1",
        ["0"], // Chain index 0 doesn't exist
      );

      expect(result.target).toBeNull();
      expect(result.targetType).toBe("chain");
    });

    it("returns null for invalid device index", () => {
      setupDrumPadMocks({
        padIds: ["pad-36"],
        padProperties: { "pad-36": { note: 36, chainIds: ["chain-1"] } },
        chainProperties: { "chain-1": { deviceIds: [] } }, // No devices
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "C1",
        ["0", "0"], // Device index 0 doesn't exist
      );

      expect(result.target).toBeNull();
      expect(result.targetType).toBe("device");
    });

    it("returns null when device does not exist", () => {
      liveApiId.mockReturnValue("0"); // Makes exists() return false

      const result = resolveDrumPadFromPath(
        "live_set tracks 99 devices 0",
        "C1",
        [],
      );

      expect(result.target).toBeNull();
      expect(result.targetType).toBe("drum-pad");
    });
  });
});
