// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  resolveDrumPadFromPath,
  resolveInsertionPath,
} from "./device-path-helpers.ts";

// Type for chain properties
interface ChainProperties {
  [chainId: string]: {
    inNote?: number;
    type?: string;
    deviceIds?: string[];
  };
}

interface SetupConfig {
  deviceId?: string;
  chainIds?: string[];
  chainProperties?: ChainProperties;
}

describe("device-path-helpers", () => {
  describe("resolveDrumPadFromPath", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    // Helper to set up chain-based drum rack mocks
    // Uses chains with in_note property instead of drum_pads
    const setupChainMocks = (config: SetupConfig = {}) => {
      const {
        deviceId = "drum-rack-1",
        chainIds = ["chain-36"],
        chainProperties = {},
      } = config;

      registerMockObject(deviceId, {
        path: "live_set tracks 1 devices 0",
        type: "RackDevice",
        properties: {
          chains: chainIds.flatMap((c: string) => ["id", c]),
        },
      });

      for (const chainId of chainIds) {
        const chainProps = chainProperties[chainId] ?? {};

        registerMockObject(chainId, {
          type: chainProps.type ?? "DrumChain",
          properties: {
            in_note: chainProps.inNote ?? 36,
            devices: (chainProps.deviceIds ?? []).flatMap((d: string) => [
              "id",
              d,
            ]),
          },
        });
      }
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
      expect(result.target!.id).toBe("chain-36");
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
      expect(result.target!.id).toBe("chain-36b");
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
      expect(result.target!.id).toBe("device-1");
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
      expect(result.target!.id).toBe("chain-all");
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
      registerMockObject("0", { path: "live_set tracks 99 devices 0" });

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

      registerMockObject("outer-rack", {
        path: outerPath,
        type: "RackDevice",
        properties: { chains: ["id", catchAllChainId] },
      });

      registerMockObject(catchAllChainId, {
        type: "DrumChain",
        properties: { in_note: -1, devices: ["id", nestedRackId] },
      });

      registerMockObject(nestedRackId, {
        path: nestedPath,
        type: "DrumGroupDevice",
        properties: { chains: ["id", nestedChainId] },
      });

      registerMockObject(nestedChainId, {
        type: "DrumChain",
        properties: { in_note: 36 },
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
      expect(result.target!.id).toBe(nestedChainId);
      expect(result.targetType).toBe("chain");
    });

    // Setup for instrument rack inside drum pad (shared helper):
    // drum rack → C1 chain → instrument rack → rack chain → device
    const setupInstrumentRackInDrumPad = () => {
      const drumChainId = "drum-chain-36";
      const instrRackId = "instr-rack";
      const rackChainId = "rack-chain";
      const finalDeviceId = "final-device";

      registerMockObject("drum-rack", {
        path: "live_set tracks 1 devices 0",
        type: "DrumGroupDevice",
        properties: { chains: ["id", drumChainId] },
      });

      registerMockObject(drumChainId, {
        type: "DrumChain",
        properties: { in_note: 36, devices: ["id", instrRackId] },
      });

      registerMockObject(instrRackId, {
        type: "InstrumentGroupDevice",
        properties: { chains: ["id", rackChainId] },
      });

      registerMockObject(rackChainId, {
        type: "Chain",
        properties: { devices: ["id", finalDeviceId] },
      });

      registerMockObject(finalDeviceId, { type: "PluginDevice" });

      return { drumChainId, instrRackId, rackChainId, finalDeviceId };
    };

    describe("arbitrary depth navigation", () => {
      it("navigates nested racks and handles out of bounds", () => {
        const { rackChainId, finalDeviceId } = setupInstrumentRackInDrumPad();
        const path = "live_set tracks 1 devices 0";
        // Valid navigation through nested rack
        const r1 = resolveDrumPadFromPath(path, "C1", ["c0", "d0", "c0"]);

        expect(r1.target!.id).toBe(rackChainId);
        expect(r1.targetType).toBe("chain");
        const r2 = resolveDrumPadFromPath(path, "C1", ["c0", "d0", "c0", "d0"]);

        expect(r2.target!.id).toBe(finalDeviceId);
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

    it("returns null for NaN chain index (e.g., cABC)", () => {
      setupChainMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36 } },
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "C1",
        ["cABC"], // Non-numeric chain index
      );

      expect(result.target).toBeNull();
      expect(result.targetType).toBe("chain");
    });

    it("returns null when segment after chain is not device prefix", () => {
      setupChainMocks({
        chainIds: ["chain-36"],
        chainProperties: {
          "chain-36": { inNote: 36, deviceIds: ["device-1"] },
        },
      });

      const result = resolveDrumPadFromPath(
        "live_set tracks 1 devices 0",
        "C1",
        ["c0", "xyz"], // Invalid segment (not 'd' prefix)
      );

      expect(result.target).toBeNull();
      expect(result.targetType).toBe("device");
    });

    it("returns null for invalid segment in navigateRemainingSegments", () => {
      // Reuse the instrument rack setup from above
      setupInstrumentRackInDrumPad();
      const path = "live_set tracks 1 devices 0";

      // Path: pC1/c0/d0/c0/d0/invalidSegment
      // This navigates through the nested structure and then hits an invalid segment
      const result = resolveDrumPadFromPath(path, "C1", [
        "c0",
        "d0",
        "c0",
        "d0",
        "invalid", // Invalid segment after reaching final device
      ]);

      expect(result.target).toBeNull();
    });
  });

  describe("resolveInsertionPath drum pad auto-creation", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    interface AutoCreateConfig {
      chainIds?: string[];
      chainProperties?: ChainProperties;
      includeCreationMocks?: boolean;
    }

    /**
     * Setup mocks for auto-creation tests.
     * Uses mutable chainIdArray so insert_chain updates are visible to get("chains").
     * @param config - Configuration for mock setup
     * @returns Device mock and created chain mocks for assertions
     */
    function setupAutoCreationMocks(config: AutoCreateConfig = {}) {
      const {
        chainIds = [],
        chainProperties = {},
        includeCreationMocks = true,
      } = config;

      // Mutable flat array — insert_chain pushes to it, get("chains") reads it
      const chainIdArray: string[] = chainIds.flatMap((c) => ["id", c]);
      const createdChainMocks: RegisteredMockObject[] = [];

      const deviceMock = registerMockObject("drum-rack-1", {
        path: "live_set tracks 0 devices 0",
        type: "DrumGroupDevice",
        properties: { chains: chainIdArray },
        methods: includeCreationMocks
          ? {
              insert_chain: () => {
                const newId = `chain-new-${chainIdArray.length / 2}`;

                chainIdArray.push("id", newId);

                // Register new chain with mutable props so set("in_note") is visible to get
                const props: Record<string, unknown> = { in_note: -1 };
                const mock = registerMockObject(newId, {
                  type: "DrumChain",
                  properties: props,
                });

                mock.set.mockImplementation((prop: string, value: unknown) => {
                  props[prop] = value;
                });
                createdChainMocks.push(mock);
              },
            }
          : undefined,
      });

      // Register existing chains
      for (const chainId of chainIds) {
        const chainProps = chainProperties[chainId] ?? {};

        registerMockObject(chainId, {
          type: "DrumChain",
          properties: { in_note: chainProps.inNote ?? 36 },
        });
      }

      return { deviceMock, createdChainMocks };
    }

    it("auto-creates first chain when no chain exists for note", () => {
      const { deviceMock, createdChainMocks } = setupAutoCreationMocks();

      const result = resolveInsertionPath("t0/d0/pC1"); // MIDI 36

      expect(deviceMock.call).toHaveBeenCalledWith("insert_chain");
      expect(createdChainMocks[0]!.set).toHaveBeenCalledWith("in_note", 36);
      expect(result.container).not.toBeNull();
      expect(result.position).toBeNull();
    });

    it("auto-creates multiple chains for layering", () => {
      const { deviceMock } = setupAutoCreationMocks({
        chainIds: ["chain-existing"],
        chainProperties: { "chain-existing": { inNote: 36 } },
      });

      // Request chain index 2 when only one chain exists (index 0)
      // Path "t0/d0/pC1/c2" means chain index 2 with no device position
      const result = resolveInsertionPath("t0/d0/pC1/c2");

      expect(deviceMock.call).toHaveBeenCalledTimes(2); // Create 2 chains
      expect(result.container).not.toBeNull();
    });

    it("throws when too many chains would be auto-created", () => {
      setupAutoCreationMocks({ includeCreationMocks: false });

      // Request chain index 20 would require creating 21 chains
      expect(() => resolveInsertionPath("t0/d0/pC1/c20")).toThrow(
        "Cannot auto-create 21 drum pad chains (max: 16)",
      );
    });

    it("does not auto-create when chain already exists", () => {
      const { deviceMock } = setupAutoCreationMocks({
        chainIds: ["chain-36"],
        chainProperties: { "chain-36": { inNote: 36 } },
        includeCreationMocks: false,
      });

      const result = resolveInsertionPath("t0/d0/pC1");

      expect(deviceMock.call).not.toHaveBeenCalled();
      expect(result.container).not.toBeNull();
      expect(result.container!.id).toBe("chain-36");
    });

    it("returns null for invalid note name during auto-creation", () => {
      const { deviceMock } = setupAutoCreationMocks({
        includeCreationMocks: false,
      });

      // Invalid note name (not a valid MIDI note)
      const result = resolveInsertionPath("t0/d0/pInvalidNote");

      expect(result.container).toBeNull();
      expect(deviceMock.call).not.toHaveBeenCalled();
    });

    it("returns null for negative chain index during auto-creation", () => {
      const { deviceMock } = setupAutoCreationMocks({
        includeCreationMocks: false,
      });

      // Negative chain index is invalid
      const result = resolveInsertionPath("t0/d0/pC1/c-1");

      expect(result.container).toBeNull();
      expect(deviceMock.call).not.toHaveBeenCalled();
    });
  });
});
