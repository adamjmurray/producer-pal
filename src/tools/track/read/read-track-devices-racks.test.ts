// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { children, mockLiveApiGet } from "#src/test/mocks/mock-live-api.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import {
  createDrumChainMock,
  createSimpleInstrumentMock,
  mockTrackProperties,
  setupDevicePathIdMock,
} from "./helpers/read-track-test-helpers.ts";
import { readTrack } from "./read-track.ts";

describe("readTrack", () => {
  describe("devices - rack edge cases", () => {
    it("handles empty chains in racks", () => {
      setupDevicePathIdMock({
        "live_set tracks 0": "track1",
        "live_set tracks 0 devices 0": "rack1",
        "live_set tracks 0 devices 0 chains 0": "empty_chain",
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("rack1"),
        }),
        rack1: {
          name: "My Empty Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("empty_chain"),
          return_chains: [],
        },
        empty_chain: {
          name: "Empty Chain",
          color: 0,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "chains"],
      });

      expect(result.instrument).toStrictEqual({
        id: "rack1",
        name: "My Empty Rack",
        type: "instrument-rack",
        chains: [
          {
            id: "empty_chain",
            type: "Chain",
            name: "Empty Chain",
            color: "#000000",
            devices: [],
          },
        ],
      });
    });
    it("handles multiple chains in a rack", () => {
      setupDevicePathIdMock({
        "live_set tracks 0": "track1",
        "live_set tracks 0 devices 0": "rack1",
        "live_set tracks 0 devices 0 chains 0": "chain1",
        "live_set tracks 0 devices 0 chains 1": "chain2",
        "live_set tracks 0 devices 0 chains 0 devices 0": "device1",
        "live_set tracks 0 devices 0 chains 1 devices 0": "device2",
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("rack1"),
        }),
        rack1: {
          name: "My Custom Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("chain1", "chain2"),
          return_chains: [],
        },
        chain1: {
          name: "Piano",
          color: 16711680,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("device1"),
        },
        chain2: {
          name: "Bass",
          color: 65280,
          mute: 1,
          muted_via_solo: 0,
          solo: 0,
          devices: children("device2"),
        },
        device1: {
          name: "Lead Synth",
          class_name: "Operator",
          class_display_name: "Operator",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        device2: {
          name: "Bass Synth",
          class_name: "Wavetable",
          class_display_name: "Wavetable",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "chains"],
      });

      expect(result.instrument).toStrictEqual({
        id: "rack1",
        type: "instrument-rack",
        name: "My Custom Rack",
        chains: [
          {
            id: "chain1",
            type: "Chain",
            name: "Piano",
            color: "#FF0000",
            devices: [
              {
                id: "device1",
                type: "instrument: Operator",
                name: "Lead Synth",
              },
            ],
          },
          {
            id: "chain2",
            type: "Chain",
            name: "Bass",
            color: "#00FF00",
            state: "muted",
            devices: [
              {
                id: "device2",
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
      setupDevicePathIdMock({
        "live_set tracks 0": "track1",
        "live_set tracks 0 devices 0": "drum_rack",
        "live_set tracks 0 devices 0 chains 0": "kick_chain",
        "live_set tracks 0 devices 0 chains 1": "snare_chain",
      });

      mockLiveApiGet({
        Track: mockTrackProperties({ devices: children("drum_rack") }),
        drum_rack: {
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
        kick_chain: createDrumChainMock({
          inNote: 36,
          name: "Kick",
          color: 16711680,
          mutedViaSolo: true,
          deviceId: "kick_device",
        }),
        snare_chain: createDrumChainMock({
          inNote: 38,
          name: "Snare",
          color: 65280,
          solo: true,
          deviceId: "snare_device",
        }),
        kick_device: createSimpleInstrumentMock(),
        snare_device: createSimpleInstrumentMock(),
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
                type: "Chain",
                name: "Kick",
                color: "#FF0000",
                state: "muted-via-solo",
                devices: [
                  expect.objectContaining({
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
                type: "Chain",
                name: "Snare",
                color: "#00FF00",
                state: "soloed",
                devices: [
                  expect.objectContaining({
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
      setupDevicePathIdMock({ "live_set tracks 0": "track1" });
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("device1", "device2"),
        }),
        device1: {
          name: "Reverb",
          class_name: "Reverb",
          class_display_name: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        device2: {
          name: "My Custom Reverb",
          class_name: "Reverb",
          class_display_name: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "clip-notes",
          "chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "audio-effects",
        ],
      });

      expect(result.audioEffects).toStrictEqual([
        {
          id: "device1",
          type: "audio-effect: Reverb",
        },
        {
          id: "device2",
          type: "audio-effect: Reverb",
          name: "My Custom Reverb",
        },
      ]);
    });
  });
});
