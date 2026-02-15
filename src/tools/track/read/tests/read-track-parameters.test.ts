// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import {
  mockTrackProperties,
  setupDrumRackMocks,
} from "../helpers/read-track-test-helpers.ts";
import {
  createChainMockProperties,
  createDeviceMockProperties,
  createRackDeviceMockProperties,
} from "../helpers/read-track-device-test-helpers.ts";
import { setupTrackMock } from "../helpers/read-track-registry-test-helpers.ts";
import { readTrack } from "../read-track.ts";

describe("readTrack", () => {
  describe("trackId parameter", () => {
    it("reads track by trackId", () => {
      registerMockObject("123", {
        path: livePath.track(2),
        type: "Track",
        properties: mockTrackProperties({
          name: "Track by ID",
          color: 16711680, // Red
          arm: 1,
        }),
      });

      const result = readTrack({ trackId: "123" });

      expect(result).toStrictEqual({
        id: "123",
        type: "midi",
        name: "Track by ID",
        trackIndex: 2,
        isArmed: true,
        arrangementFollower: true,
        sessionClips: [],
        arrangementClips: [],
        instrument: null,
      });
    });

    it("reads return track by trackId", () => {
      registerMockObject("456", {
        path: livePath.returnTrack(1),
        type: "Track",
        properties: mockTrackProperties({
          name: "Return by ID",
          has_midi_input: 0,
          color: 65280, // Green
          can_be_armed: 0,
        }),
      });

      const result = readTrack({ trackId: "456" });

      expect(result).toStrictEqual({
        id: "456",
        type: "audio",
        name: "Return by ID",
        returnTrackIndex: 1,
        arrangementFollower: true,
        sessionClips: [],
        arrangementClips: [],
        instrument: null,
      });
    });

    it("reads master track by trackId", () => {
      registerMockObject("789", {
        path: livePath.masterTrack(),
        type: "Track",
        properties: mockTrackProperties({
          name: "Master by ID",
          has_midi_input: 0,
          color: 16777215, // White
          can_be_armed: 0,
        }),
      });

      const result = readTrack({ trackId: "789" });

      expect(result).toStrictEqual({
        id: "789",
        type: "audio",
        name: "Master by ID",
        arrangementFollower: true,
        sessionClips: [],
        arrangementClips: [],
        instrument: null,
      });
    });

    it("throws error when trackId does not exist", () => {
      mockNonExistentObjects();

      expect(() => {
        readTrack({ trackId: "nonexistent" });
      }).toThrow('readTrack failed: id "nonexistent" does not exist');
    });

    it("throws error when neither trackId nor trackIndex provided", () => {
      expect(() => {
        readTrack({});
      }).toThrow("Either trackId or trackIndex must be provided");
    });

    it("ignores category when trackId is provided", () => {
      registerMockObject("999", {
        path: livePath.track(0),
        type: "Track",
        properties: mockTrackProperties({
          name: "Track ignores type",
        }),
      });

      // category should be ignored when trackId is provided
      const result = readTrack({ trackId: "999", category: "return" });

      // Should read as regular track (from path) not return track
      expect(result.trackIndex).toBe(0);
      expect(result.returnTrackIndex).toBeUndefined();
    });
  });

  describe("drum-maps include option", () => {
    it("includes drumMap but strips chains when using drum-maps", () => {
      setupDrumRackMocks();

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "drum-maps"],
      });

      // Should have drumMap
      expect(result.drumMap).toStrictEqual({
        C3: "Test Kick",
      });

      // Should have instrument but NO chains
      expect(result.instrument).toStrictEqual({
        id: "drumrack1",
        path: "t0/d0",
        name: "Test Drum Rack",
        type: "drum-rack",
        // drumPads: [ // Only included when drum-pads is requested
        //   {
        //     name: "Test Kick",
        //     note: 60,
        //   },
        // ],
      });

      // Critical: chains should be stripped
      expect(
        (result.instrument as Record<string, unknown>).chains,
      ).toBeUndefined();
    });

    it("drum racks don't have main chains even with chains included", () => {
      setupDrumRackMocks({ kickDeviceId: "kick_device2" });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "drum-maps", "chains"],
      });

      // Should have drumMap
      expect(result.drumMap).toStrictEqual({
        C3: "Test Kick",
      });

      // Should have instrument WITHOUT chains (drum racks don't expose main chains)
      expect(result.instrument).toStrictEqual({
        id: "drumrack1",
        path: "t0/d0",
        name: "Test Drum Rack",
        type: "drum-rack",
        // drumPads: [ // Only included when drum-pads is requested
        //   {
        //     name: "Test Kick",
        //     note: 60,
        //   },
        // ],
      });

      // Critical: chains should NOT be present on drum racks
      expect(
        (result.instrument as Record<string, unknown>).chains,
      ).toBeUndefined();
    });

    it("strips chains from all device types when using drum-maps", () => {
      setupTrackMock({
        trackId: "track1",
        properties: mockTrackProperties({
          devices: children(
            "midi_effect_rack",
            "instrument_rack",
            "audio_effect_rack",
          ),
        }),
      });
      registerMockObject("midi_effect_rack", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "MIDI Effect Rack",
          className: "MidiEffectGroupDevice",
          classDisplayName: "MIDI Effect Rack",
          type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
          chainIds: ["midi_chain"],
        }),
      });
      registerMockObject("instrument_rack", {
        path: livePath.track(0).device(1),
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "Instrument Rack",
          className: "InstrumentGroupDevice",
          classDisplayName: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          chainIds: ["inst_chain"],
        }),
      });
      registerMockObject("audio_effect_rack", {
        path: livePath.track(0).device(2),
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "Audio Effect Rack",
          className: "AudioEffectGroupDevice",
          classDisplayName: "Audio Effect Rack",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          chainIds: ["audio_chain"],
        }),
      });
      registerMockObject("midi_chain", {
        path: livePath.track(0).device(0).chain(0),
        type: "Chain",
        properties: createChainMockProperties({
          name: "MIDI Chain",
          color: 0,
          deviceIds: [],
        }),
      });
      registerMockObject("inst_chain", {
        path: livePath.track(0).device(1).chain(0),
        type: "Chain",
        properties: createChainMockProperties({
          name: "Inst Chain",
          color: 0,
          deviceIds: [],
        }),
      });
      registerMockObject("audio_chain", {
        path: livePath.track(0).device(2).chain(0),
        type: "Chain",
        properties: createChainMockProperties({
          name: "Audio Chain",
          color: 0,
          deviceIds: [],
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["midi-effects", "instruments", "audio-effects", "drum-maps"],
      });

      // All devices should have chains stripped
      const midiEffects = result.midiEffects as Record<string, unknown>[];

      expect(midiEffects[0]).toStrictEqual({
        id: "midi_effect_rack",
        path: "t0/d0",
        type: "midi-effect-rack",
      });
      expect(midiEffects[0]!.chains).toBeUndefined();

      expect(result.instrument).toStrictEqual({
        id: "instrument_rack",
        path: "t0/d1",
        type: "instrument-rack",
      });
      expect(
        (result.instrument as Record<string, unknown>).chains,
      ).toBeUndefined();

      const audioEffects = result.audioEffects as Record<string, unknown>[];

      expect(audioEffects[0]).toStrictEqual({
        id: "audio_effect_rack",
        path: "t0/d2",
        type: "audio-effect-rack",
      });
      expect(audioEffects[0]!.chains).toBeUndefined();
    });

    it("uses drum-maps by default (not chains)", () => {
      setupTrackMock({
        trackId: "track1",
        properties: mockTrackProperties({
          devices: children("instrument_rack"),
        }),
      });
      registerMockObject("instrument_rack", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "Instrument Rack",
          className: "InstrumentGroupDevice",
          classDisplayName: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          chainIds: ["chain1"],
        }),
      });
      registerMockObject("chain1", {
        path: livePath.track(0).device(0).chain(0),
        type: "Chain",
        properties: createChainMockProperties({
          name: "Chain 1",
          color: 0,
          deviceIds: [],
        }),
      });

      // Call with NO include param - should use defaults
      const result = readTrack({ trackIndex: 0 });

      // Should have instrument but NO chains (proving drum-maps is default, not chains)
      expect(result.instrument).toStrictEqual({
        id: "instrument_rack",
        path: "t0/d0",
        type: "instrument-rack",
      });
      expect(
        (result.instrument as Record<string, unknown>).chains,
      ).toBeUndefined();
    });

    it("handles drum-maps with no drum racks gracefully", () => {
      setupTrackMock({
        trackId: "track1",
        properties: mockTrackProperties({
          devices: children("wavetable"),
        }),
      });
      registerMockObject("wavetable", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Wavetable",
          className: "InstrumentVector",
          classDisplayName: "Wavetable",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "drum-maps"],
      });

      // Should have instrument but no drumMap
      expect(result.instrument).toStrictEqual({
        id: "wavetable",
        path: "t0/d0",
        type: "instrument: Wavetable",
      });
      expect(result.drumMap).toBeUndefined();
      expect(
        (result.instrument as Record<string, unknown>).chains,
      ).toBeUndefined();
    });
  });
});
