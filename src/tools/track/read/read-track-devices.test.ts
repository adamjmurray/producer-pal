// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import { stripPathProperties } from "./helpers/read-track-assertion-test-helpers.ts";
import {
  ALL_DEVICE_INCLUDE_OPTIONS,
  createChainMockProperties,
  createDeviceMockProperties,
  createRackDeviceMockProperties,
  createSinglePianoChainRackExpectation,
  setupInstrumentRackOnTrack0,
} from "./helpers/read-track-device-test-helpers.ts";
import { setupTrackMock } from "./helpers/read-track-registry-test-helpers.ts";
import { readTrack } from "./read-track.ts";

describe("readTrack", () => {
  describe("devices", () => {
    it("returns null instrument when track has no devices", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: [],
        },
      });

      const result = readTrack({ trackIndex: 0 });

      expect(result.instrument).toBeNull();
      expect(result.midiEffects).toBeUndefined();
      expect(result.audioEffects).toBeUndefined();
    });

    it("categorizes devices correctly", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: children("device1", "device2", "device3"),
        },
      });
      registerMockObject("device1", {
        path: "live_set tracks 0 devices 0",
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Custom Analog",
          className: "InstrumentVector",
          classDisplayName: "Analog",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        }),
      });
      registerMockObject("device2", {
        path: "live_set tracks 0 devices 1",
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Custom Reverb",
          className: "Reverb",
          classDisplayName: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        }),
      });
      registerMockObject("device3", {
        path: "live_set tracks 0 devices 2",
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Custom Note Length",
          className: "MidiNoteLength",
          classDisplayName: "Note Length",
          type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
          isActive: 0,
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "midi-effects",
          "audio-effects",
        ],
      });

      expect(stripPathProperties(result.instrument)).toStrictEqual({
        id: "device1",
        type: "instrument: Analog",
        name: "Custom Analog",
      });

      expect(stripPathProperties(result.audioEffects)).toStrictEqual([
        {
          id: "device2",
          type: "audio-effect: Reverb",
          name: "Custom Reverb",
        },
      ]);

      expect(stripPathProperties(result.midiEffects)).toStrictEqual([
        {
          id: "device3",
          type: "midi-effect: Note Length",
          name: "Custom Note Length",
          deactivated: true,
        },
      ]);
    });

    it("correctly identifies drum rack devices", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: children("device1"),
        },
      });
      registerMockObject("device1", {
        path: "live_set tracks 0 devices 0",
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "My Drums",
          className: "DrumGroupDevice",
          classDisplayName: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          canHaveDrumPads: 1,
          extraProperties: {
            drum_pads: [],
          },
        }),
      });

      const result = readTrack({ trackIndex: 0 });

      expect(stripPathProperties(result.instrument)).toStrictEqual({
        id: "device1",
        name: "My Drums",
        type: "drum-rack",
        // drumPads: [], // Only included when drum-pads is requested
      });
    });

    it("includes all device categories when explicitly requested", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: children("device1", "device2"),
        },
      });
      registerMockObject("device1", {
        path: "live_set tracks 0 devices 0",
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "My Drums",
          className: "DrumGroupDevice",
          classDisplayName: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          canHaveDrumPads: 1,
        }),
      });
      registerMockObject("device2", {
        path: "live_set tracks 0 devices 1",
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Reverb",
          className: "Reverb",
          classDisplayName: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ALL_DEVICE_INCLUDE_OPTIONS,
      });

      expect(stripPathProperties(result.instrument)).toStrictEqual({
        id: "device1",
        type: "drum-rack",
        name: "My Drums",
        // drumPads: [], // Only included when drum-pads is requested
      });

      const audioEffects = result.audioEffects as Array<
        Record<string, unknown>
      >;

      expect(audioEffects).toHaveLength(1);
      expect(stripPathProperties(audioEffects[0])).toStrictEqual({
        id: "device2",
        type: "audio-effect: Reverb",
      });
    });

    it("includes nested devices from instrument rack chains", () => {
      setupInstrumentRackOnTrack0(["chain1"]);
      registerMockObject("chain1", {
        path: "live_set tracks 0 devices 0 chains 0",
        type: "Chain",
        properties: createChainMockProperties({
          name: "Piano",
          color: 16711680, // Red
          deviceIds: ["nested_device1"],
        }),
      });
      registerMockObject("nested_device1", {
        path: "live_set tracks 0 devices 0 chains 0 devices 0",
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Lead Synth",
          className: "Operator",
          classDisplayName: "Operator",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "chains"],
      });

      expect(stripPathProperties(result.instrument)).toStrictEqual(
        createSinglePianoChainRackExpectation("nested_device1"),
      );
    });

    it("includes nested devices from audio effect rack chains", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: children("fx_rack1"),
        },
      });
      registerMockObject("fx_rack1", {
        path: "live_set tracks 0 devices 0",
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "Master FX",
          className: "AudioEffectGroupDevice",
          classDisplayName: "Audio Effect Rack",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          chainIds: ["chain1"],
        }),
      });
      registerMockObject("chain1", {
        path: "live_set tracks 0 devices 0 chains 0",
        type: "Chain",
        properties: createChainMockProperties({
          name: "Filter Chain",
          color: 255, // Blue
          deviceIds: ["nested_effect1"],
        }),
      });
      registerMockObject("nested_effect1", {
        path: "live_set tracks 0 devices 0 chains 0 devices 0",
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Sweep Filter",
          className: "AutoFilter2",
          classDisplayName: "Auto Filter",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ALL_DEVICE_INCLUDE_OPTIONS,
      });

      const audioEffects2 = result.audioEffects as Array<
        Record<string, unknown>
      >;

      expect(audioEffects2).toHaveLength(1);
      expect(stripPathProperties(audioEffects2[0])).toStrictEqual({
        id: "fx_rack1",
        type: "audio-effect-rack",
        name: "Master FX",
        chains: [
          {
            id: "chain1",
            type: "Chain",
            name: "Filter Chain",
            color: "#0000FF",
            devices: [
              {
                id: "nested_effect1",
                type: "audio-effect: Auto Filter",
                name: "Sweep Filter",
              },
            ],
          },
        ],
      });
    });

    it("handles deeply nested racks", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: children("outer_rack"),
        },
      });
      registerMockObject("outer_rack", {
        path: "live_set tracks 0 devices 0",
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "Master FX",
          className: "InstrumentGroupDevice",
          classDisplayName: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          chainIds: ["outer_chain"],
        }),
      });
      registerMockObject("outer_chain", {
        path: "live_set tracks 0 devices 0 chains 0",
        type: "Chain",
        properties: createChainMockProperties({
          name: "Wet",
          color: 255, // Blue
          deviceIds: ["inner_rack"],
        }),
      });
      registerMockObject("inner_rack", {
        path: "live_set tracks 0 devices 0 chains 0 devices 0",
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "Reverb Chain",
          className: "AudioEffectGroupDevice",
          classDisplayName: "Audio Effect Rack",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          chainIds: ["inner_chain"],
        }),
      });
      registerMockObject("inner_chain", {
        path: "live_set tracks 0 devices 0 chains 0 devices 0 chains 0",
        type: "Chain",
        properties: createChainMockProperties({
          name: "Hall",
          color: 65280, // Green
          solo: 1,
          deviceIds: ["deep_device"],
        }),
      });
      registerMockObject("deep_device", {
        path: "live_set tracks 0 devices 0 chains 0 devices 0 chains 0 devices 0",
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Big Hall",
          className: "Reverb",
          classDisplayName: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "chains"],
      });

      expect(stripPathProperties(result.instrument)).toStrictEqual({
        id: "outer_rack",
        type: "instrument-rack",
        name: "Master FX",
        chains: [
          {
            id: "outer_chain",
            type: "Chain",
            name: "Wet",
            color: "#0000FF",
            devices: [
              {
                id: "inner_rack",
                type: "audio-effect-rack",
                name: "Reverb Chain",
                chains: [
                  {
                    id: "inner_chain",
                    type: "Chain",
                    name: "Hall",
                    color: "#00FF00",
                    state: "soloed",
                    devices: [
                      {
                        id: "deep_device",
                        type: "audio-effect: Reverb",
                        name: "Big Hall",
                      },
                    ],
                  },
                ],
                hasSoloedChain: true,
              },
            ],
          },
        ],
      });
    });
  });
});
