import { beforeEach, describe, expect, it, vi } from "vitest";
import { STATE } from "#src/tools/constants.js";
import {
  processDrumPads,
  updateDrumPadSoloStates,
} from "./device-reader-drum-helpers.js";

// Mock device-path-helpers
vi.mock(import("./device-path-helpers.js"), () => ({
  extractDevicePath: vi.fn((path) => path),
}));

// Mock device-state-helpers
vi.mock(import("./device-state-helpers.js"), () => ({
  buildChainInfo: vi.fn((chain, options) => ({
    id: chain._id,
    name: chain.getProperty("name"),
    ...options,
  })),
  hasInstrumentInDevices: vi.fn(() => true),
}));

describe("device-reader-drum-helpers", () => {
  describe("updateDrumPadSoloStates", () => {
    it("should not modify pads when none are soloed", () => {
      const drumPads = [
        { note: 36, pitch: "C1", name: "Kick" },
        { note: 37, pitch: "C#1", name: "Snare" },
      ];

      updateDrumPadSoloStates(drumPads);

      expect(drumPads[0].state).toBeUndefined();
      expect(drumPads[1].state).toBeUndefined();
    });

    it("should keep soloed pads as soloed and mute others via solo", () => {
      const drumPads = [
        { note: 36, pitch: "C1", name: "Kick", state: STATE.SOLOED },
        { note: 37, pitch: "C#1", name: "Snare" },
        { note: 38, pitch: "D1", name: "Clap" },
      ];

      updateDrumPadSoloStates(drumPads);

      expect(drumPads[0].state).toBe(STATE.SOLOED);
      expect(drumPads[1].state).toBe(STATE.MUTED_VIA_SOLO);
      expect(drumPads[2].state).toBe(STATE.MUTED_VIA_SOLO);
    });

    it("should mark already-muted pads as muted_also_via_solo when others are soloed", () => {
      const drumPads = [
        { note: 36, pitch: "C1", name: "Kick", state: STATE.SOLOED },
        { note: 37, pitch: "C#1", name: "Snare", state: STATE.MUTED },
        { note: 38, pitch: "D1", name: "Clap" },
      ];

      updateDrumPadSoloStates(drumPads);

      expect(drumPads[0].state).toBe(STATE.SOLOED);
      expect(drumPads[1].state).toBe(STATE.MUTED_ALSO_VIA_SOLO);
      expect(drumPads[2].state).toBe(STATE.MUTED_VIA_SOLO);
    });

    it("should handle multiple soloed pads", () => {
      const drumPads = [
        { note: 36, pitch: "C1", name: "Kick", state: STATE.SOLOED },
        { note: 37, pitch: "C#1", name: "Snare", state: STATE.SOLOED },
        { note: 38, pitch: "D1", name: "Clap" },
      ];

      updateDrumPadSoloStates(drumPads);

      expect(drumPads[0].state).toBe(STATE.SOLOED);
      expect(drumPads[1].state).toBe(STATE.SOLOED);
      expect(drumPads[2].state).toBe(STATE.MUTED_VIA_SOLO);
    });

    it("should not modify pads when only muted pads exist", () => {
      const drumPads = [
        { note: 36, pitch: "C1", name: "Kick", state: STATE.MUTED },
        { note: 37, pitch: "C#1", name: "Snare" },
      ];

      updateDrumPadSoloStates(drumPads);

      expect(drumPads[0].state).toBe(STATE.MUTED);
      expect(drumPads[1].state).toBeUndefined();
    });
  });

  describe("processDrumPads", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    // Helper to create mock chain
    const createMockChain = (inNote, name = "Chain") => ({
      _id: `chain-${inNote}`,
      getProperty: vi.fn((prop) => {
        if (prop === "in_note") return inNote;
        if (prop === "name") return name;
        if (prop === "mute") return 0;
        if (prop === "solo") return 0;

        return null;
      }),
      getChildren: vi.fn(() => []),
    });

    // Helper to create mock device
    const createMockDevice = (chainConfigs) => ({
      path: "live_set tracks 0 devices 0",
      getChildren: vi.fn(() =>
        chainConfigs.map((config) =>
          createMockChain(config.inNote, config.name),
        ),
      ),
    });

    it("should process chains with note-specific in_note", () => {
      const device = createMockDevice([{ inNote: 36, name: "Kick" }]);
      const deviceInfo = {};
      const readDeviceFn = vi.fn(() => ({ type: "instrument: Simpler" }));

      processDrumPads(device, deviceInfo, false, true, 0, 2, readDeviceFn);

      expect(deviceInfo.drumPads).toHaveLength(1);
      expect(deviceInfo.drumPads[0].note).toBe(36);
      expect(deviceInfo.drumPads[0].pitch).toBe("C1");
    });

    it("should process chains with catch-all in_note (-1)", () => {
      const device = createMockDevice([{ inNote: -1, name: "Catch All" }]);
      const deviceInfo = {};
      const readDeviceFn = vi.fn(() => ({ type: "instrument: Simpler" }));

      processDrumPads(device, deviceInfo, false, true, 0, 2, readDeviceFn);

      expect(deviceInfo.drumPads).toHaveLength(1);
      expect(deviceInfo.drumPads[0].note).toBe(-1);
      expect(deviceInfo.drumPads[0].pitch).toBe("*");
    });

    it("should sort drum pads by note with catch-all at end", () => {
      const device = createMockDevice([
        { inNote: -1, name: "Catch All" },
        { inNote: 48, name: "Hi Note" },
        { inNote: 36, name: "Low Note" },
      ]);
      const deviceInfo = {};
      const readDeviceFn = vi.fn(() => ({ type: "instrument: Simpler" }));

      processDrumPads(device, deviceInfo, false, true, 0, 2, readDeviceFn);

      expect(deviceInfo.drumPads).toHaveLength(3);
      expect(deviceInfo.drumPads[0].note).toBe(36);
      expect(deviceInfo.drumPads[1].note).toBe(48);
      expect(deviceInfo.drumPads[2].note).toBe(-1); // catch-all at end
    });

    it("should include chains when includeDrumPads and includeChains are both true", () => {
      const device = createMockDevice([{ inNote: 36, name: "Kick" }]);
      const deviceInfo = {};
      const readDeviceFn = vi.fn(() => ({ type: "instrument: Simpler" }));

      processDrumPads(device, deviceInfo, true, true, 0, 2, readDeviceFn);

      expect(deviceInfo.drumPads).toHaveLength(1);
      expect(deviceInfo.drumPads[0].chains).toBeDefined();
    });

    it("should not include drumPads in deviceInfo when includeDrumPads is false", () => {
      const device = createMockDevice([{ inNote: 36, name: "Kick" }]);
      const deviceInfo = {};
      const readDeviceFn = vi.fn(() => ({ type: "instrument: Simpler" }));

      processDrumPads(device, deviceInfo, false, false, 0, 2, readDeviceFn);

      expect(deviceInfo.drumPads).toBeUndefined();
      expect(deviceInfo._processedDrumPads).toBeDefined(); // internal tracking still happens
    });

    it("should group multiple chains with same in_note", () => {
      const mockChains = [
        createMockChain(36, "Kick Layer 1"),
        createMockChain(36, "Kick Layer 2"),
      ];
      const device = {
        path: "live_set tracks 0 devices 0",
        getChildren: vi.fn(() => mockChains),
      };
      const deviceInfo = {};
      const readDeviceFn = vi.fn(() => ({ type: "instrument: Simpler" }));

      processDrumPads(device, deviceInfo, false, true, 0, 2, readDeviceFn);

      // Should have only one drum pad (chains are grouped)
      expect(deviceInfo.drumPads).toHaveLength(1);
      expect(deviceInfo.drumPads[0].note).toBe(36);
    });
  });
});
