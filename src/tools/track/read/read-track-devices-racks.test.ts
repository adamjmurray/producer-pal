// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import {
  ALL_DEVICE_INCLUDE_OPTIONS,
  createChainMockProperties,
  createDeviceMockProperties,
  createRackDeviceMockProperties,
  createSinglePianoChainRackExpectation,
  setupInstrumentRackOnTrack0,
} from "./helpers/read-track-device-test-helpers.ts";
import {
  createDrumChainMock,
  createSimpleInstrumentMock,
} from "./helpers/read-track-test-helpers.ts";
import { setupTrackMock } from "./helpers/read-track-registry-test-helpers.ts";
import { readTrack } from "./read-track.ts";

describe("readTrack", () => {
  describe("devices - rack edge cases", () => {
    it("handles empty chains in racks", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: children("rack1"),
        },
      });
      registerMockObject("rack1", {
        path: "live_set tracks 0 devices 0",
        type: "Device",
        properties: createRackDeviceMockProperties({
          name: "My Empty Rack",
          className: "InstrumentGroupDevice",
          classDisplayName: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          chainIds: ["empty_chain"],
        }),
      });
      registerMockObject("empty_chain", {
        path: "live_set tracks 0 devices 0 chains 0",
        type: "Chain",
        properties: createChainMockProperties({
          name: "Empty Chain",
          color: 0,
          deviceIds: [],
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "chains"],
      });

      expect(result.instrument).toStrictEqual({
        id: "rack1",
        path: "t0/d0",
        name: "My Empty Rack",
        type: "instrument-rack",
        chains: [
          {
            id: "empty_chain",
            path: "t0/d0/c0",
            type: "Chain",
            name: "Empty Chain",
            color: "#000000",
            devices: [],
          },
        ],
      });
    });
    it("handles multiple chains in a rack", () => {
      setupInstrumentRackOnTrack0(["chain1", "chain2"]);
      registerMockObject("chain1", {
        path: "live_set tracks 0 devices 0 chains 0",
        type: "Chain",
        properties: createChainMockProperties({
          name: "Piano",
          color: 16711680,
          deviceIds: ["device1"],
        }),
      });
      registerMockObject("chain2", {
        path: "live_set tracks 0 devices 0 chains 1",
        type: "Chain",
        properties: createChainMockProperties({
          name: "Bass",
          color: 65280,
          mute: 1,
          deviceIds: ["device2"],
        }),
      });
      registerMockObject("device1", {
        path: "live_set tracks 0 devices 0 chains 0 devices 0",
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Lead Synth",
          className: "Operator",
          classDisplayName: "Operator",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        }),
      });
      registerMockObject("device2", {
        path: "live_set tracks 0 devices 0 chains 1 devices 0",
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Bass Synth",
          className: "Wavetable",
          classDisplayName: "Wavetable",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "chains"],
      });

      const singleChainRack = createSinglePianoChainRackExpectation("device1");

      expect(result.instrument).toStrictEqual({
        ...singleChainRack,
        chains: [
          ...(singleChainRack.chains as Array<Record<string, unknown>>),
          {
            id: "chain2",
            path: "t0/d0/c1",
            type: "Chain",
            name: "Bass",
            color: "#00FF00",
            state: "muted",
            devices: [
              {
                id: "device2",
                path: "t0/d0/c1/d0",
                type: "instrument: Wavetable",
                name: "Bass Synth",
              },
            ],
          },
        ],
      });
    });
    // Tests drum pad solo/mute states with chains using in_note property
    it("handles drum rack drum chains with hasSoloedChain property", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: children("drum_rack"),
        },
      });
      registerMockObject("drum_rack", {
        path: "live_set tracks 0 devices 0",
        type: "Device",
        properties: {
          name: "My Drums",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          chains: children("kick_chain", "snare_chain"),
          return_chains: [],
        },
      });
      registerMockObject("kick_chain", {
        path: "live_set tracks 0 devices 0 chains 0",
        type: "Chain",
        properties: createDrumChainMock({
          inNote: 36,
          name: "Kick",
          color: 16711680,
          mutedViaSolo: true,
          deviceId: "kick_device",
        }),
      });
      registerMockObject("snare_chain", {
        path: "live_set tracks 0 devices 0 chains 1",
        type: "Chain",
        properties: createDrumChainMock({
          inNote: 38,
          name: "Snare",
          color: 65280,
          solo: true,
          deviceId: "snare_device",
        }),
      });
      registerMockObject("kick_device", {
        path: "live_set tracks 0 devices 0 chains 0 devices 0",
        type: "Device",
        properties: createSimpleInstrumentMock(),
      });
      registerMockObject("snare_device", {
        path: "live_set tracks 0 devices 0 chains 1 devices 0",
        type: "Device",
        properties: createSimpleInstrumentMock(),
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "drum-pads",
        ],
      });

      expect(result.instrument).toStrictEqual({
        id: "drum_rack",
        path: "t0/d0",
        type: "drum-rack",
        name: "My Drums",
        drumPads: [
          {
            name: "Kick",
            note: 36,
            pitch: "C1",
            state: "muted-via-solo",
            chains: [
              {
                id: "kick_chain",
                path: "t0/d0/pC1/c0",
                type: "Chain",
                name: "Kick",
                color: "#FF0000",
                state: "muted-via-solo",
                devices: [
                  expect.objectContaining({
                    path: "t0/d0/pC1/c0/d0",
                    type: "instrument: Simpler",
                  }),
                ],
              },
            ],
          },
          {
            name: "Snare",
            note: 38,
            pitch: "D1",
            state: "soloed",
            chains: [
              {
                id: "snare_chain",
                path: "t0/d0/pD1/c0",
                type: "Chain",
                name: "Snare",
                color: "#00FF00",
                state: "soloed",
                devices: [
                  expect.objectContaining({
                    path: "t0/d0/pD1/c0/d0",
                    type: "instrument: Simpler",
                  }),
                ],
              },
            ],
          },
        ],
      });
    });
    it("combines device name and preset name", () => {
      setupTrackMock({
        trackId: "track1",
        properties: {
          devices: children("device1", "device2"),
        },
      });
      registerMockObject("device1", {
        path: "live_set tracks 0 devices 0",
        type: "Device",
        properties: createDeviceMockProperties({
          name: "Reverb",
          className: "Reverb",
          classDisplayName: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        }),
      });
      registerMockObject("device2", {
        path: "live_set tracks 0 devices 1",
        type: "Device",
        properties: createDeviceMockProperties({
          name: "My Custom Reverb",
          className: "Reverb",
          classDisplayName: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        }),
      });

      const result = readTrack({
        trackIndex: 0,
        include: ALL_DEVICE_INCLUDE_OPTIONS,
      });

      expect(result.audioEffects).toStrictEqual([
        {
          id: "device1",
          path: "t0/d0",
          type: "audio-effect: Reverb",
        },
        {
          id: "device2",
          path: "t0/d1",
          type: "audio-effect: Reverb",
          name: "My Custom Reverb",
        },
      ]);
    });
  });
});
