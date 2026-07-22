// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/v8-max-console.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { LiveAPI as MockLiveAPI } from "#src/test/mocks/mock-live-api.ts";
import {
  DEVICE_CLASS,
  DEVICE_TYPE,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import {
  cleanupInternalDrumPads,
  getDrumMap,
  getDeviceType,
  readDevice,
} from "./device-reader.ts";

vi.mocked(MockLiveAPI);

// Helper interface for device info result with internal drum pads
interface DeviceInfoWithDrumPads {
  _processedDrumPads?: unknown;
  [key: string]: unknown;
}

describe("device-reader", () => {
  describe("getDeviceType", () => {
    it("returns drum rack for instrument with drum pads", () => {
      const device = {
        getProperty: (prop: string) => {
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

      expect(getDeviceType(device as unknown as LiveAPI)).toBe(
        DEVICE_TYPE.DRUM_RACK,
      );
    });

    it("returns instrument rack for instrument with chains", () => {
      const device = {
        getProperty: (prop: string) => {
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

      expect(getDeviceType(device as unknown as LiveAPI)).toBe(
        DEVICE_TYPE.INSTRUMENT_RACK,
      );
    });

    it("returns instrument for basic instrument device", () => {
      const device = {
        getProperty: (prop: string) => {
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

      expect(getDeviceType(device as unknown as LiveAPI)).toBe(
        DEVICE_TYPE.INSTRUMENT,
      );
    });

    it("returns audio effect rack for audio effect with chains", () => {
      const device = {
        getProperty: (prop: string) => {
          if (prop === "type") {
            return LIVE_API_DEVICE_TYPE_AUDIO_EFFECT;
          }

          if (prop === "can_have_chains") {
            return true;
          }

          return null;
        },
      };

      expect(getDeviceType(device as unknown as LiveAPI)).toBe(
        DEVICE_TYPE.AUDIO_EFFECT_RACK,
      );
    });

    it("returns audio effect for basic audio effect device", () => {
      const device = {
        getProperty: (prop: string) => {
          if (prop === "type") {
            return LIVE_API_DEVICE_TYPE_AUDIO_EFFECT;
          }

          if (prop === "can_have_chains") {
            return false;
          }

          return null;
        },
      };

      expect(getDeviceType(device as unknown as LiveAPI)).toBe(
        DEVICE_TYPE.AUDIO_EFFECT,
      );
    });

    it("returns midi effect rack for midi effect with chains", () => {
      const device = {
        getProperty: (prop: string) => {
          if (prop === "type") {
            return LIVE_API_DEVICE_TYPE_MIDI_EFFECT;
          }

          if (prop === "can_have_chains") {
            return true;
          }

          return null;
        },
      };

      expect(getDeviceType(device as unknown as LiveAPI)).toBe(
        DEVICE_TYPE.MIDI_EFFECT_RACK,
      );
    });

    it("returns midi effect for basic midi effect device", () => {
      const device = {
        getProperty: (prop: string) => {
          if (prop === "type") {
            return LIVE_API_DEVICE_TYPE_MIDI_EFFECT;
          }

          if (prop === "can_have_chains") {
            return false;
          }

          return null;
        },
      };

      expect(getDeviceType(device as unknown as LiveAPI)).toBe(
        DEVICE_TYPE.MIDI_EFFECT,
      );
    });

    it("returns unknown for unrecognized device type", () => {
      const device = {
        getProperty: (prop: string) => {
          if (prop === "type") {
            return 999;
          }

          return null;
        },
      };

      expect(getDeviceType(device as unknown as LiveAPI)).toBe("unknown");
    });
  });

  describe("cleanupInternalDrumPads", () => {
    it("returns primitive values unchanged", () => {
      expect(cleanupInternalDrumPads(null)).toBe(null);
      expect(cleanupInternalDrumPads(undefined)).toBe(undefined);
      expect(cleanupInternalDrumPads(42)).toBe(42);
      expect(cleanupInternalDrumPads("test")).toBe("test");
    });

    it("removes _processedDrumPads from object", () => {
      const obj = {
        type: "drum-rack",
        name: "Test",
        _processedDrumPads: [{ pitch: "C3", name: "Kick" }],
      };
      const result = cleanupInternalDrumPads(obj) as DeviceInfoWithDrumPads;

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

    it("returns a non-object chain entry unchanged", () => {
      // The `typeof chain === "object"` test must short-circuit: probing a
      // primitive with the `in` operator would throw.
      const obj = { type: "audio-effect-rack", chains: ["raw-entry"] };

      expect(cleanupInternalDrumPads(obj)).toStrictEqual({
        type: "audio-effect-rack",
        chains: ["raw-entry"],
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

    it("ignores a drum rack that has no processed pads", () => {
      // Both halves must hold: a drum-rack-typed device without
      // _processedDrumPads carries no map and must not be collected.
      expect(getDrumMap([{ type: "drum-rack" }])).toBe(null);
    });

    it("ignores a nested chain that has no devices", () => {
      // The `chain.devices` guard protects the recursive descent — without it,
      // iterating an absent device list would throw.
      const devices = [{ type: "instrument-rack", chains: [{}] }];

      expect(getDrumMap(devices)).toBe(null);
    });

    it("keys a note-0 pad by MIDI number for midi-json notation", () => {
      // MIDI note 0 is a real note, not a catch-all: the catch-all test is
      // `midi < 0`, so 0 must fall through to the notation-specific key.
      const devices = [
        {
          type: "drum-rack",
          _processedDrumPads: [{ note: 0, pitch: "C-2", name: "Sub" }],
        },
      ];

      expect(getDrumMap(devices, "midi-json")).toStrictEqual({ 0: "Sub" });
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

    it("keys the drum map by drum name for stark notation", () => {
      const devices = [
        {
          type: "drum-rack",
          _processedDrumPads: [
            { note: 36, pitch: "C1", name: "Kick" },
            { note: 38, pitch: "D1", name: "Snare" },
            { note: 42, pitch: "F#1", name: "Hi-Hat" },
          ],
        },
      ];

      expect(getDrumMap(devices, "stark")).toStrictEqual({
        kick: "Kick",
        snare: "Snare",
        hihat: "Hi-Hat",
      });
    });

    it("falls back to the pitch name for pads outside the drum-name range", () => {
      const devices = [
        {
          type: "drum-rack",
          _processedDrumPads: [
            { note: 36, pitch: "C1", name: "Kick" },
            { note: 60, pitch: "C3", name: "Bell" },
            { note: -1, pitch: "*", name: "Catch-all" },
          ],
        },
      ];

      expect(getDrumMap(devices, "stark")).toStrictEqual({
        kick: "Kick",
        C3: "Bell",
        "*": "Catch-all",
      });
    });

    it.each(["barbeat", undefined] as const)(
      "keys the drum map by pitch name for %s notation",
      (notation) => {
        const devices = [
          {
            type: "drum-rack",
            _processedDrumPads: [
              { note: 36, pitch: "C1", name: "Kick" },
              { note: 38, pitch: "D1", name: "Snare" },
            ],
          },
        ];

        expect(getDrumMap(devices, notation)).toStrictEqual({
          C1: "Kick",
          D1: "Snare",
        });
      },
    );

    it("keys the drum map by MIDI number for midi-json notation", () => {
      const devices = [
        {
          type: "drum-rack",
          _processedDrumPads: [
            { note: 36, pitch: "C1", name: "Kick" },
            { note: 38, pitch: "D1", name: "Snare" },
            { note: -1, pitch: "*", name: "Catch-all" },
          ],
        },
      ];

      expect(getDrumMap(devices, "midi-json")).toStrictEqual({
        36: "Kick",
        38: "Snare",
        "*": "Catch-all",
      });
    });
  });

  describe("readDevice", () => {
    const g = globalThis as Record<string, unknown>;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns empty object when max recursion depth exceeded", () => {
      const consoleSpy = vi.spyOn(console, "warn");
      const device = makeOperatorDevice();

      setupLiveApiMock();

      // Call with depth > maxDepth
      const result = readDevice(device as unknown as LiveAPI, {
        depth: 5,
        maxDepth: 4,
      });

      expect(result).toStrictEqual({});
      expect(consoleSpy).toHaveBeenCalledWith(
        "Maximum recursion depth (4) exceeded",
      );
    });

    it("omits the focused sample field for Simpler in multisample mode", () => {
      const device = makeSimplerDevice({ multiSampleMode: 1 });

      setupLiveApiMock();

      const result = readDevice(device as unknown as LiveAPI, {
        includeChains: false,
        includeSample: true,
      });

      // No single sample loaded in multi-sample mode → no top-level `sample`
      // field (multi-sample state is conveyed via the multiSampleMode param in
      // the full `params` view).
      expect(result.multisample).toBeUndefined();
      expect(result.sample).toBeUndefined();
      expect(result.parameters).toBeUndefined();
    });

    it("returns the focused sample as a flat top-level field (no gainDb, no parameters)", () => {
      const device = makeSimplerDevice({ samplePath: "/tmp/kick.wav" });

      setupLiveApiMock();

      const result = readDevice(device as LiveAPI, {
        includeChains: false,
        includeSample: true,
      });

      expect(result.sample).toBe("/tmp/kick.wav");
      expect(result.gainDb).toBeUndefined();
      expect(result.parameters).toBeUndefined();
    });

    it("emits both the top-level sample field and the sample param entry when params and sample are both included", () => {
      const device = makeSimplerDevice({ samplePath: "/tmp/kick.wav" });

      setupLiveApiMock();

      const result = readDevice(device as LiveAPI, {
        includeChains: false,
        includeParams: true,
        includeSample: true,
      });

      // The two includes are independent (e.g. include:["*"]): the flat
      // top-level `sample` is emitted alongside the `sample` param entry —
      // redundant, but least-surprising.
      expect(result.sample).toBe("/tmp/kick.wav");

      const params = result.parameters as Record<string, unknown>[];

      expect(params).toContainEqual({ name: "sample", value: "/tmp/kick.wav" });
    });

    function makeSimplerDevice(opts: {
      multiSampleMode?: number;
      samplePath?: string;
    }): unknown {
      const sampleChild = {
        getProperty: (prop: string) =>
          prop === "file_path" ? (opts.samplePath ?? null) : null,
      };

      return {
        id: "simpler_1",
        path: "live_set tracks 0 devices 0",
        getProperty: (prop: string) => {
          if (prop === "type") return LIVE_API_DEVICE_TYPE_INSTRUMENT;
          if (prop === "can_have_chains") return false;
          if (prop === "can_have_drum_pads") return false;
          if (prop === "class_display_name") return DEVICE_CLASS.SIMPLER;
          if (prop === "name") return DEVICE_CLASS.SIMPLER;
          if (prop === "is_active") return 1;
          if (prop === "multi_sample_mode") return opts.multiSampleMode ?? 0;

          return null;
        },
        getChildren: (kind: string) => {
          if (kind === "sample" && opts.samplePath) return [sampleChild];

          return [];
        },
        call: (method: string) =>
          method === "guess_playback_length" ? 16 : null,
      };
    }

    function setupLiveApiMock(): void {
      interface MockInstance {
        exists: ReturnType<typeof vi.fn>;
        getProperty: ReturnType<typeof vi.fn>;
      }
      const TestMockLiveAPI = vi.fn(function (this: MockInstance) {
        this.exists = vi.fn().mockReturnValue(false);
        this.getProperty = vi.fn().mockReturnValue(0);
      }) as unknown as { from: ReturnType<typeof vi.fn>; new (): MockInstance };

      TestMockLiveAPI.from = vi.fn(() => new TestMockLiveAPI());
      g.LiveAPI = TestMockLiveAPI;
    }

    function makeOperatorDevice(): unknown {
      return {
        id: "op_1",
        path: "live_set tracks 0 devices 0",
        getProperty: (prop: string) => {
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
    }

    function readParamsWithSample(device: unknown): Record<string, unknown>[] {
      setupLiveApiMock();

      const result = readDevice(device as LiveAPI, {
        includeChains: false,
        includeParams: true,
      });

      return result.parameters as Record<string, unknown>[];
    }

    it("adds synthetic sample entry to parameters[] when params included", () => {
      const params = readParamsWithSample(
        makeSimplerDevice({ samplePath: "/tmp/kick.wav" }),
      );

      expect(params[0]).toStrictEqual({
        name: "sample",
        value: "/tmp/kick.wav",
      });
    });

    it("does not add synthetic sample entry for non-Simpler devices", () => {
      const params = readParamsWithSample(makeOperatorDevice());

      expect(params.find((p) => p.name === "sample")).toBeUndefined();
    });

    it("omits synthetic sample entry for Simpler in multi-sample mode", () => {
      const params = readParamsWithSample(
        makeSimplerDevice({ multiSampleMode: 1, samplePath: "/tmp/kick.wav" }),
      );

      expect(params.find((p) => p.name === "sample")).toBeUndefined();
    });

    it("omits synthetic sample entry when no sample is loaded", () => {
      const params = readParamsWithSample(makeSimplerDevice({}));

      expect(params.find((p) => p.name === "sample")).toBeUndefined();
    });

    it("filters synthetic sample entry by paramSearch", () => {
      const device = makeSimplerDevice({ samplePath: "/tmp/kick.wav" });

      setupLiveApiMock();

      const matched = readDevice(device as LiveAPI, {
        includeChains: false,
        includeParams: true,
        paramSearch: "samp",
      });
      const matchedParams = matched.parameters as Record<string, unknown>[];

      expect(matchedParams[0]).toStrictEqual({
        name: "sample",
        value: "/tmp/kick.wav",
      });

      const filteredOut = readDevice(device as LiveAPI, {
        includeChains: false,
        includeParams: true,
        paramSearch: "volume",
      });
      const filteredParams = filteredOut.parameters as Record<
        string,
        unknown
      >[];

      expect(filteredParams.find((p) => p.name === "sample")).toBeUndefined();
    });
  });
});
