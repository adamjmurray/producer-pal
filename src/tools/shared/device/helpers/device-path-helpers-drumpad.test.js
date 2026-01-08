import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
} from "#src/test/mock-live-api.js";
import "#src/live-api-adapter/live-api-extensions.js";
import {
  resolveDrumPadFromPath,
  resolveInsertionPath,
} from "./device-path-helpers.js";

describe("device-path-helpers", () => {
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
        ["c1"], // Second chain for C1
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
        ["c0", "d0"],
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

    it("returns null for negative chain index", () => {
      setupChainMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36 } },
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "C1",
        ["c-1"], // Negative index
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
        ["c0", "d0"], // Device index 0 doesn't exist
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

      // Path: p*/c0/d0/pC1 means:
      // - p* = catch-all chain (in_note=-1)
      // - c0 = first chain with that in_note
      // - d0 = device 0 in that chain (nested drum rack)
      // - pC1 = C1 chain in nested drum rack
      const result = resolveDrumPadFromPath(outerPath, "*", [
        "c0",
        "d0",
        "pC1",
      ]);

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
        const r1 = resolveDrumPadFromPath(path, "C1", ["c0", "d0", "c0"]);

        expect(r1.target.id).toBe(rackChainId);
        expect(r1.targetType).toBe("chain");
        const r2 = resolveDrumPadFromPath(path, "C1", ["c0", "d0", "c0", "d0"]);

        expect(r2.target.id).toBe(finalDeviceId);
        expect(r2.targetType).toBe("device");
        // Out of bounds
        const r3 = resolveDrumPadFromPath(path, "C1", ["c0", "d0", "c5"]);

        expect(r3.target).toBeNull();
        const r4 = resolveDrumPadFromPath(path, "C1", ["c0", "d0", "c0", "d5"]);

        expect(r4.target).toBeNull();
      });
    });

    it("returns null for non-existent chain index (no auto-creation in read path)", () => {
      setupChainMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36 } },
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "C1",
        ["c1"], // Chain index 1 doesn't exist (only 0)
      );

      expect(result.target).toBeNull();
      expect(result.targetType).toBe("chain");
    });
  });

  describe("resolveInsertionPath drum pad auto-creation", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    /**
     * Setup mocks for auto-creation tests
     * @param {object} config - Configuration
     * @param {string[]} config.chainIds - Initial chain IDs (mutable)
     * @param {object} config.chainProperties - Initial chain properties (mutable)
     * @param {boolean} config.includeCreationMocks - Include insert_chain and in_note mocks
     */

    function setupAutoCreationMocks(config = {}) {
      const {
        chainIds = [],
        chainProperties = {},
        includeCreationMocks = true,
      } = config;
      const deviceId = "drum-rack-1";

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") return "track-0";
        if (this._path === "live_set tracks 0 devices 0") return deviceId;
        if (this._path?.startsWith("id ")) return this._path.slice(3);

        return this._id ?? "0";
      });

      liveApiType.mockImplementation(function () {
        const id = this._id ?? this.id;

        if (id?.startsWith("chain-")) return "DrumChain";

        return "DrumGroupDevice";
      });

      liveApiGet.mockImplementation(function (prop) {
        const id = this._id ?? this.id;

        if (id === deviceId || this._path?.includes("devices 0")) {
          if (prop === "chains") return chainIds.flatMap((c) => ["id", c]);
        }

        if (id?.startsWith("chain-")) {
          const chainProps = chainProperties[id] ?? {};

          if (prop === "in_note") return [chainProps.inNote ?? 36];
        }

        return [];
      });

      if (includeCreationMocks) {
        liveApiCall.mockImplementation(function (method) {
          if (method === "insert_chain") {
            const newId = `chain-new-${chainIds.length}`;

            chainIds.push(newId);
            chainProperties[newId] = { inNote: -1 };
          }
        });

        liveApiSet.mockImplementation(function (prop, value) {
          const id = this._id ?? this.id;

          if (prop === "in_note" && id?.startsWith("chain-")) {
            chainProperties[id] = { inNote: value };
          }
        });
      }

      return { chainIds, chainProperties };
    }

    it("auto-creates first chain when no chain exists for note", () => {
      setupAutoCreationMocks();

      const result = resolveInsertionPath("t0/d0/pC1"); // MIDI 36

      expect(liveApiCall).toHaveBeenCalledWith("insert_chain");
      expect(liveApiSet).toHaveBeenCalledWith("in_note", 36);
      expect(result.container).not.toBeNull();
      expect(result.position).toBeNull();
    });

    it("auto-creates multiple chains for layering", () => {
      setupAutoCreationMocks({
        chainIds: ["chain-existing"],
        chainProperties: { "chain-existing": { inNote: 36 } },
      });

      // Request chain index 2 when only one chain exists (index 0)
      // Path "t0/d0/pC1/c2" means chain index 2 with no device position
      const result = resolveInsertionPath("t0/d0/pC1/c2");

      expect(liveApiCall).toHaveBeenCalledTimes(2); // Create 2 chains
      expect(result.container).not.toBeNull();
    });

    it("throws when too many chains would be auto-created", () => {
      const deviceId = "drum-rack-1";

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") return "track-0";
        if (this._path === "live_set tracks 0 devices 0") return deviceId;

        return this._id ?? "0";
      });

      liveApiType.mockReturnValue("DrumGroupDevice");

      liveApiGet.mockImplementation(function (prop) {
        if (prop === "chains") return []; // No chains exist

        return [];
      });

      // Request chain index 20 would require creating 21 chains
      expect(() => resolveInsertionPath("t0/d0/pC1/c20")).toThrow(
        "Cannot auto-create 21 drum pad chains (max: 16)",
      );
    });

    it("does not auto-create when chain already exists", () => {
      setupAutoCreationMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36 } },
        includeCreationMocks: false,
      });

      const result = resolveInsertionPath("t0/d0/pC1");

      expect(liveApiCall).not.toHaveBeenCalled();
      expect(result.container).not.toBeNull();
      expect(result.container.id).toBe("chain-36");
    });

    it("returns null for invalid note name during auto-creation", () => {
      const deviceId = "drum-rack-1";

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") return "track-0";
        if (this._path === "live_set tracks 0 devices 0") return deviceId;

        return this._id ?? "0";
      });

      liveApiType.mockReturnValue("DrumGroupDevice");

      liveApiGet.mockImplementation(function (prop) {
        if (prop === "chains") return []; // No chains

        return [];
      });

      // Invalid note name (not a valid MIDI note)
      const result = resolveInsertionPath("t0/d0/pInvalidNote");

      expect(result.container).toBeNull();
      expect(liveApiCall).not.toHaveBeenCalled();
    });

    it("returns null for negative chain index during auto-creation", () => {
      const deviceId = "drum-rack-1";

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") return "track-0";
        if (this._path === "live_set tracks 0 devices 0") return deviceId;

        return this._id ?? "0";
      });

      liveApiType.mockReturnValue("DrumGroupDevice");

      liveApiGet.mockImplementation(function (prop) {
        if (prop === "chains") return [];

        return [];
      });

      // Negative chain index is invalid
      const result = resolveInsertionPath("t0/d0/pC1/c-1");

      expect(result.container).toBeNull();
      expect(liveApiCall).not.toHaveBeenCalled();
    });
  });
});
