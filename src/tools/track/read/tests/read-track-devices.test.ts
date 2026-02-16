// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import {
  ALL_DEVICE_INCLUDE_OPTIONS,
  createChainMockProperties,
  createDeviceMockProperties,
  createRackDeviceMockProperties,
  setupInstrumentRackOnTrack0,
} from "../helpers/read-track-device-test-helpers.ts";
import { setupTrackMock } from "../helpers/read-track-registry-test-helpers.ts";
import { readTrack } from "../read-track.ts";

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
        path: livePath.track(0).device(0),
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Custom Analog",
          className: "InstrumentVector",
          classDisplayName: "Analog",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        }),
      });
      registerMockObject("device2", {
        path: livePath.track(0).device(1),
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Custom Reverb",
          className: "Reverb",
          classDisplayName: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        }),
      });
      registerMockObject("device3", {
        path: livePath.track(0).device(2),
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
          "instruments",
          "session-clips",
          "arrangement-clips",
          "midi-effects",
          "audio-effects",
        ],
      });

      expect(result.instrument).toStrictEqual({
        id: "device1",
        path: "t0/d0",
        type: "instrument: Analog",
        name: "Custom Analog",
      });

      expect(result.audioEffects).toStrictEqual([
        {
          id: "device2",
          path: "t0/d1",
          type: "audio-effect: Reverb",
          name: "Custom Reverb",
        },
      ]);

      expect(result.midiEffects).toStrictEqual([
        {
          id: "device3",
          path: "t0/d2",
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
        path: livePath.track(0).device(0),
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

      expect(result.instrument).toStrictEqual({
        id: "device1",
        path: "t0/d0",
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
        path: livePath.track(0).device(0),
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
        path: livePath.track(0).device(1),
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

      expect(result.instrument).toStrictEqual({
        id: "device1",
        path: "t0/d0",
        type: "drum-rack",
        name: "My Drums",
        // drumPads: [], // Only included when drum-pads is requested
      });

      const audioEffects = result.audioEffects as Array<
        Record<string, unknown>
      >;

      expect(audioEffects).toHaveLength(1);
      expect(audioEffects[0]).toStrictEqual({
        id: "device2",
        path: "t0/d1",
        type: "audio-effect: Reverb",
      });
    });

    it("strips chains from instrument rack in read-track output", () => {
      setupInstrumentRackOnTrack0(["chain1"]);
      registerMockObject("chain1", {
        path: livePath.track(0).device(0).chain(0),
        type: "Chain",
        properties: createChainMockProperties({
          name: "Piano",
          color: 16711680, // Red
          deviceIds: ["nested_device1"],
        }),
      });
      registerMockObject("nested_device1", {
        path: livePath.track(0).device(0).chain(0).device(0),
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
        include: ["instruments"],
      });

      // Chains are always stripped in read-track (use read-device for chain details)
      expect(result.instrument).toStrictEqual({
        id: "rack1",
        path: "t0/d0",
        type: "instrument-rack",
        name: "My Custom Rack",
      });
    });

    it("strips chains from audio effect rack in read-track output", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: children("fx_rack1"),
        },
      });
      registerMockObject("fx_rack1", {
        path: livePath.track(0).device(0),
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
        path: livePath.track(0).device(0).chain(0),
        type: "Chain",
        properties: createChainMockProperties({
          name: "Filter Chain",
          color: 255, // Blue
          deviceIds: ["nested_effect1"],
        }),
      });
      registerMockObject("nested_effect1", {
        path: livePath.track(0).device(0).chain(0).device(0),
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

      // Chains are always stripped in read-track (use read-device for chain details)
      expect(audioEffects2).toHaveLength(1);
      expect(audioEffects2[0]).toStrictEqual({
        id: "fx_rack1",
        path: "t0/d0",
        type: "audio-effect-rack",
        name: "Master FX",
      });
    });

    it("strips chains from deeply nested racks in read-track output", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: children("outer_rack"),
        },
      });
      registerMockObject("outer_rack", {
        path: livePath.track(0).device(0),
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
        path: livePath.track(0).device(0).chain(0),
        type: "Chain",
        properties: createChainMockProperties({
          name: "Wet",
          color: 255, // Blue
          deviceIds: ["inner_rack"],
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments"],
      });

      // Chains are always stripped in read-track (use read-device for chain details)
      expect(result.instrument).toStrictEqual({
        id: "outer_rack",
        path: "t0/d0",
        type: "instrument-rack",
        name: "Master FX",
      });
    });
  });
});
