import { describe, expect, it } from "vitest";
import {
  DEVICE_TYPE,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.js";
import {
  cleanupInternalDrumChains,
  getDrumMap,
  getDeviceType,
} from "./device-reader.js";

describe("device-reader", () => {
  describe("getDeviceType", () => {
    it("returns drum rack for instrument with drum pads", () => {
      const device = {
        getProperty: (prop) => {
          if (prop === "type") {
            return LIVE_API_DEVICE_TYPE_INSTRUMENT;
          }
          if (prop === "can_have_drum_pads") {
            return true;
          }
          if (prop === "can_have_chains") {
            return false;
          }
          return null;
        },
      };
      expect(getDeviceType(device)).toBe(DEVICE_TYPE.DRUM_RACK);
    });

    it("returns instrument rack for instrument with chains", () => {
      const device = {
        getProperty: (prop) => {
          if (prop === "type") {
            return LIVE_API_DEVICE_TYPE_INSTRUMENT;
          }
          if (prop === "can_have_drum_pads") {
            return false;
          }
          if (prop === "can_have_chains") {
            return true;
          }
          return null;
        },
      };
      expect(getDeviceType(device)).toBe(DEVICE_TYPE.INSTRUMENT_RACK);
    });

    it("returns instrument for basic instrument device", () => {
      const device = {
        getProperty: (prop) => {
          if (prop === "type") {
            return LIVE_API_DEVICE_TYPE_INSTRUMENT;
          }
          if (prop === "can_have_drum_pads") {
            return false;
          }
          if (prop === "can_have_chains") {
            return false;
          }
          return null;
        },
      };
      expect(getDeviceType(device)).toBe(DEVICE_TYPE.INSTRUMENT);
    });

    it("returns audio effect rack for audio effect with chains", () => {
      const device = {
        getProperty: (prop) => {
          if (prop === "type") {
            return LIVE_API_DEVICE_TYPE_AUDIO_EFFECT;
          }
          if (prop === "can_have_chains") {
            return true;
          }
          return null;
        },
      };
      expect(getDeviceType(device)).toBe(DEVICE_TYPE.AUDIO_EFFECT_RACK);
    });

    it("returns audio effect for basic audio effect device", () => {
      const device = {
        getProperty: (prop) => {
          if (prop === "type") {
            return LIVE_API_DEVICE_TYPE_AUDIO_EFFECT;
          }
          if (prop === "can_have_chains") {
            return false;
          }
          return null;
        },
      };
      expect(getDeviceType(device)).toBe(DEVICE_TYPE.AUDIO_EFFECT);
    });

    it("returns midi effect rack for midi effect with chains", () => {
      const device = {
        getProperty: (prop) => {
          if (prop === "type") {
            return LIVE_API_DEVICE_TYPE_MIDI_EFFECT;
          }
          if (prop === "can_have_chains") {
            return true;
          }
          return null;
        },
      };
      expect(getDeviceType(device)).toBe(DEVICE_TYPE.MIDI_EFFECT_RACK);
    });

    it("returns midi effect for basic midi effect device", () => {
      const device = {
        getProperty: (prop) => {
          if (prop === "type") {
            return LIVE_API_DEVICE_TYPE_MIDI_EFFECT;
          }
          if (prop === "can_have_chains") {
            return false;
          }
          return null;
        },
      };
      expect(getDeviceType(device)).toBe(DEVICE_TYPE.MIDI_EFFECT);
    });

    it("returns unknown for unrecognized device type", () => {
      const device = {
        getProperty: (prop) => {
          if (prop === "type") {
            return 999;
          }
          return null;
        },
      };
      expect(getDeviceType(device)).toBe("unknown");
    });
  });

  describe("cleanupInternalDrumChains", () => {
    it("returns primitive values unchanged", () => {
      expect(cleanupInternalDrumChains(null)).toBe(null);
      expect(cleanupInternalDrumChains(undefined)).toBe(undefined);
      expect(cleanupInternalDrumChains(42)).toBe(42);
      expect(cleanupInternalDrumChains("test")).toBe("test");
    });

    it("removes _processedDrumChains from object", () => {
      const obj = {
        type: "drum-rack",
        name: "Test",
        _processedDrumChains: [{ pitch: "C3", name: "Kick" }],
      };
      const result = cleanupInternalDrumChains(obj);
      expect(result).toEqual({
        type: "drum-rack",
        name: "Test",
      });
      expect(result._processedDrumChains).toBeUndefined();
    });

    it("recursively cleans arrays of objects", () => {
      const arr = [
        { type: "device1", _processedDrumChains: [] },
        { type: "device2", _processedDrumChains: [] },
      ];
      const result = cleanupInternalDrumChains(arr);
      expect(result).toEqual([{ type: "device1" }, { type: "device2" }]);
    });

    it("recursively cleans chains in device objects", () => {
      const obj = {
        type: "drum-rack",
        chains: [
          {
            name: "Chain 1",
            devices: [
              { type: "device1", _processedDrumChains: [] },
              { type: "device2", _processedDrumChains: [] },
            ],
          },
        ],
        _processedDrumChains: [],
      };
      const result = cleanupInternalDrumChains(obj);
      expect(result).toEqual({
        type: "drum-rack",
        chains: [
          {
            name: "Chain 1",
            devices: [{ type: "device1" }, { type: "device2" }],
          },
        ],
      });
    });
  });

  describe("getDrumMap", () => {
    it("returns null when no drum racks found", () => {
      const devices = [
        { type: "instrument: Analog" },
        { type: "audio-effect: Reverb" },
      ];
      expect(getDrumMap(devices)).toBe(null);
    });

    it("maps pads even when chains lack instruments", () => {
      const devices = [
        {
          type: "drum-rack",
          _processedDrumChains: [
            { pitch: "C3", name: "Kick", hasInstrument: false },
            { pitch: "D3", name: "Snare", hasInstrument: false },
          ],
        },
      ];
      expect(getDrumMap(devices)).toEqual({
        C3: "Kick",
        D3: "Snare",
      });
    });

    it("extracts drum map from drum rack", () => {
      const devices = [
        {
          type: "drum-rack",
          _processedDrumChains: [
            { pitch: "C3", name: "Kick" },
            { pitch: "D3", name: "Snare" },
            { pitch: "F#3", name: "Hi-Hat" },
          ],
        },
      ];
      expect(getDrumMap(devices)).toEqual({
        C3: "Kick",
        D3: "Snare",
        "F#3": "Hi-Hat",
      });
    });

    it("includes chain names even without instruments", () => {
      const devices = [
        {
          type: "drum-rack",
          _processedDrumChains: [
            { pitch: "C3", name: "Kick" },
            { pitch: "D3", name: "Empty", hasInstrument: false },
            { pitch: "E3", name: "Snare" },
          ],
        },
      ];
      expect(getDrumMap(devices)).toEqual({
        C3: "Kick",
        D3: "Empty",
        E3: "Snare",
      });
    });

    it("finds drum rack in nested chains", () => {
      const devices = [
        {
          type: "instrument-rack",
          chains: [
            {
              name: "Chain 1",
              devices: [
                {
                  type: "drum-rack",
                  _processedDrumChains: [
                    { pitch: "C3", name: "Kick" },
                    { pitch: "D3", name: "Snare" },
                  ],
                },
              ],
            },
          ],
        },
      ];
      expect(getDrumMap(devices)).toEqual({
        C3: "Kick",
        D3: "Snare",
      });
    });

    it("uses first drum rack when multiple found", () => {
      const devices = [
        {
          type: "drum-rack",
          _processedDrumChains: [{ pitch: "C3", name: "First Kick" }],
        },
        {
          type: "drum-rack",
          _processedDrumChains: [{ pitch: "D3", name: "Second Snare" }],
        },
      ];
      expect(getDrumMap(devices)).toEqual({
        C3: "First Kick",
      });
    });
  });
});
