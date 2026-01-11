import { beforeEach, describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/v8-max-console.js";
import "#src/live-api-adapter/live-api-extensions.js";
import { LiveAPI } from "#src/test/mock-live-api.js";
import {
  DEVICE_CLASS,
  DEVICE_TYPE,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.js";
import {
  cleanupInternalDrumPads,
  getDrumMap,
  getDeviceType,
  readDevice,
} from "./device-reader.js";

vi.mocked(LiveAPI);

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

  describe("cleanupInternalDrumPads", () => {
    it("returns primitive values unchanged", () => {
      expect(cleanupInternalDrumPads(null)).toBe(null);
      expect(cleanupInternalDrumPads()).toBe(undefined);
      expect(cleanupInternalDrumPads(42)).toBe(42);
      expect(cleanupInternalDrumPads("test")).toBe("test");
    });

    it("removes _processedDrumPads from object", () => {
      const obj = {
        type: "drum-rack",
        name: "Test",
        _processedDrumPads: [{ pitch: "C3", name: "Kick" }],
      };
      const result = cleanupInternalDrumPads(obj);

      expect(result).toStrictEqual({
        type: "drum-rack",
        name: "Test",
      });
      expect(result._processedDrumPads).toBeUndefined();
    });

    it("recursively cleans arrays of objects", () => {
      const arr = [
        { type: "device1", _processedDrumPads: [] },
        { type: "device2", _processedDrumPads: [] },
      ];
      const result = cleanupInternalDrumPads(arr);

      expect(result).toStrictEqual([{ type: "device1" }, { type: "device2" }]);
    });

    it("recursively cleans chains in device objects", () => {
      const obj = {
        type: "drum-rack",
        chains: [
          {
            name: "Chain 1",
            devices: [
              { type: "device1", _processedDrumPads: [] },
              { type: "device2", _processedDrumPads: [] },
            ],
          },
        ],
        _processedDrumPads: [],
      };
      const result = cleanupInternalDrumPads(obj);

      expect(result).toStrictEqual({
        type: "drum-rack",
        chains: [
          {
            name: "Chain 1",
            devices: [{ type: "device1" }, { type: "device2" }],
          },
        ],
      });
    });

    it("returns chain unchanged when it has no devices property", () => {
      const obj = {
        type: "audio-effect-rack",
        chains: [
          {
            name: "Chain without devices",
            volume: 0.8,
          },
        ],
      };
      const result = cleanupInternalDrumPads(obj);

      expect(result).toStrictEqual({
        type: "audio-effect-rack",
        chains: [
          {
            name: "Chain without devices",
            volume: 0.8,
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

    it("returns empty object when drum rack has no playable chains", () => {
      const devices = [
        {
          type: "drum-rack",
          _processedDrumPads: [
            { pitch: "C3", name: "Kick", hasInstrument: false },
            { pitch: "D3", name: "Snare", hasInstrument: false },
          ],
        },
      ];

      expect(getDrumMap(devices)).toStrictEqual({});
    });

    it("extracts drum map from drum rack", () => {
      const devices = [
        {
          type: "drum-rack",
          _processedDrumPads: [
            { pitch: "C3", name: "Kick" },
            { pitch: "D3", name: "Snare" },
            { pitch: "F#3", name: "Hi-Hat" },
          ],
        },
      ];

      expect(getDrumMap(devices)).toStrictEqual({
        C3: "Kick",
        D3: "Snare",
        "F#3": "Hi-Hat",
      });
    });

    it("excludes chains without instruments", () => {
      const devices = [
        {
          type: "drum-rack",
          _processedDrumPads: [
            { pitch: "C3", name: "Kick" },
            { pitch: "D3", name: "Empty", hasInstrument: false },
            { pitch: "E3", name: "Snare" },
          ],
        },
      ];

      expect(getDrumMap(devices)).toStrictEqual({
        C3: "Kick",
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
                  _processedDrumPads: [
                    { pitch: "C3", name: "Kick" },
                    { pitch: "D3", name: "Snare" },
                  ],
                },
              ],
            },
          ],
        },
      ];

      expect(getDrumMap(devices)).toStrictEqual({
        C3: "Kick",
        D3: "Snare",
      });
    });

    it("uses first drum rack when multiple found", () => {
      const devices = [
        {
          type: "drum-rack",
          _processedDrumPads: [{ pitch: "C3", name: "First Kick" }],
        },
        {
          type: "drum-rack",
          _processedDrumPads: [{ pitch: "D3", name: "Second Snare" }],
        },
      ];

      expect(getDrumMap(devices)).toStrictEqual({
        C3: "First Kick",
      });
    });
  });

  describe("readDevice", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns empty object when max recursion depth exceeded", () => {
      const consoleSpy = vi.spyOn(console, "error");
      const device = {
        id: "device_1",
        path: "live_set tracks 0 devices 0",
        getProperty: (prop) => {
          if (prop === "type") return LIVE_API_DEVICE_TYPE_INSTRUMENT;
          if (prop === "can_have_chains") return false;
          if (prop === "can_have_drum_pads") return false;
          if (prop === "class_display_name") return "Operator";
          if (prop === "name") return "Operator";
          if (prop === "is_active") return 1;

          return null;
        },
        getChildren: () => [],
      };

      // Mock LiveAPI for device view
      global.LiveAPI = vi.fn().mockImplementation(() => ({
        exists: vi.fn().mockReturnValue(false),
        getProperty: vi.fn().mockReturnValue(0),
      }));

      // Call with depth > maxDepth
      const result = readDevice(device, { depth: 5, maxDepth: 4 });

      expect(result).toStrictEqual({});
      expect(consoleSpy).toHaveBeenCalledWith(
        "Maximum recursion depth (4) exceeded",
      );
    });

    it("returns multisample flag for Simpler in multisample mode", () => {
      const device = {
        id: "simpler_1",
        path: "live_set tracks 0 devices 0",
        getProperty: (prop) => {
          if (prop === "type") return LIVE_API_DEVICE_TYPE_INSTRUMENT;
          if (prop === "can_have_chains") return false;
          if (prop === "can_have_drum_pads") return false;
          if (prop === "class_display_name") return DEVICE_CLASS.SIMPLER;
          if (prop === "name") return DEVICE_CLASS.SIMPLER;
          if (prop === "is_active") return 1;
          if (prop === "multi_sample_mode") return 1;

          return null;
        },
        getChildren: () => [],
      };

      // Mock LiveAPI for device view
      global.LiveAPI = vi.fn(function () {
        this.exists = vi.fn().mockReturnValue(false);
        this.getProperty = vi.fn().mockReturnValue(0);
      });

      const result = readDevice(device, { includeChains: false });

      expect(result.multisample).toBe(true);
      expect(result.sample).toBeUndefined();
    });
  });
});
