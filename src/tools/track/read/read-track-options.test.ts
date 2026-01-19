import { describe, expect, it } from "vitest";
import {
  children,
  expectedClip,
  liveApiId,
  liveApiPath,
  liveApiType,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.js";
import {
  createOutputOnlyRoutingMock,
  createSimpleRoutingMock,
} from "#src/test/mocks/routing-mock-helpers.js";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.js";
import { mockTrackProperties } from "./helpers/read-track-test-helpers.js";
import { readTrack } from "./read-track.js";

describe("readTrack", () => {
  describe("wildcard include '*'", () => {
    it("includes all available options when '*' is used", () => {
      liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
        switch (this._path) {
          case "live_set tracks 0":
            return "track1";
          case "live_set tracks 0 mixer_device":
            return "mixer_1";
          case "live_set tracks 0 mixer_device volume":
            return "volume_param_1";
          case "live_set tracks 0 mixer_device panning":
            return "panning_param_1";
          case "live_set tracks 0 devices 0":
            return "synth1";
          case "live_set tracks 0 devices 1":
            return "effect1";
          case "live_set tracks 0 clip_slots 0 clip":
            return "clip1";
          default:
            return this._id!;
        }
      });

      liveApiType.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._path === "id arr_clip1") {
          return "Clip";
        }

        if (this._path === "id clip1") {
          return "Clip";
        }

        if (this._path === "id synth1") {
          return "Device";
        }

        if (this._path === "id effect1") {
          return "Device";
        }
        // Fall back to default MockLiveAPI logic
      });

      mockLiveApiGet({
        Track: mockTrackProperties({
          name: "Wildcard Test Track",
          has_midi_input: 1,
          devices: children("synth1", "effect1"),
          clip_slots: children("slot1"),
          arrangement_clips: children("arr_clip1"),
          ...createSimpleRoutingMock(),
        }),
        MixerDevice: {
          volume: children("volume_param_1"),
          panning: children("panning_param_1"),
        },
        volume_param_1: {
          display_value: 0,
        },
        panning_param_1: {
          value: 0,
        },
        synth1: {
          name: "Analog",
          class_name: "UltraAnalog",
          class_display_name: "Analog",
          type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        effect1: {
          name: "Reverb",
          class_name: "Reverb",
          class_display_name: "Reverb",
          type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
          is_active: 1,
          can_have_chains: 0,
          can_have_drum_pads: 0,
        },
        slot1: {
          clip: expectedClip({ id: "clip1", view: "session" }),
        },
        clip1: expectedClip({ id: "clip1", view: "session" }),
        arr_clip1: expectedClip({ id: "arr_clip1", view: "arrangement" }),
      });

      // Test with '*' - should include everything
      const resultWildcard = readTrack({
        trackIndex: 0,
        include: ["*"],
      });

      // Test explicit list - should produce identical result
      const resultExplicit = readTrack({
        trackIndex: 0,
        include: [
          "drum-pads",
          "drum-maps",
          "clip-notes",
          "chains",
          "midi-effects",
          "instruments",
          "audio-effects",
          "routings",
          "available-routings",
          "session-clips",
          "arrangement-clips",
          "all-devices",
          "all-routings",
          "color",
          "warp-markers",
          "mixer",
        ],
      });

      // Results should be identical
      expect(resultWildcard).toStrictEqual(resultExplicit);

      // Verify key properties are included
      expect(resultWildcard).toStrictEqual(
        expect.objectContaining({
          instrument: expect.any(Object),
          audioEffects: expect.any(Array),
          midiEffects: expect.any(Array),
          sessionClips: expect.any(Array),
          arrangementClips: expect.any(Array),
          availableInputRoutingChannels: expect.any(Array),
          inputRoutingChannel: expect.any(Object),
          monitoringState: expect.any(String),
        }),
      );
    });
  });

  describe("category parameter", () => {
    describe("return tracks", () => {
      it("reads return track when category is 'return'", () => {
        liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
          if (this.path === "live_set return_tracks 1") {
            return "return_track_1";
          }

          return "id 0";
        });

        mockLiveApiGet({
          "live_set return_tracks 1": {
            name: "Return B",
            has_midi_input: 0, // Return tracks are typically audio
            color: 65280, // Green
            mute: 0,
            solo: 0,
            arm: 0,
            can_be_armed: 0, // Return tracks cannot be armed
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

        const result = readTrack({ trackIndex: 1, category: "return" });

        expect(result).toStrictEqual({
          id: "return_track_1",
          type: "audio",
          name: "Return B",
          returnTrackIndex: 1,
          arrangementFollower: true,
          sessionClips: [], // Return tracks have no session clips
          arrangementClips: [], // Return tracks have no arrangement clips
          instrument: null,
        });
      });

      it("returns null values when return track does not exist", () => {
        liveApiId.mockReturnValue("id 0");

        const result = readTrack({ trackIndex: 99, category: "return" });

        expect(result).toStrictEqual({
          id: null,
          type: null,
          name: null,
          returnTrackIndex: 99,
        });
      });

      it("includes routing properties for return tracks when requested", () => {
        liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
          if (this.path === "live_set return_tracks 0") {
            return "return_track_1";
          }

          return "id 0";
        });
        liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
          return this._path;
        });

        mockLiveApiGet({
          "live_set return_tracks 0": {
            name: "Return A",
            has_midi_input: 0,
            can_be_armed: 0,
            color: 0,
            mute: 0,
            solo: 0,
            arm: 0,
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
            ...createOutputOnlyRoutingMock(),
            available_input_routing_channels: null,
            available_input_routing_types: null,
            input_routing_channel: null,
            input_routing_type: null,
          },
        });

        const result = readTrack({
          trackIndex: 0,
          category: "return",
          include: ["routings", "available-routings"],
        });

        // Return tracks should have null input routing (they don't accept input)
        expect(result.inputRoutingType).toBeNull();
        expect(result.inputRoutingChannel).toBeNull();
        expect(result.availableInputRoutingTypes).toStrictEqual([]);
        expect(result.availableInputRoutingChannels).toStrictEqual([]);

        // But should have output routing
        expect(result.outputRoutingType).toStrictEqual({
          name: "Track Out",
          outputId: "25",
        });
        expect(result.outputRoutingChannel).toStrictEqual({
          name: "Master",
          outputId: "26",
        });
      });
    });

    describe("master track", () => {
      it("reads master track when category is 'master'", () => {
        liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
          if (this.path === "live_set master_track") {
            return "master_track";
          }

          return "id 0";
        });

        mockLiveApiGet({
          "live_set master_track": {
            name: "Master",
            has_midi_input: 0, // Master track is audio
            color: 16777215, // White
            can_be_armed: 0, // Master track cannot be armed
            is_foldable: 0,
            is_grouped: 0,
            group_track: ["id", 0],
            devices: children("compressor1"),
            clip_slots: [],
            arrangement_clips: [],
            back_to_arranger: 0,
            playing_slot_index: -1,
            fired_slot_index: -1,
            muted_via_solo: 0,
            mute: 0,
            solo: 0,
            arm: 0,
          },
          compressor1: {
            name: "Compressor",
            class_name: "Compressor2",
            class_display_name: "Compressor",
            type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
            is_active: 1,
            can_have_chains: 0,
            can_have_drum_pads: 0,
          },
        });

        const result = readTrack({ trackIndex: 999, category: "master" }); // trackIndex should be ignored

        expect(result).toStrictEqual({
          id: "master_track",
          type: "audio",
          name: "Master",
          arrangementFollower: true,
          sessionClips: [], // Master track has no session clips
          arrangementClips: [], // Master track has no arrangement clips
          instrument: null,
        });

        // trackIndex should be ignored for master track
        expect(result.trackIndex).toBeUndefined();
        expect(result.returnTrackIndex).toBeUndefined();
      });

      it("returns null values when master track does not exist", () => {
        liveApiId.mockReturnValue("id 0");

        const result = readTrack({ trackIndex: 0, category: "master" });

        expect(result).toStrictEqual({
          id: null,
          type: null,
          name: null,
          trackIndex: null, // trackIndex is null for master track
        });
      });

      it("includes audio effects for master track when requested", () => {
        liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
          switch (this._path) {
            case "live_set master_track":
              return "master_track";
            case "live_set master_track devices 0":
              return "compressor1";
            case "live_set master_track devices 1":
              return "limiter1";
            default:
              return this._id!;
          }
        });

        mockLiveApiGet({
          "live_set master_track": {
            name: "Master",
            has_midi_input: 0,
            color: 0,
            mute: 0,
            solo: 0,
            arm: 0,
            can_be_armed: 0,
            is_foldable: 0,
            is_grouped: 0,
            group_track: ["id", 0],
            devices: children("compressor1", "limiter1"),
            clip_slots: [],
            arrangement_clips: [],
            back_to_arranger: 0,
            playing_slot_index: -1,
            fired_slot_index: -1,
            muted_via_solo: 0,
          },
          compressor1: {
            name: "Compressor",
            class_name: "Compressor2",
            class_display_name: "Compressor",
            type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
            is_active: 1,
            can_have_chains: 0,
            can_have_drum_pads: 0,
          },
          limiter1: {
            name: "Limiter",
            class_name: "Limiter",
            class_display_name: "Limiter",
            type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
            is_active: 1,
            can_have_chains: 0,
            can_have_drum_pads: 0,
          },
        });

        const result = readTrack({
          trackIndex: 0,
          category: "master",
          include: ["audio-effects"],
        });

        expect(result.audioEffects).toStrictEqual([
          {
            id: "compressor1",
            type: "audio-effect: Compressor",
          },
          {
            id: "limiter1",
            type: "audio-effect: Limiter",
          },
        ]);
      });

      it("sets null routing properties for master track when requested", () => {
        liveApiId.mockReturnValue("master_track");
        mockLiveApiGet({
          Track: {
            name: "Master",
            has_midi_input: 0,
            can_be_armed: 0,
            color: 0,
            mute: 0,
            solo: 0,
            arm: 0,
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

        const result = readTrack({
          trackIndex: 0,
          category: "master",
          include: ["routings", "available-routings"],
        });

        // Master track should have null routing properties
        expect(result.inputRoutingType).toBeNull();
        expect(result.inputRoutingChannel).toBeNull();
        expect(result.outputRoutingType).toBeNull();
        expect(result.outputRoutingChannel).toBeNull();
        expect(result.availableInputRoutingTypes).toStrictEqual([]);
        expect(result.availableInputRoutingChannels).toStrictEqual([]);
        expect(result.availableOutputRoutingTypes).toStrictEqual([]);
        expect(result.availableOutputRoutingChannels).toStrictEqual([]);
      });

      it("reads master track without requiring trackIndex", () => {
        liveApiId.mockReturnValue("master_track");
        mockLiveApiGet({
          "live_set master_track": {
            name: "Master",
            has_midi_input: 0,
            can_be_armed: 0,
            color: 16777215, // White
            mute: 0,
            solo: 0,
            arm: 0,
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

        const result = readTrack({ category: "master" });

        expect(result).toStrictEqual({
          id: "master_track",
          type: "audio",
          name: "Master",
          arrangementFollower: true,
          sessionClips: [],
          arrangementClips: [],
          instrument: null,
        });
      });
    });

    describe("regular tracks (default behavior)", () => {
      it("defaults to regular track when category is not specified", () => {
        liveApiId.mockReturnValue("track1");
        mockLiveApiGet({
          Track: mockTrackProperties({
            name: "Default Track",
          }),
        });

        const result = readTrack({ trackIndex: 0 });

        expect(result.trackIndex).toBe(0);
        expect(result.returnTrackIndex).toBeUndefined();
        expect(result.id).toBe("track1");
      });

      it("reads regular track when category is explicitly 'regular'", () => {
        liveApiId.mockReturnValue("track1");
        mockLiveApiGet({
          Track: mockTrackProperties({
            name: "Regular Track",
          }),
        });

        const result = readTrack({ trackIndex: 0, category: "regular" });

        expect(result.trackIndex).toBe(0);
        expect(result.returnTrackIndex).toBeUndefined();
        expect(result.id).toBe("track1");
      });
    });

    describe("invalid category", () => {
      it("throws error for invalid category", () => {
        expect(() => {
          readTrack({ trackIndex: 0, category: "invalid" });
        }).toThrow(
          'Invalid category: invalid. Must be "regular", "return", or "master".',
        );
      });
    });
  });
});
