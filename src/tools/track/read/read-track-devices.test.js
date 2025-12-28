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
          "chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "midi-effects",
          "audio-effects",
        ],
      });

      expect(result.instrument).toEqual({
        id: "device1",
        type: "instrument: Analog",
        name: "Custom Analog",
      });

      expect(result.audioEffects).toEqual([
        {
          id: "device2",
          type: "audio-effect: Reverb",
          name: "Custom Reverb",
        },
      ]);

      expect(result.midiEffects).toEqual([
        {
          id: "device3",
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
        id: "device1",
        name: "My Drums",
        type: "drum-rack",
        // drumPads: [], // Only included when drum-pads is requested
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
          "chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "audio-effects",
        ],
      });

      expect(result.instrument).toEqual({
        id: "device1",
        type: "drum-rack",
        name: "My Drums",
        // drumPads: [], // Only included when drum-pads is requested
      });

      expect(result.audioEffects).toHaveLength(1);
      expect(result.audioEffects[0]).toEqual({
        id: "device2",
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
        include: ["instruments", "chains"],
      });

      expect(result.instrument).toEqual({
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
                id: "nested_device1",
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
          "chains",
          "instruments",
          "session-clips",
          "arrangement-clips",
          "audio-effects",
        ],
      });

      expect(result.audioEffects).toHaveLength(1);
      expect(result.audioEffects[0]).toEqual({
        id: "fx_rack1",
        type: "audio-effect-rack",
        name: "Master FX",
        chains: [
          {
            id: "chain1",
            type: "Chain",
            name: "Filter Chain",
            color: "#0000FF",
            devices: [
              {
                id: "nested_effect1",
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
        include: ["instruments", "chains"],
      });

      expect(result.instrument).toEqual({
        id: "outer_rack",
        type: "instrument-rack",
        name: "Master FX",
        chains: [
          {
            id: "outer_chain",
            type: "Chain",
            name: "Wet",
            color: "#0000FF",
            devices: [
              {
                id: "inner_rack",
                type: "audio-effect-rack",
                name: "Reverb Chain",
                chains: [
                  {
                    id: "inner_chain",
                    type: "Chain",
                    name: "Hall",
                    color: "#00FF00",
                    state: "soloed",
                    devices: [
                      {
                        id: "deep_device",
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
  });
});
