// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
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
  setupDrumRackWithReverbMocks,
  setupInstrumentRackOnTrack0,
  setupTrackWithDevices,
  setupTrackWithSingleRack,
} from "./helpers/read-track-device-test-helpers.ts";
import { setupTrackMock } from "./helpers/read-track-registry-test-helpers.ts";
import { mockTrackProperties } from "./helpers/read-track-test-helpers.ts";
import { readTrack } from "../read-track.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("readTrack", () => {
  describe("devices", () => {
    it("returns empty devices array when track has no devices", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: [],
        },
      });

      const result = readTrack({ trackIndex: 0, include: ["devices"] });

      expect(result.devices).toStrictEqual([]);
      expect(result.instrument).toBeUndefined();
      expect(result.midiEffects).toBeUndefined();
      expect(result.audioEffects).toBeUndefined();
    });

    it("omits devices for Producer Pal host track with no devices", () => {
      // Make track 0 the Producer Pal host
      registerMockObject("this_device", {
        path: "this_device",
        returnPath: String(livePath.track(0).device(0)),
        type: "Device",
      });
      registerMockObject("track1", {
        path: livePath.track(0),
        type: "Track",
        properties: mockTrackProperties({
          devices: [],
        }),
      });

      const result = readTrack({ trackIndex: 0, include: ["devices"] });

      expect(result.devices).toBeUndefined();
    });

    it("warns when a track has more than one instrument", () => {
      // Defensive warning: a track is expected to have 0 or 1 instrument. Two
      // instruments (unusual) must surface a warning. Reached via the drum-map
      // path, which categorizes devices.
      setupTrackWithDevices([
        {
          name: "Analog",
          className: "InstrumentVector",
          classDisplayName: "Analog",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        },
        {
          name: "Operator",
          className: "Operator",
          classDisplayName: "Operator",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        },
      ]);

      readTrack({ trackIndex: 0, include: ["drum-map"] });

      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining(
          "Track has 2 instruments (t0/d0 (id device1), t0/d1 (id device2))",
        ),
      );
    });

    it("puts a device of an unrecognized type in no category", () => {
      // Live's device `type` is one of three values; anything else reads as
      // "unknown" and must not be filed as an instrument or an effect.
      setupTrackWithDevices([
        {
          name: "Mystery",
          className: "Mystery",
          classDisplayName: "Mystery",
          type: 99,
        },
      ]);

      const result = readTrack({ trackIndex: 0, include: ["drum-map"] });

      expect(result.drumMap).toBeUndefined();
    });

    it("categorizes devices correctly", () => {
      setupTrackWithDevices([
        {
          name: "Custom Analog",
          className: "InstrumentVector",
          classDisplayName: "Analog",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        },
        {
          name: "Custom Reverb",
          className: "Reverb",
          classDisplayName: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        },
        {
          name: "Custom Note Length",
          className: "MidiNoteLength",
          classDisplayName: "Note Length",
          type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
          isActive: 0,
        },
      ]);

      const result = readTrack({
        trackIndex: 0,
        include: ["devices", "session-clips", "arrangement-clips"],
      });

      expect(result.devices).toStrictEqual([
        {
          id: "device1",
          path: "t0/d0",
          type: "instrument: Analog",
          name: "Custom Analog",
        },
        {
          id: "device2",
          path: "t0/d1",
          type: "audio-effect: Reverb",
          name: "Custom Reverb",
        },
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
      setupTrackWithSingleRack(
        {
          name: "My Drums",
          className: "DrumGroupDevice",
          classDisplayName: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          canHaveDrumPads: 1,
          extraProperties: {
            drum_pads: [],
          },
        },
        "device1",
      );

      const result = readTrack({ trackIndex: 0, include: ["devices"] });

      expect(result.devices).toStrictEqual([
        {
          id: "device1",
          path: "t0/d0",
          name: "My Drums",
          type: "drum-rack",
        },
      ]);
    });

    it("includes all device categories when explicitly requested", () => {
      setupDrumRackWithReverbMocks();

      const result = readTrack({
        trackIndex: 0,
        include: ALL_DEVICE_INCLUDE_OPTIONS,
      });

      expect(result.devices).toStrictEqual([
        {
          id: "device1",
          path: "t0/d0",
          type: "drum-rack",
          name: "My Drums",
        },
        {
          id: "device2",
          path: "t0/d1",
          type: "audio-effect: Reverb",
        },
      ]);
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
        include: ["devices"],
      });

      // Chains are always stripped in read-track (use read-device for chain details)
      expect(result.devices).toStrictEqual([
        {
          id: "rack1",
          path: "t0/d0",
          type: "instrument-rack",
          name: "My Custom Rack",
        },
      ]);
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
        include: ["devices"],
      });

      // Chains are always stripped in read-track (use read-device for chain details)
      expect(result.devices).toStrictEqual([
        {
          id: "fx_rack1",
          path: "t0/d0",
          type: "audio-effect-rack",
          name: "Master FX",
        },
      ]);
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
        include: ["devices"],
      });

      // Chains are always stripped in read-track (use read-device for chain details)
      expect(result.devices).toStrictEqual([
        {
          id: "outer_rack",
          path: "t0/d0",
          type: "instrument-rack",
          name: "Master FX",
        },
      ]);
    });
  });
});
