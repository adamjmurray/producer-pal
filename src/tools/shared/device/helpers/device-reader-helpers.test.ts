// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { DEVICE_TYPE, STATE } from "#src/tools/constants.ts";
import { updateDrumPadSoloStates } from "./device-reader-drum-helpers.ts";

// Types for tests (not exported from source modules)
interface DeviceInfo {
  type: string;
  chains?: { devices?: DeviceInfo[] }[];
}
interface DrumPadInfo {
  note: number;
  pitch: string;
  name?: string;
  state?: string;
}
interface ReturnChain {
  id: string;
  name: string;
  path?: string;
  devices?: { id: string; type: string }[];
}
interface DeviceInfoResult {
  returnChains?: ReturnChain[];
  [key: string]: unknown;
}
import {
  buildChainInfo,
  isRedundantDeviceClassName,
  readMacroVariations,
  readABCompare,
  processDeviceChains,
} from "./device-reader-helpers.ts";
import {
  computeState,
  isInstrumentDevice,
  hasInstrumentInDevices,
} from "./device-state-helpers.ts";

// Helper types used in tests
type ChainOverrides = {
  type?: string;
  name?: string;
  mute?: number;
  solo?: number;
  muted_via_solo?: number;
  choke_group?: number;
  out_note?: number;
  color?: string | null;
};
type MockChainOverrides = { devices?: unknown[] };

describe("device-reader-helpers", () => {
  describe("buildChainInfo", () => {
    const createMockChain = (overrides: ChainOverrides = {}) =>
      ({
        id: "chain-123",
        type: overrides.type ?? "Chain",
        getProperty: (prop: string) => {
          if (prop === "name") return overrides.name ?? "Test Chain";
          if (prop === "mute") return overrides.mute ?? 0;
          if (prop === "solo") return overrides.solo ?? 0;
          if (prop === "muted_via_solo") return overrides.muted_via_solo ?? 0;
          if (prop === "choke_group") return overrides.choke_group ?? 0;
          if (prop === "out_note") return overrides.out_note ?? 60;

          return 0;
        },
        getColor: () => overrides.color ?? null,
      }) as unknown as LiveAPI;

    it("builds chain info with id, type and name", () => {
      const chain = createMockChain({ name: "My Chain" });
      const result = buildChainInfo(chain);

      expect(result).toStrictEqual({
        id: "chain-123",
        type: "Chain",
        name: "My Chain",
      });
    });

    it("includes type from chain.type property", () => {
      const chain = createMockChain({ type: "DrumChain" });
      const result = buildChainInfo(chain);

      expect(result.type).toBe("DrumChain");
    });

    it("includes path when provided", () => {
      const chain = createMockChain();
      const result = buildChainInfo(chain, { path: "1/0/0" });

      expect(result.path).toBe("1/0/0");
    });

    it("omits path when not provided", () => {
      const chain = createMockChain();
      const result = buildChainInfo(chain);

      expect(result.path).toBeUndefined();
    });

    it("includes color when chain has color", () => {
      const chain = createMockChain({ color: "#FF5500" });
      const result = buildChainInfo(chain);

      expect(result.color).toBe("#FF5500");
    });

    it("omits color when chain has no color", () => {
      const chain = createMockChain({ color: null });
      const result = buildChainInfo(chain);

      expect(result.color).toBeUndefined();
    });

    it("includes chokeGroup for DrumChain when greater than 0", () => {
      const chain = createMockChain({ type: "DrumChain", choke_group: 5 });
      const result = buildChainInfo(chain);

      expect(result.chokeGroup).toBe(5);
    });

    it("omits chokeGroup for DrumChain when 0", () => {
      const chain = createMockChain({ type: "DrumChain", choke_group: 0 });
      const result = buildChainInfo(chain);

      expect(result.chokeGroup).toBeUndefined();
    });

    it("includes mappedPitch for DrumChain", () => {
      const chain = createMockChain({ type: "DrumChain", out_note: 36 });
      const result = buildChainInfo(chain);

      expect(result.mappedPitch).toBe("C1");
    });

    it("omits mappedPitch for regular Chain", () => {
      const chain = createMockChain({ type: "Chain", out_note: 36 });
      const result = buildChainInfo(chain);

      expect(result.mappedPitch).toBeUndefined();
    });

    it("includes state when muted", () => {
      const chain = createMockChain({ mute: 1 });
      const result = buildChainInfo(chain);

      expect(result.state).toBe(STATE.MUTED);
    });

    it("includes state when soloed", () => {
      const chain = createMockChain({ solo: 1 });
      const result = buildChainInfo(chain);

      expect(result.state).toBe(STATE.SOLOED);
    });

    it("omits state when active", () => {
      const chain = createMockChain();
      const result = buildChainInfo(chain);

      expect(result.state).toBeUndefined();
    });

    it("includes devices when provided", () => {
      const chain = createMockChain();
      const devices = [{ id: "dev-1" }, { id: "dev-2" }];
      const result = buildChainInfo(chain, { devices });

      expect(result.devices).toStrictEqual(devices);
    });

    it("omits devices when not provided", () => {
      const chain = createMockChain();
      const result = buildChainInfo(chain);

      expect(result.devices).toBeUndefined();
    });

    it("builds complete DrumChain info with all properties", () => {
      const chain = createMockChain({
        type: "DrumChain",
        name: "Full Chain",
        color: "#00FF00",
        out_note: 48,
        choke_group: 3,
        mute: 1,
      });
      const devices = [{ id: "dev-1" }];
      const result = buildChainInfo(chain, {
        path: "1/0/0",
        devices,
      });

      expect(result).toStrictEqual({
        id: "chain-123",
        path: "1/0/0",
        type: "DrumChain",
        name: "Full Chain",
        color: "#00FF00",
        mappedPitch: "C2",
        chokeGroup: 3,
        state: STATE.MUTED,
        devices: [{ id: "dev-1" }],
      });
    });

    it("omits chokeGroup for regular Chain even if choke_group property exists", () => {
      const chain = createMockChain({ type: "Chain", choke_group: 5 });
      const result = buildChainInfo(chain);

      expect(result.chokeGroup).toBeUndefined();
    });
  });

  describe("isRedundantDeviceClassName", () => {
    const redundantCases: [string, string, string, boolean][] = [
      [DEVICE_TYPE.INSTRUMENT_RACK, "Instrument Rack", "matching", true],
      [DEVICE_TYPE.INSTRUMENT_RACK, "My Rack", "non-matching", false],
      [DEVICE_TYPE.DRUM_RACK, "Drum Rack", "matching", true],
      [DEVICE_TYPE.DRUM_RACK, "Custom Drums", "non-matching", false],
      [DEVICE_TYPE.AUDIO_EFFECT_RACK, "Audio Effect Rack", "matching", true],
      [DEVICE_TYPE.AUDIO_EFFECT_RACK, "FX Chain", "non-matching", false],
      [DEVICE_TYPE.MIDI_EFFECT_RACK, "MIDI Effect Rack", "matching", true],
      [DEVICE_TYPE.MIDI_EFFECT_RACK, "Arp Chain", "non-matching", false],
    ];

    it.each(redundantCases)(
      "returns correct result for %s with %s class (%s)",
      (deviceType, className, _, expected) => {
        expect(isRedundantDeviceClassName(deviceType, className)).toBe(
          expected,
        );
      },
    );

    it("returns false for non-rack device types", () => {
      expect(
        isRedundantDeviceClassName(DEVICE_TYPE.INSTRUMENT, "Wavetable"),
      ).toBe(false);
      expect(
        isRedundantDeviceClassName(DEVICE_TYPE.AUDIO_EFFECT, "Reverb"),
      ).toBe(false);
    });
  });

  describe("computeState", () => {
    type StatePropConfig = {
      mute?: number;
      solo?: number;
      muted_via_solo?: number;
    };
    const createMockLiveObj = (props: StatePropConfig) => ({
      getProperty: (p: string) => props[p as keyof StatePropConfig] ?? 0,
    });

    const stateCases: [string, StatePropConfig, string | undefined, string][] =
      [
        ["ACTIVE for master category", {}, "master", STATE.ACTIVE],
        [
          "MUTED_AND_SOLOED when both muted and soloed",
          { mute: 1, solo: 1 },
          undefined,
          STATE.MUTED_AND_SOLOED,
        ],
        ["SOLOED when only solo is true", { solo: 1 }, undefined, STATE.SOLOED],
        [
          "MUTED_ALSO_VIA_SOLO when both muted and muted_via_solo",
          { mute: 1, muted_via_solo: 1 },
          undefined,
          STATE.MUTED_ALSO_VIA_SOLO,
        ],
        [
          "MUTED_VIA_SOLO when only muted_via_solo",
          { muted_via_solo: 1 },
          undefined,
          STATE.MUTED_VIA_SOLO,
        ],
        ["MUTED when only muted", { mute: 1 }, undefined, STATE.MUTED],
        ["ACTIVE when not muted or soloed", {}, undefined, STATE.ACTIVE],
      ];

    it.each(stateCases)("returns %s", (_, props, category, expected) => {
      expect(
        computeState(createMockLiveObj(props) as unknown as LiveAPI, category),
      ).toBe(expected);
    });
  });

  describe("isInstrumentDevice", () => {
    it("returns true for instrument device type", () => {
      expect(isInstrumentDevice(DEVICE_TYPE.INSTRUMENT)).toBe(true);
      expect(isInstrumentDevice("instrument: Wavetable")).toBe(true);
    });

    it("returns true for instrument rack device type", () => {
      expect(isInstrumentDevice(DEVICE_TYPE.INSTRUMENT_RACK)).toBe(true);
      expect(isInstrumentDevice("instrument-rack: My Rack")).toBe(true);
    });

    it("returns true for drum rack device type", () => {
      expect(isInstrumentDevice(DEVICE_TYPE.DRUM_RACK)).toBe(true);
      expect(isInstrumentDevice("drum-rack: 808 Kit")).toBe(true);
    });

    it("returns false for audio effect device types", () => {
      expect(isInstrumentDevice(DEVICE_TYPE.AUDIO_EFFECT)).toBe(false);
      expect(isInstrumentDevice(DEVICE_TYPE.AUDIO_EFFECT_RACK)).toBe(false);
    });

    it("returns false for midi effect device types", () => {
      expect(isInstrumentDevice(DEVICE_TYPE.MIDI_EFFECT)).toBe(false);
      expect(isInstrumentDevice(DEVICE_TYPE.MIDI_EFFECT_RACK)).toBe(false);
    });
  });

  describe("hasInstrumentInDevices", () => {
    it("returns false for empty or null devices", () => {
      expect(hasInstrumentInDevices(null as unknown as DeviceInfo[])).toBe(
        false,
      );
      expect(hasInstrumentInDevices(undefined as unknown as DeviceInfo[])).toBe(
        false,
      );
      expect(hasInstrumentInDevices([])).toBe(false);
    });

    it("returns true when device list has an instrument", () => {
      const devices: DeviceInfo[] = [
        { type: DEVICE_TYPE.AUDIO_EFFECT },
        { type: DEVICE_TYPE.INSTRUMENT },
      ];

      expect(hasInstrumentInDevices(devices)).toBe(true);
    });

    it("returns false when no instruments present", () => {
      const devices: DeviceInfo[] = [
        { type: DEVICE_TYPE.AUDIO_EFFECT },
        { type: DEVICE_TYPE.MIDI_EFFECT },
      ];

      expect(hasInstrumentInDevices(devices)).toBe(false);
    });

    it("finds instruments in nested chains", () => {
      const devices: DeviceInfo[] = [
        {
          type: DEVICE_TYPE.AUDIO_EFFECT_RACK,
          chains: [
            {
              devices: [{ type: DEVICE_TYPE.INSTRUMENT }],
            },
          ],
        },
      ];

      expect(hasInstrumentInDevices(devices)).toBe(true);
    });

    it("returns false when nested chains have no instruments", () => {
      const devices: DeviceInfo[] = [
        {
          type: DEVICE_TYPE.AUDIO_EFFECT_RACK,
          chains: [
            {
              devices: [{ type: DEVICE_TYPE.AUDIO_EFFECT }],
            },
          ],
        },
      ];

      expect(hasInstrumentInDevices(devices)).toBe(false);
    });

    it("handles chains without devices property", () => {
      const devices: DeviceInfo[] = [
        {
          type: DEVICE_TYPE.AUDIO_EFFECT_RACK,
          chains: [{}],
        },
      ];

      expect(hasInstrumentInDevices(devices)).toBe(false);
    });
  });

  describe("updateDrumPadSoloStates", () => {
    // Helper to create drum pad chain objects
    const drumPad = (
      pitch: string,
      name: string,
      state?: string,
    ): DrumPadInfo =>
      state !== undefined
        ? { note: 36, pitch, name, state }
        : { note: 36, pitch, name };

    it("does nothing when no drum chain is soloed", () => {
      const chains = [drumPad("C3", "Kick"), drumPad("D3", "Snare")];

      updateDrumPadSoloStates(chains);
      expect(chains[0]!.state).toBeUndefined();
      expect(chains[1]!.state).toBeUndefined();
    });

    it("keeps soloed state unchanged and sets others to MUTED_VIA_SOLO", () => {
      const chains = [
        drumPad("C3", "Kick", STATE.SOLOED),
        drumPad("D3", "Snare"),
      ];

      updateDrumPadSoloStates(chains);
      expect(chains[0]!.state).toBe(STATE.SOLOED);
      expect(chains[1]!.state).toBe(STATE.MUTED_VIA_SOLO);
    });

    it("sets muted chains to MUTED_ALSO_VIA_SOLO when another is soloed", () => {
      const chains = [
        drumPad("C3", "Kick", STATE.SOLOED),
        drumPad("D3", "Snare", STATE.MUTED),
      ];

      updateDrumPadSoloStates(chains);
      expect(chains[0]!.state).toBe(STATE.SOLOED);
      expect(chains[1]!.state).toBe(STATE.MUTED_ALSO_VIA_SOLO);
    });
  });

  describe("readMacroVariations", () => {
    it("returns empty object for non-rack device", () => {
      const device = {
        getProperty: () => 0, // can_have_chains = 0
      };

      expect(readMacroVariations(device as unknown as LiveAPI)).toStrictEqual(
        {},
      );
    });

    it("returns empty object for rack with no variations", () => {
      const device = {
        getProperty: (prop: string) => (prop === "can_have_chains" ? 1 : 0),
      };

      expect(readMacroVariations(device as unknown as LiveAPI)).toStrictEqual(
        {},
      );
    });

    it("returns variations object with count and selected", () => {
      const device = {
        getProperty: (prop: string) => {
          switch (prop) {
            case "can_have_chains":
              return 1;
            case "variation_count":
              return 5;
            case "selected_variation_index":
              return 2;
            default:
              return 0;
          }
        },
      };

      expect(readMacroVariations(device as unknown as LiveAPI)).toStrictEqual({
        variations: {
          count: 5,
          selected: 2,
        },
      });
    });

    it("returns macros info when visible macros exist", () => {
      const device = {
        getProperty: (prop: string) => {
          switch (prop) {
            case "can_have_chains":
              return 1;
            case "visible_macro_count":
              return 8;
            case "has_macro_mappings":
              return 1;
            default:
              return 0;
          }
        },
      };

      expect(readMacroVariations(device as unknown as LiveAPI)).toStrictEqual({
        macros: { count: 8, hasMappings: true },
      });
    });

    it("omits macros when visible_macro_count is 0", () => {
      const device = {
        getProperty: (prop: string) => {
          switch (prop) {
            case "can_have_chains":
              return 1;
            default:
              return 0;
          }
        },
      };

      expect(readMacroVariations(device as unknown as LiveAPI)).toStrictEqual(
        {},
      );
    });

    it("returns both variations and macros when both exist", () => {
      const device = {
        getProperty: (prop: string) => {
          switch (prop) {
            case "can_have_chains":
              return 1;
            case "variation_count":
              return 3;
            case "selected_variation_index":
              return 1;
            case "visible_macro_count":
              return 4;
            case "has_macro_mappings":
              return 0;
            default:
              return 0;
          }
        },
      };

      expect(readMacroVariations(device as unknown as LiveAPI)).toStrictEqual({
        variations: { count: 3, selected: 1 },
        macros: { count: 4, hasMappings: false },
      });
    });
  });

  describe("readABCompare", () => {
    it("returns empty object for device without AB support", () => {
      const device = {
        getProperty: () => 0, // can_compare_ab = 0
      };

      expect(readABCompare(device as unknown as LiveAPI)).toStrictEqual({});
    });

    it("returns { abCompare: 'a' } when on preset A", () => {
      const device = {
        getProperty: (prop: string) => {
          switch (prop) {
            case "can_compare_ab":
              return 1;
            case "is_using_compare_preset_b":
              return 0;
            default:
              return 0;
          }
        },
      };

      expect(readABCompare(device as unknown as LiveAPI)).toStrictEqual({
        abCompare: "a",
      });
    });

    it("returns { abCompare: 'b' } when on preset B", () => {
      const device = {
        getProperty: (prop: string) => {
          switch (prop) {
            case "can_compare_ab":
              return 1;
            case "is_using_compare_preset_b":
              return 1;
            default:
              return 0;
          }
        },
      };

      expect(readABCompare(device as unknown as LiveAPI)).toStrictEqual({
        abCompare: "b",
      });
    });
  });

  describe("processDeviceChains", () => {
    const createMockChain = (
      name: string,
      overrides: MockChainOverrides = {},
    ) => ({
      id: `chain-${name}`,
      type: "Chain",
      getProperty: (prop: string) => {
        if (prop === "name") return name;
        if (prop === "mute") return 0;
        if (prop === "solo") return 0;
        if (prop === "muted_via_solo") return 0;

        return 0;
      },
      getColor: () => null,
      getChildren: (child: string) => {
        if (child === "devices") return overrides.devices ?? [];

        return [];
      },
    });

    it("processes return chains when includeReturnChains is true", () => {
      const mockDevice = {
        getChildren: (child: string) => {
          if (child === "chains") return [];

          if (child === "return_chains") {
            return [createMockChain("Return A"), createMockChain("Return B")];
          }

          return [];
        },
      };

      const deviceInfo: DeviceInfoResult = {};
      const mockReadDevice = (d: { id: string }) => ({
        id: d.id,
        type: "effect",
      });

      processDeviceChains(
        mockDevice as unknown as LiveAPI,
        deviceInfo,
        DEVICE_TYPE.AUDIO_EFFECT_RACK,
        {
          includeChains: false,
          includeReturnChains: true,
          includeDrumPads: false,
          depth: 0,
          maxDepth: 2,
          readDeviceFn: mockReadDevice,
          devicePath: "0",
        },
      );

      expect(deviceInfo.returnChains).toHaveLength(2);
      expect(deviceInfo.returnChains![0]).toMatchObject({
        id: "chain-Return A",
        name: "Return A",
      });
      expect(deviceInfo.returnChains![1]).toMatchObject({
        id: "chain-Return B",
        name: "Return B",
      });
    });

    it("skips return chains when device has none", () => {
      const mockDevice = {
        getChildren: (child: string) => {
          if (child === "chains") return [];
          if (child === "return_chains") return [];

          return [];
        },
      };

      const deviceInfo: DeviceInfoResult = {};

      processDeviceChains(
        mockDevice as unknown as LiveAPI,
        deviceInfo,
        DEVICE_TYPE.AUDIO_EFFECT_RACK,
        {
          includeChains: false,
          includeReturnChains: true,
          includeDrumPads: false,
          depth: 0,
          maxDepth: 2,
          readDeviceFn: () => ({}),
          devicePath: undefined,
        },
      );

      expect(deviceInfo.returnChains).toBeUndefined();
    });

    it("processes return chains with nested devices and builds paths", () => {
      const mockNestedDevice = { id: "nested-dev-1" };
      const createReturnChain = (name: string) => ({
        id: `return-chain-${name}`,
        type: "Chain",
        getProperty: (prop: string) => {
          if (prop === "name") return name;

          return 0;
        },
        getColor: () => null,
        getChildren: (child: string) => {
          if (child === "devices") return [mockNestedDevice];

          return [];
        },
      });

      const mockDevice = {
        getChildren: (child: string) => {
          if (child === "chains") return [];
          if (child === "return_chains") return [createReturnChain("Return A")];

          return [];
        },
      };

      const deviceInfo: DeviceInfoResult = {};

      const readDeviceCalls: {
        device: { id: string };
        options: Record<string, unknown>;
      }[] = [];

      const mockReadDevice = (
        device: { id: string },
        options: Record<string, unknown>,
      ) => {
        readDeviceCalls.push({ device, options });

        return { id: device.id, type: "effect" };
      };

      processDeviceChains(
        mockDevice as unknown as LiveAPI,
        deviceInfo,
        DEVICE_TYPE.AUDIO_EFFECT_RACK,
        {
          includeChains: false,
          includeReturnChains: true,
          includeDrumPads: false,
          depth: 0,
          maxDepth: 2,
          readDeviceFn: mockReadDevice,
          devicePath: "0",
        },
      );

      expect(deviceInfo.returnChains).toHaveLength(1);
      expect(deviceInfo.returnChains![0]!.devices).toHaveLength(1);
      expect(deviceInfo.returnChains![0]!.devices![0]).toMatchObject({
        id: "nested-dev-1",
        type: "effect",
      });
      // Verify readDevice was called with correct nested path
      expect(readDeviceCalls).toHaveLength(1);
      expect(readDeviceCalls[0]!.options.parentPath).toBe("0/rc0/0");
    });
  });
});
