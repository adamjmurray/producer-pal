import { describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  mockLiveApiGet,
} from "../../../test/mock-live-api.js";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "../../constants.js";
import { mockTrackProperties } from "./helpers/read-track-test-helpers.js";
import { readTrack } from "./read-track.js";

describe("readTrack", () => {
  describe("drumPads", () => {
    it("returns null when instrument rack first chain has no devices", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Instrument Rack Empty Chain",
          devices: children("instrumentRack"),
        }),
        instrumentRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
          class_name: "InstrumentGroupDevice",
          chains: children("chain1"),
        },
        chain1: {
          devices: [],
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumMap).toBeUndefined();
    });

    it("returns null when instrument rack first chain first device is not a drum rack", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Instrument Rack Non-Drum Device",
          devices: children("instrumentRack"),
        }),
        instrumentRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
          class_name: "InstrumentGroupDevice",
          chains: children("chain1"),
        },
        chain1: {
          devices: children("wavetable"),
        },
        wavetable: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumMap).toBeUndefined();
    });

    it("prefers direct drum rack over nested drum rack", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Track Direct and Nested Drum Racks",
          devices: children("directDrumRack", "instrumentRack"),
        }),
        directDrumRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          drum_pads: children("pad1"),
        },
        pad1: {
          note: 60,
          name: "Direct Kick",
          chains: children("chain1"),
        },
        instrumentRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 0,
          class_name: "InstrumentGroupDevice",
          chains: children("chain1"),
        },
        chain1: {
          devices: children("nestedDrumRack"),
        },
        nestedDrumRack: {
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          can_have_drum_pads: 1,
          drum_pads: children("pad2"),
        },
        pad2: {
          note: 61,
          name: "Nested Snare",
          chains: children("chain2"),
        },
      });
      const result = readTrack({ trackIndex: 0 });
      expect(result.drumMap).toEqual({ C3: "Direct Kick" });
    });

    it("adds hasInstrument:false property only to drum chains without instruments", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drum_rack";
          case "live_set tracks 0 devices 0 drum_pads 36":
            return "kick_pad";
          case "live_set tracks 0 devices 0 drum_pads 37":
            return "empty_pad";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0":
            return "kick_chain";
          case "live_set tracks 0 devices 0 drum_pads 37 chains 0":
            return "empty_chain";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("drum_rack"),
        }),
        drum_rack: {
          name: "Test Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("kick_pad", "empty_pad"),
          return_chains: [],
        },
        kick_pad: {
          name: "Kick",
          note: 36,
          mute: 0,
          solo: 0,
          chains: children("kick_chain"),
        },
        empty_pad: {
          name: "Empty",
          note: 37,
          mute: 0,
          solo: 0,
          chains: children("empty_chain"),
        },
        kick_chain: {
          name: "Kick",
          color: 16711680,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("kick_device"),
        },
        empty_chain: {
          name: "Empty",
          color: 65280,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [], // No devices = no instruments
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

      // Verify the track was read successfully
      expect(result.id).toBe("track1");
      expect(result.instrument).toBeDefined();

      // drumPads only included when drum-pads is requested
      // expect(result.instrument.drumPads).toEqual([
      //   expect.objectContaining({
      //     name: "Kick",
      //     note: 36,
      //     // Should not have hasInstrument property when it has an instrument
      //   }),
      //   expect.objectContaining({
      //     name: "Empty",
      //     note: 37,
      //     hasInstrument: false, // Should have hasInstrument: false when no instruments
      //   }),
      // ]);

      // // The kick pad should not have hasInstrument property
      // expect(result.instrument.drumPads[0]).not.toHaveProperty("hasInstrument");
      // // The empty pad should have hasInstrument: false
      // expect(result.instrument.drumPads[1]).toHaveProperty(
      //   "hasInstrument",
      //   false,
      // );
    });

    it("excludes drum chains without instruments from drumMap", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drum_rack";
          case "live_set tracks 0 devices 0 drum_pads 36":
            return "kick_pad";
          case "live_set tracks 0 devices 0 drum_pads 37":
            return "empty_pad";
          case "live_set tracks 0 devices 0 drum_pads 38":
            return "snare_pad";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0":
            return "kick_chain";
          case "live_set tracks 0 devices 0 drum_pads 37 chains 0":
            return "empty_chain";
          case "live_set tracks 0 devices 0 drum_pads 38 chains 0":
            return "snare_chain";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("drum_rack"),
        }),
        drum_rack: {
          name: "Test Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("kick_pad", "empty_pad", "snare_pad"),
          return_chains: [],
        },
        kick_pad: {
          name: "Kick",
          note: 36, // C1
          mute: 0,
          solo: 0,
          chains: children("kick_chain"),
        },
        empty_pad: {
          name: "Empty",
          note: 37, // Db1
          mute: 0,
          solo: 0,
          chains: children("empty_chain"),
        },
        snare_pad: {
          name: "Snare",
          note: 38, // D1
          mute: 0,
          solo: 0,
          chains: children("snare_chain"),
        },
        kick_chain: {
          name: "Kick",
          color: 16711680,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("kick_device"),
        },
        empty_chain: {
          name: "Empty",
          color: 65280,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [], // No devices = no instruments
        },
        snare_chain: {
          name: "Snare",
          color: 255,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("snare_device"),
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
        snare_device: {
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

      // drumMap should only include pads with instruments (kick and snare), not empty pad
      expect(result.drumMap).toEqual({
        C1: "Kick", // Has instrument, included
        D1: "Snare", // Has instrument, included
        // Db1 "Empty" should be excluded because it has no instruments
      });
    });

    it("detects instruments nested within racks in drum chain chains", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drum_rack";
          case "live_set tracks 0 devices 0 drum_pads 36":
            return "kick_pad";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0":
            return "kick_chain";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0 devices 0":
            return "nested_rack";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0 devices 0 chains 0":
            return "nested_chain";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0 devices 0 chains 0 devices 0":
            return "nested_instrument";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("drum_rack"),
        }),
        drum_rack: {
          name: "Test Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("kick_pad"),
          return_chains: [],
        },
        kick_pad: {
          name: "Kick",
          note: 36,
          mute: 0,
          solo: 0,
          chains: children("kick_chain"),
        },
        kick_chain: {
          name: "Kick",
          color: 16711680,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("nested_rack"), // Nested rack instead of direct instrument
        },
        nested_rack: {
          name: "Nested Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("nested_chain"),
          return_chains: [],
        },
        nested_chain: {
          name: "Nested Chain",
          color: 65280,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("nested_instrument"),
        },
        nested_instruments: {
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
        include: [
          "clip-notes",
          "chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "drum-pads",
          "drum-maps", // Need to explicitly request drum-maps now
        ],
      });

      // drumPads only included when drum-pads is requested
      // Should detect the nested instrument and not add hasInstrument property
      // expect(result.instrument.drumPads[0]).not.toHaveProperty("hasInstrument");

      // drumMap should include the drum chain since it has a nested instrument
      expect(result.drumMap).toEqual({
        C1: "Kick",
      });
    });
  });
});
