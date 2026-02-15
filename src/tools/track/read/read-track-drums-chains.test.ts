// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import {
  createSimpleInstrumentMock,
  mockTrackProperties,
} from "./helpers/read-track-test-helpers.ts";
import { setupTrackPathMappedMocks } from "./helpers/read-track-path-mapped-test-helpers.ts";
import { readTrack } from "./read-track.ts";

function createNestedDrumRackProperties(
  chainIds: string[],
): Record<string, unknown> {
  return {
    name: "Nested Drum Rack",
    class_name: "DrumGroupDevice",
    class_display_name: "Drum Rack",
    type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
    is_active: 1,
    can_have_chains: 1,
    can_have_drum_pads: 1,
    chains: children(...chainIds),
    return_chains: [],
  };
}

function createChainToNestedDrumRack(options: {
  name: string;
  color: number;
  inNote?: number;
}): Record<string, unknown> {
  return {
    ...(options.inNote == null ? {} : { in_note: options.inNote }),
    name: options.name,
    color: options.color,
    mute: 0,
    solo: 0,
    devices: children("nestedDrumRack"),
  };
}

describe("readTrack", () => {
  describe("drumPads", () => {
    it("returns null when the track has no devices", () => {
      setupTrackPathMappedMocks({
        trackId: "track1",
        objects: {
          Track: mockTrackProperties({
            name: "Track No Devices",
            devices: [],
          }),
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toBeUndefined();
    });

    it("returns null when the track has devices but no instruments", () => {
      setupTrackPathMappedMocks({
        trackId: "track1",
        objects: {
          Track: mockTrackProperties({
            name: "Track No Instruments",
            devices: children("effect1", "effect2"),
          }),
          effect1: { type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT },
          effect2: { type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT },
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toBeUndefined();
    });

    it("returns null when the track has an instrument but it's not a drum rack", () => {
      setupTrackPathMappedMocks({
        objects: {
          Track: mockTrackProperties({
            name: "Track Non-Drum Instrument",
            devices: children("wavetable1"),
          }),
          wavetable1: {
            type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
            can_have_drum_pads: 0,
          },
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toBeUndefined();
    });

    it("returns empty array when the drum rack has no chains", () => {
      setupTrackPathMappedMocks({
        pathIdMap: {
          [String(livePath.track(0))]: "track1",
          [String(livePath.track(0).device(0))]: "drumrack",
        },
        objects: {
          Track: mockTrackProperties({
            name: "Track Empty Drum Rack",
            devices: children("drumrack"),
          }),
          drumrack: {
            name: "Empty Drum Rack",
            class_name: "DrumGroupDevice",
            class_display_name: "Drum Rack",
            type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
            is_active: 1,
            can_have_chains: 1,
            can_have_drum_pads: 1,
            chains: [], // Empty chains instead of drum_pads
            return_chains: [],
          },
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toStrictEqual({});
    });

    it("includes all drum chains that have instruments", () => {
      setupTrackPathMappedMocks({
        pathIdMap: {
          [String(livePath.track(0))]: "track1",
          [String(livePath.track(0).device(0))]: "drumrack",
          [String(livePath.track(0).device(0).chain(0))]: "chain1",
          [String(livePath.track(0).device(0).chain(1))]: "chain2",
        },
        objects: {
          Track: mockTrackProperties({
            name: "Track Drum Rack With Chains",
            devices: children("drumrack"),
          }),
          drumrack: {
            name: "Drum Rack With Chains",
            class_name: "DrumGroupDevice",
            class_display_name: "Drum Rack",
            type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
            is_active: 1,
            can_have_chains: 1,
            can_have_drum_pads: 1,
            chains: children("chain1", "chain2"), // Chains directly on drum rack
            return_chains: [],
          },
          chain1: {
            in_note: 60, // C3 - chains use in_note instead of note
            name: "Kick",
            color: 16711680,
            mute: 0,
            solo: 0,
            devices: children("kick_device"),
          },
          chain2: {
            in_note: 64, // E3
            name: "Hi-hat",
            color: 65280,
            mute: 0,
            solo: 0,
            devices: children("hihat_device"),
          },
          kick_device: createSimpleInstrumentMock(),
          hihat_device: createSimpleInstrumentMock(),
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toStrictEqual({
        C3: "Kick",
        E3: "Hi-hat",
      });
    });

    it("stops at first drum rack found", () => {
      setupTrackPathMappedMocks({
        pathIdMap: {
          [String(livePath.track(0))]: "track1",
          [String(livePath.track(0).device(0))]: "midiEffect",
          [String(livePath.track(0).device(1))]: "drumrack1",
          [String(livePath.track(0).device(2))]: "drumrack2",
          [String(livePath.track(0).device(1).chain(0))]: "chain1",
          [String(livePath.track(0).device(2).chain(0))]: "chain2",
        },
        objects: {
          Track: mockTrackProperties({
            name: "Track Multiple Instruments",
            // In theory you could have multiple drum racks in an instrument rack.
            // this is not supported as a feature, but let's make sure something reasonable happens:
            devices: children("midiEffect", "drumrack1", "drumrack2"),
          }),
          midiEffect: {
            name: "MIDI Effect",
            class_name: "MidiEffect",
            class_display_name: "MIDI Effect",
            type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
            is_active: 1,
            can_have_chains: 0,
            can_have_drum_pads: 0,
          },
          drumrack1: {
            name: "First Drum Rack",
            class_name: "DrumGroupDevice",
            class_display_name: "Drum Rack",
            type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
            is_active: 1,
            can_have_chains: 1,
            can_have_drum_pads: 1,
            chains: children("chain1"),
            return_chains: [],
          },
          chain1: {
            in_note: 60, // C3
            name: "First Drum Rack Kick",
            color: 16711680,
            mute: 0,
            solo: 0,
            devices: children("device1"),
          },
          device1: {
            name: "Simpler",
            class_name: "Simpler",
            class_display_name: "Simpler",
            type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
            is_active: 1,
            can_have_chains: 0,
            can_have_drum_pads: 0,
          },
          drumrack2: {
            name: "Second Drum Rack",
            class_name: "DrumGroupDevice",
            class_display_name: "Drum Rack",
            type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
            is_active: 1,
            can_have_chains: 1,
            can_have_drum_pads: 1,
            chains: children("chain2"),
            return_chains: [],
          },
          chain2: {
            in_note: 61, // Db3
            name: "Second Drum Rack Snare",
            color: 65280,
            mute: 0,
            solo: 0,
            devices: children("device2"),
          },
          device2: {
            name: "Simpler",
            class_name: "Simpler",
            class_display_name: "Simpler",
            type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
            is_active: 1,
            can_have_chains: 0,
            can_have_drum_pads: 0,
          },
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toStrictEqual({
        C3: "First Drum Rack Kick",
      });
    });

    it("finds drum chains in nested drum rack inside instrument rack", () => {
      setupTrackPathMappedMocks({
        pathIdMap: {
          [String(livePath.track(0))]: "track1",
          [String(livePath.track(0).device(0))]: "instrumentRack",
          [String(livePath.track(0).device(0).chain(0))]: "rackchain1",
          [String(livePath.track(0).device(0).chain(0).device(0))]:
            "nestedDrumRack",
          [String(livePath.track(0).device(0).chain(0).device(0).chain(0))]:
            "drumchain1",
          [String(livePath.track(0).device(0).chain(0).device(0).chain(1))]:
            "drumchain2",
        },
        objects: {
          Track: mockTrackProperties({
            name: "Track Nested Drum Rack",
            devices: children("instrumentRack"),
          }),
          instrumentRack: {
            name: "Instrument Rack",
            class_name: "InstrumentGroupDevice",
            class_display_name: "Instrument Rack",
            type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
            is_active: 1,
            can_have_chains: 1,
            can_have_drum_pads: 0,
            chains: children("rackchain1"),
            return_chains: [],
          },
          rackchain1: createChainToNestedDrumRack({
            name: "Chain 1",
            color: 16711680,
          }),
          nestedDrumRack: createNestedDrumRackProperties([
            "drumchain1",
            "drumchain2",
          ]),
          drumchain1: {
            in_note: 36, // C1
            name: "Kick Dub",
            color: 16711680,
            mute: 0,
            solo: 0,
            devices: children("kickdevice"),
          },
          drumchain2: {
            in_note: 37, // Db1
            name: "Snare Dub",
            color: 65280,
            mute: 0,
            solo: 0,
            devices: children("snaredevice"),
          },
          kickdevice: createSimpleInstrumentMock(),
          snaredevice: createSimpleInstrumentMock(),
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toStrictEqual({
        C1: "Kick Dub",
        Db1: "Snare Dub",
      });
    });

    it("returns null when instrument rack has no chains", () => {
      setupTrackPathMappedMocks({
        objects: {
          Track: mockTrackProperties({
            name: "Track Empty Instrument Rack",
            devices: children("instrumentRack"),
          }),
          instrumentRack: {
            type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
            can_have_drum_pads: 0,
            class_name: "InstrumentGroupDevice",
            chains: [],
          },
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toBeUndefined();
    });

    it("handles catch-all chains (in_note=-1) in drum racks", () => {
      setupTrackPathMappedMocks({
        pathIdMap: {
          [String(livePath.track(0))]: "track1",
          [String(livePath.track(0).device(0))]: "drumrack",
          [String(livePath.track(0).device(0).chain(0))]: "catchAllChain",
          [String(livePath.track(0).device(0).chain(0).device(0))]:
            "nestedDrumRack",
        },
        objects: {
          Track: mockTrackProperties({
            name: "Track Drum Rack With Catch-All",
            devices: children("drumrack"),
          }),
          drumrack: {
            name: "Drum Rack",
            class_name: "DrumGroupDevice",
            class_display_name: "Drum Rack",
            type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
            is_active: 1,
            can_have_chains: 1,
            can_have_drum_pads: 1,
            chains: children("catchAllChain"),
            return_chains: [],
          },
          catchAllChain: createChainToNestedDrumRack({
            inNote: -1, // Catch-all chain - receives all notes
            name: "Nested Rack",
            color: 16711680,
          }),
          nestedDrumRack: createNestedDrumRackProperties([]),
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "drum-pads", "chains"],
      });

      // Catch-all chain should show up with pitch "*" and note -1
      const instrument = result.instrument as Record<string, unknown>;
      const drumPads = instrument.drumPads as Array<Record<string, unknown>>;

      expect(drumPads).toHaveLength(1);
      expect(drumPads[0]).toMatchObject({
        note: -1,
        pitch: "*",
        name: "Nested Rack",
      });
      // Verify the chain has the catch-all path format
      const chains = drumPads[0]!.chains as Array<Record<string, unknown>>;

      expect(chains[0]).toMatchObject({
        id: "catchAllChain",
        name: "Nested Rack",
      });
    });

    it("aggregates muted state from chains", () => {
      setupTrackPathMappedMocks({
        pathIdMap: {
          [String(livePath.track(0))]: "track1",
          [String(livePath.track(0).device(0))]: "drumrack",
          [String(livePath.track(0).device(0).chain(0))]: "mutedChain",
        },
        objects: {
          Track: mockTrackProperties({
            name: "Track Muted Drum Chain",
            devices: children("drumrack"),
          }),
          drumrack: {
            name: "Drum Rack",
            class_name: "DrumGroupDevice",
            class_display_name: "Drum Rack",
            type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
            is_active: 1,
            can_have_chains: 1,
            can_have_drum_pads: 1,
            chains: children("mutedChain"),
            return_chains: [],
          },
          mutedChain: {
            in_note: 60, // C3
            name: "Muted Pad",
            color: 16711680,
            mute: 1, // Muted
            muted_via_solo: 0,
            solo: 0,
            devices: children("simplerDevice"),
          },
          simplerDevice: createSimpleInstrumentMock(),
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "drum-pads"],
      });

      // The drum pad should show as muted
      const instrument2 = result.instrument as Record<string, unknown>;
      const drumPads2 = instrument2.drumPads as Array<Record<string, unknown>>;

      expect(drumPads2[0]).toMatchObject({
        note: 60,
        pitch: "C3",
        name: "Muted Pad",
        state: "muted",
      });
    });
  });
});
