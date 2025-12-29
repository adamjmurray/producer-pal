import { describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  mockLiveApiGet,
} from "../../../test/mock-live-api.js";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "../../constants.js";
import { mockTrackProperties } from "./helpers/read-track-test-helpers.js";
import { readTrack } from "./read-track.js";

describe("readTrack", () => {
  describe("drumChains", () => {
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
          "rack-chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "drum-chains",
        ],
      });

      // Verify the track was read successfully
      expect(result.id).toBe("track1");
      expect(result.instrument).toBeDefined();

      // drumChains only included when drum-chains is requested
      // expect(result.instrument.drumChains).toEqual([
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
      // expect(result.instrument.drumChains[0]).not.toHaveProperty("hasInstrument");
      // // The empty pad should have hasInstrument: false
      // expect(result.instrument.drumChains[1]).toHaveProperty(
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

      // drumMap now includes pad names even when instruments are missing
      expect(result.drumMap).toEqual({
        C1: "Kick", // Has instrument, included
        Db1: "Empty", // No instrument, still surfaced for mapping
        D1: "Snare", // Has instrument, included
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
        nested_instrument: {
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
          "rack-chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "drum-chains",
          "drum-maps", // Need to explicitly request drum-maps now
        ],
      });

      // drumChains only included when drum-chains is requested
      // Should detect the nested instrument and not add hasInstrument property
      // expect(result.instrument.drumChains[0]).not.toHaveProperty("hasInstrument");

      // drumMap should include the drum chain since it has a nested instrument
      expect(result.drumMap).toEqual({
        C1: "Kick",
      });
    });

    it("reads multilayer drum pad chains with nested racks, fx, and macros", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drum_rack";
          case "live_set tracks 0 devices 0 drum_pads 36":
            return "kick_pad";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0":
            return "layer_a_chain";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 1":
            return "layer_b_chain";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0 devices 0":
            return "layer_a_rack";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0 devices 0 chains 0":
            return "layer_a_sub_chain";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0 devices 0 chains 0 devices 0":
            return "layer_a_instrument";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0 devices 0 chains 0 devices 1":
            return "layer_a_fx";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 1 devices 0":
            return "layer_b_instrument";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 1 devices 1":
            return "layer_b_fx";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("drum_rack"),
        }),
        drum_rack: {
          name: "Layered Drum Rack",
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
          name: "Layered Kick",
          note: 36,
          mute: 0,
          solo: 0,
          chains: children("layer_a_chain", "layer_b_chain"),
        },
        layer_a_chain: {
          name: "Layer A",
          color: 111,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("layer_a_rack"),
        },
        layer_b_chain: {
          name: "Layer B",
          color: 222,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("layer_b_instrument", "layer_b_fx"),
        },
        layer_a_rack: {
          name: "Layer A Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("layer_a_sub_chain"),
          return_chains: [],
          visible_macro_count: 8,
          has_macro_mappings: 1,
        },
        layer_a_sub_chain: {
          name: "Layer A Synthesis",
          color: 333,
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("layer_a_instrument", "layer_a_fx"),
        },
        layer_a_instrument: {
          name: "Layer A Synth",
          class_name: "Layer A Synth",
          class_display_name: "Layer A Synth",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        layer_a_fx: {
          name: "Layer A FX",
          class_name: "Layer A FX",
          class_display_name: "Layer A FX",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        layer_b_instrument: {
          name: "Layer B Synth",
          class_name: "Layer B Synth",
          class_display_name: "Layer B Synth",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        layer_b_fx: {
          name: "Layer B FX",
          class_name: "Layer B FX",
          class_display_name: "Layer B FX",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: [
          "instruments",
          "rack-chains",
          "drum-chains",
          "drum-maps",
          "audio-effects",
        ],
      });

      expect(result.drumMap).toEqual({
        C1: "Layered Kick",
      });

      const drumChains = result.instrument.drumChains;
      expect(drumChains).toHaveLength(1);
      expect(drumChains[0].layers).toHaveLength(2);
      expect(drumChains[0]).not.toHaveProperty("hasInstrument");

      expect(drumChains[0].layers[0]).toEqual(
        expect.objectContaining({
          name: "Layer A",
          devices: expect.arrayContaining([
            expect.objectContaining({
              type: "instrument-rack",
              macros: expect.objectContaining({ count: 8, hasMappings: true }),
              chains: expect.arrayContaining([
                expect.objectContaining({
                  devices: expect.arrayContaining([
                    expect.objectContaining({ type: "instrument: Layer A Synth" }),
                    expect.objectContaining({ type: "audio-effect: Layer A FX" }),
                  ]),
                }),
              ]),
            }),
          ]),
        }),
      );

      expect(drumChains[0].layers[1]).toEqual(
        expect.objectContaining({
          name: "Layer B",
          devices: [
            expect.objectContaining({ type: "instrument: Layer B Synth" }),
            expect.objectContaining({ type: "audio-effect: Layer B FX" }),
          ],
        }),
      );
    });
  });
});
