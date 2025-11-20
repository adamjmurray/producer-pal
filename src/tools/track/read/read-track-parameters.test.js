import { describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  liveApiPath,
  liveApiType,
  mockLiveApiGet,
} from "../../../test/mock-live-api.js";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "../constants.js";
import { mockTrackProperties } from "./read-track-test-helpers.js";
import { readTrack } from "./read-track.js";

describe("readTrack", () => {
  describe("trackId parameter", () => {
    it("reads track by trackId", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "id 123") {
          return "123";
        }
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._path === "id 123") {
          return "live_set tracks 2";
        }
        return this._path;
      });

      mockLiveApiGet({
        "live_set tracks 2": {
          name: "Track by ID",
          has_midi_input: 1,
          color: 16711680, // Red
          mute: 0,
          solo: 0,
          arm: 1,
          can_be_armed: 1,
          is_foldable: 0,
          is_grouped: 0,
          group_track: ["id", 0],
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
          back_to_arranger: 0,
          playing_slot_index: -1,
          fired_slot_index: -1,
          muted_via_solo: 0,
        },
      });

      const result = readTrack({ trackId: "123" });

      expect(result).toEqual({
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
      liveApiId.mockImplementation(function () {
        if (this._path === "id 456") {
          return "456";
        }
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._path === "id 456") {
          return "live_set return_tracks 1";
        }
        return this._path;
      });
      liveApiType.mockReturnValue("Track");

      mockLiveApiGet({
        "live_set return_tracks 1": {
          name: "Return by ID",
          has_midi_input: 0,
          color: 65280, // Green
          mute: 0,
          solo: 0,
          arm: 0,
          can_be_armed: 0,
          is_foldable: 0,
          is_grouped: 0,
          group_track: ["id", 0],
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
          back_to_arranger: 0,
          playing_slot_index: -1,
          fired_slot_index: -1,
          muted_via_solo: 0,
        },
      });

      const result = readTrack({ trackId: "456" });

      expect(result).toEqual({
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
      liveApiId.mockImplementation(function () {
        if (this._path === "id 789") {
          return "789";
        }
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._path === "id 789") {
          return "live_set master_track";
        }
        return this._path;
      });
      liveApiType.mockReturnValue("Track");

      mockLiveApiGet({
        "live_set master_track": {
          name: "Master by ID",
          has_midi_input: 0,
          color: 16777215, // White
          mute: 0,
          solo: 0,
          arm: 0,
          can_be_armed: 0,
          is_foldable: 0,
          is_grouped: 0,
          group_track: ["id", 0],
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
          back_to_arranger: 0,
          playing_slot_index: -1,
          fired_slot_index: -1,
          muted_via_solo: 0,
        },
      });

      const result = readTrack({ trackId: "789" });

      expect(result).toEqual({
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
      liveApiId.mockImplementation(function () {
        if (this._path === "id 999") {
          return "999";
        }
        return this._id;
      });
      liveApiPath.mockImplementation(function () {
        if (this._path === "id 999") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      mockLiveApiGet({
        "live_set tracks 0": {
          name: "Track ignores type",
          has_midi_input: 1,
          color: 0,
          mute: 0,
          solo: 0,
          arm: 0,
          can_be_armed: 1,
          is_foldable: 0,
          is_grouped: 0,
          group_track: ["id", 0],
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
          back_to_arranger: 0,
          playing_slot_index: -1,
          fired_slot_index: -1,
          muted_via_solo: 0,
        },
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
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drumrack1";
          case "live_set tracks 0 devices 0 drum_pads 60":
            return "pad1";
          case "live_set tracks 0 devices 0 drum_pads 60 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 drum_pads 60 chains 0 devices 0":
            return "kick_device";
          case "live_set tracks 0 devices 0 chains 0":
            return "main_chain";
          default:
            return this._id;
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
          drum_pads: children("pad1"),
          chains: children("main_chain"),
          return_chains: [],
        },
        main_chain: {
          name: "Main Chain",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
        pad1: {
          note: 60, // C3
          name: "Test Kick",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          chains: children("chain1"),
        },
        chain1: {
          name: "Kick Chain",
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
      expect(result.drumMap).toEqual({
        C3: "Test Kick",
      });

      // Should have instrument but NO chains
      expect(result.instrument).toEqual({
        name: "Test Drum Rack",
        type: "drum-rack",
        // drumChains: [ // Only included when drum-chains is requested
        //   {
        //     name: "Test Kick",
        //     note: 60,
        //   },
        // ],
      });

      // Critical: chains should be stripped
      expect(result.instrument.chains).toBeUndefined();
    });

    it("drum racks don't have main chains even with rack-chains included", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "drumrack1";
          case "live_set tracks 0 devices 0 drum_pads 60":
            return "pad1";
          case "live_set tracks 0 devices 0 drum_pads 60 chains 0":
            return "chain1";
          case "live_set tracks 0 devices 0 drum_pads 60 chains 0 devices 0":
            return "kick_device2";
          case "live_set tracks 0 devices 0 chains 0":
            return "main_chain";
          default:
            return this._id;
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
          drum_pads: children("pad1"),
          chains: children("main_chain"),
          return_chains: [],
        },
        main_chain: {
          name: "Main Chain",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          devices: [],
        },
        pad1: {
          note: 60, // C3
          name: "Test Kick",
          mute: 0,
          muted_via_solo: 0,
          solo: 0,
          chains: children("chain1"),
        },
        chain1: {
          name: "Kick Chain",
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
        include: ["instruments", "drum-maps", "rack-chains"],
      });

      // Should have drumMap
      expect(result.drumMap).toEqual({
        C3: "Test Kick",
      });

      // Should have instrument WITHOUT chains (drum racks don't expose main chains)
      expect(result.instrument).toEqual({
        name: "Test Drum Rack",
        type: "drum-rack",
        // drumChains: [ // Only included when drum-chains is requested
        //   {
        //     name: "Test Kick",
        //     note: 60,
        //   },
        // ],
      });

      // Critical: chains should NOT be present on drum racks
      expect(result.instrument.chains).toBeUndefined();
    });

    it("strips chains from all device types when using drum-maps", () => {
      liveApiId.mockImplementation(function () {
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
            return this._id;
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
      expect(result.midiEffects[0]).toEqual({
        type: "midi-effect-rack",
      });
      expect(result.midiEffects[0].chains).toBeUndefined();

      expect(result.instrument).toEqual({
        type: "instrument-rack",
      });
      expect(result.instrument.chains).toBeUndefined();

      expect(result.audioEffects[0]).toEqual({
        type: "audio-effect-rack",
      });
      expect(result.audioEffects[0].chains).toBeUndefined();
    });

    it("uses drum-maps by default (not rack-chains)", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 devices 0":
            return "instrument_rack";
          case "live_set tracks 0 devices 0 chains 0":
            return "chain1";
          default:
            return this._id;
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

      // Should have instrument but NO chains (proving drum-maps is default, not rack-chains)
      expect(result.instrument).toEqual({
        type: "instrument-rack",
      });
      expect(result.instrument.chains).toBeUndefined();
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
      expect(result.instrument).toEqual({
        type: "instrument: Wavetable",
      });
      expect(result.drumMap).toBeUndefined();
      expect(result.instrument.chains).toBeUndefined();
    });
  });
});
