import { describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.js";
import { mockTrackProperties } from "./helpers/read-track-test-helpers.js";
import { readTrack } from "./read-track.js";

describe("readTrack", () => {
  describe("drumPads", () => {
    it("returns null when the track has no devices", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track No Devices",
          devices: [],
        }),
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toBeUndefined();
    });

    it("returns null when the track has devices but no instruments", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track No Instruments",
          devices: children("effect1", "effect2"),
        }),
        effect1: { type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT },
        effect2: { type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toBeUndefined();
    });

    it("returns null when the track has an instrument but it's not a drum rack", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Non-Drum Instrument",
          devices: children("wavetable1"),
        }),
        wavetable1: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toBeUndefined();
    });

    it("returns empty array when the drum rack has no chains", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") {
          return "track1";
        }

        if (this._path === "live_set tracks 0 devices 0") {
          return "drumrack";
        }

        return this._id;
      });
      mockLiveApiGet({
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
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toStrictEqual({});
    });

    it("includes all drum chains that have instruments", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drumrack";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 chains 1":
            return "chain2";
          default:
            return this._id;
        }
      });
      mockLiveApiGet({
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
        kick_device: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        hihat_device: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toStrictEqual({
        C3: "Kick",
        E3: "Hi-hat",
      });
    });

    it("stops at first drum rack found", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "midiEffect";
          case "live_set tracks 0 devices 1":
            return "drumrack1";
          case "live_set tracks 0 devices 2":
            return "drumrack2";
          case "live_set tracks 0 devices 1 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 2 chains 0":
            return "chain2";
          default:
            return this._id;
        }
      });
      mockLiveApiGet({
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
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toStrictEqual({
        C3: "First Drum Rack Kick",
      });
    });

    it("finds drum chains in nested drum rack inside instrument rack", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "instrumentRack";
          case "live_set tracks 0 devices 0 chains 0":
            return "rackchain1";
          case "live_set tracks 0 devices 0 chains 0 devices 0":
            return "nestedDrumRack";
          case "live_set tracks 0 devices 0 chains 0 devices 0 chains 0":
            return "drumchain1";
          case "live_set tracks 0 devices 0 chains 0 devices 0 chains 1":
            return "drumchain2";
          default:
            return this._id;
        }
      });
      mockLiveApiGet({
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
        rackchain1: {
          name: "Chain 1",
          color: 16711680,
          mute: 0,
          solo: 0,
          devices: children("nestedDrumRack"),
        },
        nestedDrumRack: {
          name: "Nested Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          chains: children("drumchain1", "drumchain2"),
          return_chains: [],
        },
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
        kickdevice: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        snaredevice: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toStrictEqual({
        C1: "Kick Dub",
        Db1: "Snare Dub",
      });
    });

    it("returns null when instrument rack has no chains", () => {
      mockLiveApiGet({
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
      });
      const result = readTrack({ trackIndex: 0 });

      expect(result.drumMap).toBeUndefined();
    });

    it("handles catch-all chains (in_note=-1) in drum racks", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drumrack";
          case "live_set tracks 0 devices 0 chains 0":
            return "catchAllChain";
          case "live_set tracks 0 devices 0 chains 0 devices 0":
            return "nestedDrumRack";
          default:
            return this._id;
        }
      });
      mockLiveApiGet({
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
        catchAllChain: {
          in_note: -1, // Catch-all chain - receives all notes
          name: "Nested Rack",
          color: 16711680,
          mute: 0,
          solo: 0,
          devices: children("nestedDrumRack"),
        },
        nestedDrumRack: {
          name: "Nested Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          chains: [],
          return_chains: [],
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "drum-pads", "chains"],
      });

      // Catch-all chain should show up with pitch "*" and note -1
      expect(result.instrument.drumPads).toHaveLength(1);
      expect(result.instrument.drumPads[0]).toMatchObject({
        note: -1,
        pitch: "*",
        name: "Nested Rack",
      });
      // Verify the chain has the catch-all path format
      expect(result.instrument.drumPads[0].chains[0]).toMatchObject({
        id: "catchAllChain",
        name: "Nested Rack",
      });
    });

    it("aggregates muted state from chains", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drumrack";
          case "live_set tracks 0 devices 0 chains 0":
            return "mutedChain";
          default:
            return this._id;
        }
      });
      mockLiveApiGet({
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
        simplerDevice: {
          name: "Simpler",
          class_name: "Simpler",
          class_display_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "drum-pads"],
      });

      // The drum pad should show as muted
      expect(result.instrument.drumPads[0]).toMatchObject({
        note: 60,
        pitch: "C3",
        name: "Muted Pad",
        state: "muted",
      });
    });
  });
});
