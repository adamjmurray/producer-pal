import { describe, expect, it } from "vitest";
import { DEVICE_TYPE, STATE } from "#src/tools/constants.js";
import {
  isRedundantDeviceClassName,
  computeState,
  isInstrumentDevice,
  hasInstrumentInDevices,
  updateDrumChainSoloStates,
  readMacroVariations,
} from "./device-reader-helpers.js";

describe("device-reader-helpers", () => {
  describe("isRedundantDeviceClassName", () => {
    it("returns true for matching Instrument Rack", () => {
      expect(
        isRedundantDeviceClassName(
          DEVICE_TYPE.INSTRUMENT_RACK,
          "Instrument Rack",
        ),
      ).toBe(true);
    });

    it("returns false for non-matching Instrument Rack class", () => {
      expect(
        isRedundantDeviceClassName(DEVICE_TYPE.INSTRUMENT_RACK, "My Rack"),
      ).toBe(false);
    });

    it("returns true for matching Drum Rack", () => {
      expect(
        isRedundantDeviceClassName(DEVICE_TYPE.DRUM_RACK, "Drum Rack"),
      ).toBe(true);
    });

    it("returns false for non-matching Drum Rack class", () => {
      expect(
        isRedundantDeviceClassName(DEVICE_TYPE.DRUM_RACK, "Custom Drums"),
      ).toBe(false);
    });

    it("returns true for matching Audio Effect Rack", () => {
      expect(
        isRedundantDeviceClassName(
          DEVICE_TYPE.AUDIO_EFFECT_RACK,
          "Audio Effect Rack",
        ),
      ).toBe(true);
    });

    it("returns false for non-matching Audio Effect Rack class", () => {
      expect(
        isRedundantDeviceClassName(DEVICE_TYPE.AUDIO_EFFECT_RACK, "FX Chain"),
      ).toBe(false);
    });

    it("returns true for matching MIDI Effect Rack", () => {
      expect(
        isRedundantDeviceClassName(
          DEVICE_TYPE.MIDI_EFFECT_RACK,
          "MIDI Effect Rack",
        ),
      ).toBe(true);
    });

    it("returns false for non-matching MIDI Effect Rack class", () => {
      expect(
        isRedundantDeviceClassName(DEVICE_TYPE.MIDI_EFFECT_RACK, "Arp Chain"),
      ).toBe(false);
    });

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
    it("returns ACTIVE for master category", () => {
      const liveObject = { getProperty: () => 0 };
      expect(computeState(liveObject, "master")).toBe(STATE.ACTIVE);
    });

    it("returns SOLOED when solo is true", () => {
      const liveObject = {
        getProperty: (prop) => {
          if (prop === "solo") return 1;
          return 0;
        },
      };
      expect(computeState(liveObject)).toBe(STATE.SOLOED);
    });

    it("returns MUTED_ALSO_VIA_SOLO when both muted and muted_via_solo", () => {
      const liveObject = {
        getProperty: (prop) => {
          if (prop === "mute") return 1;
          if (prop === "muted_via_solo") return 1;
          return 0;
        },
      };
      expect(computeState(liveObject)).toBe(STATE.MUTED_ALSO_VIA_SOLO);
    });

    it("returns MUTED_VIA_SOLO when only muted_via_solo", () => {
      const liveObject = {
        getProperty: (prop) => {
          if (prop === "muted_via_solo") return 1;
          return 0;
        },
      };
      expect(computeState(liveObject)).toBe(STATE.MUTED_VIA_SOLO);
    });

    it("returns MUTED when only muted", () => {
      const liveObject = {
        getProperty: (prop) => {
          if (prop === "mute") return 1;
          return 0;
        },
      };
      expect(computeState(liveObject)).toBe(STATE.MUTED);
    });

    it("returns ACTIVE when not muted or soloed", () => {
      const liveObject = { getProperty: () => 0 };
      expect(computeState(liveObject)).toBe(STATE.ACTIVE);
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
      expect(hasInstrumentInDevices(null)).toBe(false);
      expect(hasInstrumentInDevices(undefined)).toBe(false);
      expect(hasInstrumentInDevices([])).toBe(false);
    });

    it("returns true when device list has an instrument", () => {
      const devices = [
        { type: DEVICE_TYPE.AUDIO_EFFECT },
        { type: DEVICE_TYPE.INSTRUMENT },
      ];
      expect(hasInstrumentInDevices(devices)).toBe(true);
    });

    it("returns false when no instruments present", () => {
      const devices = [
        { type: DEVICE_TYPE.AUDIO_EFFECT },
        { type: DEVICE_TYPE.MIDI_EFFECT },
      ];
      expect(hasInstrumentInDevices(devices)).toBe(false);
    });

    it("finds instruments in nested chains", () => {
      const devices = [
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
      const devices = [
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
      const devices = [
        {
          type: DEVICE_TYPE.AUDIO_EFFECT_RACK,
          chains: [{ name: "Empty Chain" }],
        },
      ];
      expect(hasInstrumentInDevices(devices)).toBe(false);
    });
  });

  describe("updateDrumChainSoloStates", () => {
    it("does nothing when no drum chain is soloed", () => {
      const chains = [
        { pitch: "C3", name: "Kick" },
        { pitch: "D3", name: "Snare" },
      ];
      updateDrumChainSoloStates(chains);
      expect(chains[0].state).toBeUndefined();
      expect(chains[1].state).toBeUndefined();
    });

    it("keeps soloed state unchanged", () => {
      const chains = [
        { pitch: "C3", name: "Kick", state: STATE.SOLOED },
        { pitch: "D3", name: "Snare" },
      ];
      updateDrumChainSoloStates(chains);
      expect(chains[0].state).toBe(STATE.SOLOED);
    });

    it("sets muted chains to MUTED_ALSO_VIA_SOLO when another is soloed", () => {
      const chains = [
        { pitch: "C3", name: "Kick", state: STATE.SOLOED },
        { pitch: "D3", name: "Snare", state: STATE.MUTED },
      ];
      updateDrumChainSoloStates(chains);
      expect(chains[0].state).toBe(STATE.SOLOED);
      expect(chains[1].state).toBe(STATE.MUTED_ALSO_VIA_SOLO);
    });

    it("sets unset chains to MUTED_VIA_SOLO when another is soloed", () => {
      const chains = [
        { pitch: "C3", name: "Kick", state: STATE.SOLOED },
        { pitch: "D3", name: "Snare" },
      ];
      updateDrumChainSoloStates(chains);
      expect(chains[0].state).toBe(STATE.SOLOED);
      expect(chains[1].state).toBe(STATE.MUTED_VIA_SOLO);
    });
  });

  describe("readMacroVariations", () => {
    it("returns empty object for non-rack device", () => {
      const device = {
        getProperty: () => 0, // can_have_chains = 0
      };
      expect(readMacroVariations(device)).toEqual({});
    });

    it("returns empty object for rack with no variations", () => {
      const device = {
        getProperty: (prop) => (prop === "can_have_chains" ? 1 : 0),
      };
      expect(readMacroVariations(device)).toEqual({});
    });

    it("returns variations object with count and selected", () => {
      const device = {
        getProperty: (prop) => {
          switch (prop) {
            case "can_have_chains":
              return 1;
            case "variation_count":
              return 5;
            case "selected_variation_index":
              return 2;
          }
        },
      };
      expect(readMacroVariations(device)).toEqual({
        variations: {
          count: 5,
          selected: 2,
        },
      });
    });
  });
});
