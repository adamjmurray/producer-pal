import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mock-live-api.js";
import "#src/live-api-adapter/live-api-extensions.js";
import {
  extractDevicePath,
  buildChainPath,
  buildReturnChainPath,
  buildDrumPadPath,
  resolvePathToLiveApi,
  resolveDrumPadFromPath,
  resolveInsertionPath,
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

    it("builds drum pad path with explicit chain index", () => {
      expect(buildDrumPadPath("1/0", "C1", 1)).toBe("1/0/pC1/1");
    });

    it("builds catch-all drum pad path", () => {
      expect(buildDrumPadPath("1/0", "*")).toBe("1/0/p*");
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

    // Helper to set up chain-based drum rack mocks
    // Uses chains with in_note property instead of drum_pads
    const setupChainMocks = (config = {}) => {
      const {
        deviceId = "drum-rack-1",
        chainIds = ["chain-36"],
        chainProperties = {},
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

        // Device returns chains
        if (id === deviceId || this._path?.includes("devices 0")) {
          if (prop === "chains") return chainIds.flatMap((c) => ["id", c]);
        }

        // Chain properties
        if (id?.startsWith("chain-")) {
          const chainProps = chainProperties[id] ?? {};

          if (prop === "in_note") return [chainProps.inNote ?? 36];
          if (prop === "devices")
            return (chainProps.deviceIds ?? []).flatMap((d) => ["id", d]);
        }

        return [];
      });
    };

    it("returns chain when no remaining segments (defaults to chain 0)", () => {
      setupChainMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36 } }, // C1 = MIDI 36
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "C1",
        [],
      );

      expect(result.target).not.toBeNull();
      expect(result.target.id).toBe("chain-36");
      expect(result.targetType).toBe("chain");
    });

    it("returns chain when chain index specified", () => {
      setupChainMocks({
        chainIds: ["chain-36a", "chain-36b"],
        chainProperties: {
          "chain-36a": { inNote: 36 },
          "chain-36b": { inNote: 36 }, // Second chain for same note (layered)
        },
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "C1",
        ["1"], // Second chain for C1
      );

      expect(result.target).not.toBeNull();
      expect(result.target.id).toBe("chain-36b");
      expect(result.targetType).toBe("chain");
    });

    it("returns device when chain and device index specified", () => {
      setupChainMocks({
        chainIds: ["chain-36"],
        chainProperties: {
          "chain-36": { inNote: 36, deviceIds: ["device-1"] },
        },
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

    it("returns catch-all chain when note is asterisk", () => {
      setupChainMocks({
        chainIds: ["chain-all"],
        chainProperties: { "chain-all": { inNote: -1 } }, // Catch-all
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "*",
        [],
      );

      expect(result.target).not.toBeNull();
      expect(result.target.id).toBe("chain-all");
      expect(result.targetType).toBe("chain");
    });

    it("returns null for non-existent note", () => {
      setupChainMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36 } }, // C1
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "C3", // Different note - MIDI 48
        [],
      );

      expect(result.target).toBeNull();
      expect(result.targetType).toBe("chain");
    });

    it("returns null for invalid chain index", () => {
      setupChainMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36 } },
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "C1",
        ["1"], // Chain index 1 doesn't exist (only 0)
      );

      expect(result.target).toBeNull();
      expect(result.targetType).toBe("chain");
    });

    it("returns null for invalid device index", () => {
      setupChainMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36, deviceIds: [] } },
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
      expect(result.targetType).toBe("chain");
    });

    it("returns null for invalid note name", () => {
      setupChainMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36 } },
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "InvalidNote",
        [],
      );

      expect(result.target).toBeNull();
      expect(result.targetType).toBe("chain");
    });

    it("resolves nested drum pad path", () => {
      // Setup: outer drum rack -> catch-all chain -> nested drum rack -> C1 chain
      const outerPath = "live_set tracks 1 devices 0";
      const nestedPath = "live_set tracks 1 devices 0 chains 0 devices 0";
      const catchAllChainId = "catch-all-chain";
      const nestedRackId = "nested-rack";
      const nestedChainId = "nested-chain-36";

      liveApiId.mockImplementation(function () {
        if (this._path === outerPath) return "outer-rack";
        if (this._path === nestedPath) return nestedRackId;
        if (this._path?.startsWith("id ")) return this._path.slice(3);

        return this._id ?? "0";
      });

      liveApiPath.mockImplementation(function () {
        const id = this._id ?? this.id;

        if (id === nestedRackId) return nestedPath;

        return this._path;
      });

      liveApiType.mockImplementation(function () {
        const id = this._id ?? this.id;

        if (id === catchAllChainId) return "DrumChain";
        if (id === nestedChainId) return "DrumChain";
        if (id === nestedRackId || this._path === nestedPath)
          return "DrumGroupDevice";

        return "RackDevice";
      });

      liveApiGet.mockImplementation(function (prop) {
        const id = this._id ?? this.id;

        // Outer drum rack returns catch-all chain
        if (this._path === outerPath) {
          if (prop === "chains") return ["id", catchAllChainId];
        }

        // Catch-all chain properties
        if (id === catchAllChainId) {
          if (prop === "in_note") return [-1]; // Catch-all
          if (prop === "devices") return ["id", nestedRackId];
        }

        // Nested drum rack returns C1 chain
        if (id === nestedRackId || this._path === nestedPath) {
          if (prop === "chains") return ["id", nestedChainId];
        }

        // Nested C1 chain properties
        if (id === nestedChainId) {
          if (prop === "in_note") return [36]; // C1
        }

        return [];
      });

      // Path: p*/0/0/pC1 means:
      // - p* = catch-all chain (in_note=-1)
      // - 0 = first chain with that in_note
      // - 0 = device 0 in that chain (nested drum rack)
      // - pC1 = C1 chain in nested drum rack
      const result = resolveDrumPadFromPath(outerPath, "*", ["0", "0", "pC1"]);

      expect(result.target).not.toBeNull();
      expect(result.target.id).toBe(nestedChainId);
      expect(result.targetType).toBe("chain");
    });

    describe("arbitrary depth navigation", () => {
      // Setup for instrument rack inside drum pad:
      // drum rack → C1 chain → instrument rack → rack chain → device
      const setupInstrumentRackInDrumPad = () => {
        const drumRackPath = "live_set tracks 1 devices 0";
        const drumChainId = "drum-chain-36";
        const instrRackId = "instr-rack";
        const rackChainId = "rack-chain";
        const finalDeviceId = "final-device";

        liveApiId.mockImplementation(function () {
          if (this._path === drumRackPath) return "drum-rack";
          if (this._path?.startsWith("id ")) return this._path.slice(3);

          return this._id ?? "0";
        });

        liveApiPath.mockImplementation(function () {
          return this._path;
        });

        liveApiType.mockImplementation(function () {
          const id = this._id ?? this.id;

          if (id === drumChainId) return "DrumChain";
          if (id === rackChainId) return "Chain";
          if (id === instrRackId) return "InstrumentGroupDevice";
          if (id === finalDeviceId) return "PluginDevice";

          return "DrumGroupDevice";
        });

        liveApiGet.mockImplementation(function (prop) {
          const id = this._id ?? this.id;

          // Drum rack returns C1 chain
          if (this._path === drumRackPath) {
            if (prop === "chains") return ["id", drumChainId];
          }

          // Drum chain properties
          if (id === drumChainId) {
            if (prop === "in_note") return [36]; // C1
            if (prop === "devices") return ["id", instrRackId];
          }

          // Instrument rack returns chain
          if (id === instrRackId) {
            if (prop === "chains") return ["id", rackChainId];
          }

          // Rack chain returns device
          if (id === rackChainId) {
            if (prop === "devices") return ["id", finalDeviceId];
          }

          return [];
        });

        return { drumChainId, instrRackId, rackChainId, finalDeviceId };
      };

      it("navigates nested racks and handles out of bounds", () => {
        const { rackChainId, finalDeviceId } = setupInstrumentRackInDrumPad();
        const path = "live_set tracks 1 devices 0";
        // Valid navigation through nested rack
        const r1 = resolveDrumPadFromPath(path, "C1", ["0", "0", "0"]);

        expect(r1.target.id).toBe(rackChainId);
        expect(r1.targetType).toBe("chain");
        const r2 = resolveDrumPadFromPath(path, "C1", ["0", "0", "0", "0"]);

        expect(r2.target.id).toBe(finalDeviceId);
        expect(r2.targetType).toBe("device");
        // Out of bounds
        const r3 = resolveDrumPadFromPath(path, "C1", ["0", "0", "5"]);

        expect(r3.target).toBeNull();
        const r4 = resolveDrumPadFromPath(path, "C1", ["0", "0", "0", "5"]);

        expect(r4.target).toBeNull();
      });
    });
  });

  describe("resolveInsertionPath", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      liveApiId.mockReturnValue("valid-id");
    });

    it("resolves track and chain paths correctly", () => {
      const cases = [
        ["0", "live_set tracks 0", null],
        ["0/3", "live_set tracks 0", 3],
        ["0/0/0", "live_set tracks 0 devices 0 chains 0", null],
        ["0/0/0/1", "live_set tracks 0 devices 0 chains 0", 1],
      ];

      for (const [path, expectedPath, expectedPos] of cases) {
        const result = resolveInsertionPath(path);

        expect(result.container._path).toBe(expectedPath);
        expect(result.position).toBe(expectedPos);
      }
    });

    it("resolves drum pad paths (append and with position)", () => {
      const drumChainId = "drum-chain-36";

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 devices 0") return "drum-rack";

        return this._path?.startsWith("id ")
          ? this._path.slice(3)
          : (this._id ?? "valid-id");
      });
      liveApiType.mockReturnValue("DrumGroupDevice");
      liveApiGet.mockImplementation(function (prop) {
        if (this._path === "live_set tracks 0 devices 0" && prop === "chains")
          return ["id", drumChainId];
        if ((this._id ?? this.id) === drumChainId && prop === "in_note")
          return [36];

        return [];
      });
      expect(resolveInsertionPath("0/0/pC1").position).toBeNull();
      expect(resolveInsertionPath("0/0/pC1/2").position).toBe(2);
    });

    it("throws on invalid paths", () => {
      expect(() => resolveInsertionPath("")).toThrow(
        "Path must be a non-empty string",
      );
      expect(() => resolveInsertionPath(null)).toThrow(
        "Path must be a non-empty string",
      );
      expect(() => resolveInsertionPath("0/abc")).toThrow(
        "Invalid device position",
      );
      expect(() => resolveInsertionPath("0/-1")).toThrow(
        "Invalid device position",
      );
    });
  });
});
