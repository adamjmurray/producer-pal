import { describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  mockLiveApiGet,
} from "../../test/mock-live-api.js";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "../constants.js";
import { readTrack } from "./read-track.js";
import { mockTrackProperties } from "./read-track.test-helpers.js";

describe("readTrack", () => {
  describe("devices", () => {
    it("returns null instrument when track has no devices", () => {
      liveApiId.mockReturnValue("track1");
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: [],
        }),
      });

      const result = readTrack({ trackIndex: 0 });
      expect(result.instrument).toBeNull();
      expect(result.midiEffects).toBeUndefined();
      expect(result.audioEffects).toBeUndefined();
    });

    it("categorizes devices correctly", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") {
          return "track1";
        }
        return this._id;
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("device1", "device2", "device3"),
        }),
        device1: {
          name: "Custom Analog",
          class_name: "InstrumentVector",
          class_display_name: "Analog",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        device2: {
          name: "Custom Reverb",
          class_name: "Reverb",
          class_display_name: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        device3: {
          name: "Custom Note Length",
          class_name: "MidiNoteLength",
          class_display_name: "Note Length",
          type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
          is_active: 0,
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
          "midi-effects",
          "audio-effects",
        ],
      });

      expect(result.instrument).toEqual({
        type: "instrument: Analog",
        name: "Custom Analog",
      });

      expect(result.audioEffects).toEqual([
        {
          type: "audio-effect: Reverb",
          name: "Custom Reverb",
        },
      ]);

      expect(result.midiEffects).toEqual([
        {
          type: "midi-effect: Note Length",
          name: "Custom Note Length",
          deactivated: true,
        },
      ]);
    });

    it("correctly identifies drum rack devices", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") {
          return "track1";
        }
        return this._id;
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("device1"),
        }),
        device1: {
          name: "My Drums",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: [],
          return_chains: [],
        },
      });

      const result = readTrack({ trackIndex: 0 });
      expect(result.instrument).toEqual({
        name: "My Drums",
        type: "drum-rack",
        // drumChains: [], // Only included when drum-chains is requested
      });
    });

    it("includes all device categories when explicitly requested", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") {
          return "track1";
        }
        return this._id;
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("device1", "device2"),
        }),
        device1: {
          name: "My Drums",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          chains: [],
          return_chains: [],
        },
        device2: {
          name: "Reverb",
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
          "rack-chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "audio-effects",
        ],
      });

      expect(result.instrument).toEqual({
        type: "drum-rack",
        name: "My Drums",
        // drumChains: [], // Only included when drum-chains is requested
      });

      expect(result.audioEffects).toHaveLength(1);
      expect(result.audioEffects[0]).toEqual({
        type: "audio-effect: Reverb",
      });
    });

    it("includes nested devices from instrument rack chains", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "rack1";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 chains 0 devices 0":
            return "nested_device1";
          default:
            return this._id;
        }
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
          chains: children("chain1"),
          return_chains: [],
        },
        chain1: {
          name: "Piano",
          color: 16711680, // Red
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("nested_device1"),
        },
        nested_device1: {
          name: "Lead Synth",
          class_name: "Operator",
          class_display_name: "Operator",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "rack-chains"],
      });

      expect(result.instrument).toEqual({
        type: "instrument-rack",
        name: "My Custom Rack",
        chains: [
          {
            name: "Piano",
            devices: [
              {
                type: "instrument: Operator",
                name: "Lead Synth",
              },
            ],
          },
        ],
      });
    });

    it("includes nested devices from audio effect rack chains", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "fx_rack1";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 chains 0 devices 0":
            return "nested_effect1";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("fx_rack1"),
        }),
        fx_rack1: {
          name: "Master FX",
          class_name: "AudioEffectGroupDevice",
          class_display_name: "Audio Effect Rack",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("chain1"),
          return_chains: [],
        },
        chain1: {
          name: "Filter Chain",
          color: 255, // Blue
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("nested_effect1"),
        },
        nested_effect1: {
          name: "Sweep Filter",
          class_name: "AutoFilter2",
          class_display_name: "Auto Filter",
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
          "rack-chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "audio-effects",
        ],
      });

      expect(result.audioEffects).toHaveLength(1);
      expect(result.audioEffects[0]).toEqual({
        type: "audio-effect-rack",
        name: "Master FX",
        chains: [
          {
            name: "Filter Chain",
            devices: [
              {
                type: "audio-effect: Auto Filter",
                name: "Sweep Filter",
              },
            ],
          },
        ],
      });
    });

    it("handles deeply nested racks", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "outer_rack";
          case "live_set tracks 0 devices 0 chains 0":
            return "outer_chain";
          case "live_set tracks 0 devices 0 chains 0 devices 0":
            return "inner_rack";
          case "live_set tracks 0 devices 0 chains 0 devices 0 chains 0":
            return "inner_chain";
          case "live_set tracks 0 devices 0 chains 0 devices 0 chains 0 devices 0":
            return "deep_device";
          default:
            return this._id;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("outer_rack"),
        }),
        outer_rack: {
          name: "Master FX",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("outer_chain"),
          return_chains: [],
        },
        outer_chain: {
          name: "Wet",
          color: 255, // Blue
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("inner_rack"),
        },
        inner_rack: {
          name: "Reverb Chain",
          class_name: "AudioEffectGroupDevice",
          class_display_name: "Audio Effect Rack",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("inner_chain"),
          return_chains: [],
        },
        inner_chain: {
          name: "Hall",
          color: 65280, // Green
          mute: 0,
          muted_via_solo: 0,
          solo: 1,
          devices: children("deep_device"),
        },
        deep_device: {
          name: "Big Hall",
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
        include: ["instruments", "rack-chains"],
      });

      expect(result.instrument).toEqual({
        type: "instrument-rack",
        name: "Master FX",
        chains: [
          {
            name: "Wet",
            devices: [
              {
                type: "audio-effect-rack",
                name: "Reverb Chain",
                chains: [
                  {
                    name: "Hall",
                    state: "soloed",
                    devices: [
                      {
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

    it("handles empty chains in racks", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "rack1";
          case "live_set tracks 0 devices 0 chains 0":
            return "empty_chain";
          default:
            return this._id;
        }
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
          color: 0, // Black
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [], // empty chain
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "rack-chains"],
      });

      expect(result.instrument).toEqual({
        name: "My Empty Rack",
        type: "instrument-rack",
        chains: [
          {
            name: "Empty Chain",
            devices: [],
          },
        ],
      });
    });

    it("handles multiple chains in a rack", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "rack1";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 chains 1":
            return "chain2";
          case "live_set tracks 0 devices 0 chains 0 devices 0":
            return "device1";
          case "live_set tracks 0 devices 0 chains 1 devices 0":
            return "device2";
          default:
            return this._id;
        }
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
          color: 16711680, // Red
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("device1"),
        },
        chain2: {
          name: "Bass",
          color: 65280, // Green
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
        include: ["instruments", "rack-chains"],
      });

      expect(result.instrument).toEqual({
        type: "instrument-rack",
        name: "My Custom Rack",
        chains: [
          {
            name: "Piano",
            devices: [
              {
                type: "instrument: Operator",
                name: "Lead Synth",
              },
            ],
          },
          {
            name: "Bass",
            state: "muted",
            devices: [
              {
                type: "instrument: Wavetable",
                name: "Bass Synth",
              },
            ],
          },
        ],
      });
    });

    it("handles drum rack drum chains with hasSoloedChain property", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drum_rack";
          case "live_set tracks 0 devices 0 drum_pads 36":
            return "kick_pad";
          case "live_set tracks 0 devices 0 drum_pads 38":
            return "snare_pad";
          case "live_set tracks 0 devices 0 drum_pads 36 chains 0":
            return "kick_chain";
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
          name: "My Drums",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          drum_pads: children("kick_pad", "snare_pad"),
          return_chains: [],
        },
        kick_pad: {
          name: "Kick",
          note: 36, // C1
          mute: 0,
          solo: 0,
          chains: children("kick_chain"),
        },
        snare_pad: {
          name: "Snare",
          note: 38, // D1
          mute: 0,
          solo: 1, // This pad is soloed
          chains: children("snare_chain"),
        },
        kick_chain: {
          name: "Kick",
          color: 16711680, // Red
          mute: 0,
          muted_via_solo: 1, // Muted because snare chain is soloed
          solo: 0,
          devices: children("kick_device"),
        },
        snare_chain: {
          name: "Snare",
          color: 65280, // Green
          mute: 0,
          muted_via_solo: 0, // Not muted via solo because this is the soloed one
          solo: 1,
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
      expect(result.instrument).toEqual({
        type: "drum-rack",
        name: "My Drums",
        drumChains: [
          {
            name: "Kick",
            note: 36, // C1
            pitch: "C1",
            state: "muted-via-solo",
            chain: {
              name: "Kick",
              state: "muted-via-solo",
              devices: [
                expect.objectContaining({
                  type: "instrument: Simpler",
                }),
              ],
            },
          },
          {
            name: "Snare",
            note: 38, // D1
            pitch: "D1",
            state: "soloed",
            chain: {
              name: "Snare",
              state: "soloed",
              devices: [
                expect.objectContaining({
                  type: "instrument: Simpler",
                }),
              ],
            },
          },
        ],
      });
    });

    it("combines device name and preset name", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0") {
          return "track1";
        }
        return this._id;
      });
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("device1", "device2"),
        }),
        device1: {
          name: "Reverb", // Same as class_display_name
          class_name: "Reverb",
          class_display_name: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        device2: {
          name: "My Custom Reverb", // Different from class_display_name
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
          "rack-chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "audio-effects",
        ],
      });
      expect(result.audioEffects).toEqual([
        {
          type: "audio-effect: Reverb",
        },
        {
          type: "audio-effect: Reverb",
          name: "My Custom Reverb",
        },
      ]);
    });
  });
});
