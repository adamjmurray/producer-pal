import { describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  liveApiPath,
  liveApiType,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.js";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.js";
import { mockTrackProperties } from "./helpers/read-track-test-helpers.js";
import { readTrack } from "./read-track.js";

describe("readTrack", () => {
  describe("trackId parameter", () => {
    it("reads track by trackId", () => {
      liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._path === "id 123") {
          return "123";
        }

        return this._id!;
      });
      liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._path === "id 123") {
          return "live_set tracks 2";
        }

        return this._path;
      });

      mockLiveApiGet({
        "live_set tracks 2": mockTrackProperties({
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
      liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._path === "id 456") {
          return "456";
        }

        return this._id!;
      });
      liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._path === "id 456") {
          return "live_set return_tracks 1";
        }

        return this._path;
      });
      liveApiType.mockReturnValue("Track");

      mockLiveApiGet({
        "live_set return_tracks 1": mockTrackProperties({
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
      liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._path === "id 789") {
          return "789";
        }

        return this._id!;
      });
      liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._path === "id 789") {
          return "live_set master_track";
        }

        return this._path;
      });
      liveApiType.mockReturnValue("Track");

      mockLiveApiGet({
        "live_set master_track": mockTrackProperties({
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
      liveApiId.mockReturnValue("id 0");

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
      liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._path === "id 999") {
          return "999";
        }

        return this._id!;
      });
      liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._path === "id 999") {
          return "live_set tracks 0";
        }

        return this._path;
      });

      mockLiveApiGet({
        "live_set tracks 0": mockTrackProperties({
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
      liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drumrack1";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 chains 0 devices 0":
            return "kick_device";
          default:
            return this._id!;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("drumrack1"),
        }),
        drumrack1: {
          name: "Test Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          chains: children("chain1"), // Chains directly on drum rack with in_note
          return_chains: [],
        },
        chain1: {
          in_note: 60, // C3 - chains use in_note
          name: "Test Kick",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("kick_device"),
        },
        kick_device: {
          name: "Kick Instrument",
          class_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        },
      });

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
      liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drumrack1";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 chains 0 devices 0":
            return "kick_device2";
          default:
            return this._id!;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("drumrack1"),
        }),
        drumrack1: {
          name: "Test Drum Rack",
          class_name: "DrumGroupDevice",
          class_display_name: "Drum Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 1,
          chains: children("chain1"), // Chains directly on drum rack with in_note
          return_chains: [],
        },
        chain1: {
          in_note: 60, // C3 - chains use in_note
          name: "Test Kick",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: children("kick_device2"),
        },
        kick_device2: {
          name: "Kick Instrument",
          class_name: "Simpler",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
        },
      });

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
      liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "midi_effect_rack";
          case "live_set tracks 0 devices 1":
            return "instrument_rack";
          case "live_set tracks 0 devices 2":
            return "audio_effect_rack";
          case "live_set tracks 0 devices 0 chains 0":
            return "midi_chain";
          case "live_set tracks 0 devices 1 chains 0":
            return "inst_chain";
          case "live_set tracks 0 devices 2 chains 0":
            return "audio_chain";
          default:
            return this._id!;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children(
            "midi_effect_rack",
            "instrument_rack",
            "audio_effect_rack",
          ),
        }),
        midi_effect_rack: {
          name: "MIDI Effect Rack",
          class_name: "MidiEffectGroupDevice",
          class_display_name: "MIDI Effect Rack",
          type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("midi_chain"),
          return_chains: [],
        },
        instrument_rack: {
          name: "Instrument Rack",
          class_name: "InstrumentGroupDevice",
          class_display_name: "Instrument Rack",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("inst_chain"),
          return_chains: [],
        },
        audio_effect_rack: {
          name: "Audio Effect Rack",
          class_name: "AudioEffectGroupDevice",
          class_display_name: "Audio Effect Rack",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 1,
          can_have_drum_pads: 0,
          chains: children("audio_chain"),
          return_chains: [],
        },
        midi_chain: {
          name: "MIDI Chain",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
        inst_chain: {
          name: "Inst Chain",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
        audio_chain: {
          name: "Audio Chain",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["midi-effects", "instruments", "audio-effects", "drum-maps"],
      });

      // All devices should have chains stripped
      const midiEffects = result.midiEffects as Record<string, unknown>[];

      expect(midiEffects[0]).toStrictEqual({
        id: "midi_effect_rack",
        type: "midi-effect-rack",
      });
      expect(midiEffects[0]!.chains).toBeUndefined();

      expect(result.instrument).toStrictEqual({
        id: "instrument_rack",
        type: "instrument-rack",
      });
      expect(
        (result.instrument as Record<string, unknown>).chains,
      ).toBeUndefined();

      const audioEffects = result.audioEffects as Record<string, unknown>[];

      expect(audioEffects[0]).toStrictEqual({
        id: "audio_effect_rack",
        type: "audio-effect-rack",
      });
      expect(audioEffects[0]!.chains).toBeUndefined();
    });

    it("uses drum-maps by default (not chains)", () => {
      liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "instrument_rack";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          default:
            return this._id!;
        }
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("instrument_rack"),
        }),
        instrument_rack: {
          name: "Instrument Rack",
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
          name: "Chain 1",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
      });

      // Call with NO include param - should use defaults
      const result = readTrack({ trackIndex: 0 });

      // Should have instrument but NO chains (proving drum-maps is default, not chains)
      expect(result.instrument).toStrictEqual({
        id: "instrument_rack",
        type: "instrument-rack",
      });
      expect(
        (result.instrument as Record<string, unknown>).chains,
      ).toBeUndefined();
    });

    it("handles drum-maps with no drum racks gracefully", () => {
      mockLiveApiGet({
        Track: mockTrackProperties({
          devices: children("wavetable"),
        }),
        wavetable: {
          name: "Wavetable",
          class_name: "InstrumentVector",
          class_display_name: "Wavetable",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["instruments", "drum-maps"],
      });

      // Should have instrument but no drumMap
      expect(result.instrument).toStrictEqual({
        id: "wavetable",
        type: "instrument: Wavetable",
      });
      expect(result.drumMap).toBeUndefined();
      expect(
        (result.instrument as Record<string, unknown>).chains,
      ).toBeUndefined();
    });
  });
});
