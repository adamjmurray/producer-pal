// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children, expectedClip } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  createOutputOnlyRoutingMock,
  createSimpleRoutingMock,
} from "#src/test/mocks/routing-mock-helpers.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import { mockTrackProperties } from "../helpers/read-track-test-helpers.ts";
import { setupTrackPathMappedMocks } from "../helpers/read-track-path-mapped-test-helpers.ts";
import { readTrack } from "../read-track.ts";

function createMasterTrackProperties(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
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
    ...overrides,
  };
}

describe("readTrack", () => {
  describe("wildcard include '*'", () => {
    it("includes all available options when '*' is used", () => {
      setupTrackPathMappedMocks({
        pathIdMap: {
          [String(livePath.track(0))]: "track1",
          [livePath.track(0).mixerDevice()]: "mixer_1",
          [`${livePath.track(0).mixerDevice()} volume`]: "volume_param_1",
          [`${livePath.track(0).mixerDevice()} panning`]: "panning_param_1",
          [String(livePath.track(0).device(0))]: "synth1",
          [String(livePath.track(0).device(1))]: "effect1",
          [livePath.track(0).clipSlot(0).clip()]: "clip1",
          [livePath.track(0).arrangementClip(0)]: "arr_clip1",
        },
        objects: {
          Track: mockTrackProperties({
            name: "Wildcard Test Track",
            has_midi_input: 1,
            devices: children("synth1", "effect1"),
            clip_slots: children("slot1"),
            arrangement_clips: children("arr_clip1"),
            ...createSimpleRoutingMock(),
          }),
          mixer_1: {
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
          clip1: expectedClip({ id: "clip1", view: "session" }),
          arr_clip1: expectedClip({ id: "arr_clip1", view: "arrangement" }),
        },
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
          "sample",
          "color",
          "timing",
          "warp",
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

    it("applies mapped path-key object properties", () => {
      setupTrackPathMappedMocks({
        pathIdMap: {
          [String(livePath.track(0))]: "track1",
          [livePath.track(0).arrangementClip(0)]: "arr_clip1",
        },
        objects: {
          Track: mockTrackProperties({
            arrangement_clips: children("arr_clip1"),
            devices: [],
            clip_slots: [],
          }),
          [livePath.track(0).arrangementClip(0)]: {
            is_arrangement_clip: 1,
            name: "Clip From Path Key",
          },
        },
      });

      const result = readTrack({
        trackIndex: 0,
        include: ["arrangement-clips"],
      });

      const arrangementClips = result.arrangementClips as Array<{
        name: string;
      }>;

      expect(arrangementClips).toHaveLength(1);
      expect(arrangementClips[0]!.name).toBe("Clip From Path Key");
    });
  });

  describe("category parameter", () => {
    describe("return tracks", () => {
      it("reads return track when category is 'return'", () => {
        setupTrackPathMappedMocks({
          trackPath: String(livePath.returnTrack(1)),
          trackId: "return_track_1",
          objects: {
            Track: {
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
          },
        });

        const result = readTrack({ trackIndex: 1, category: "return" });

        expect(result).toStrictEqual({
          id: "return_track_1",
          type: "audio",
          name: "Return B",
          returnTrackIndex: 1,
          sessionClips: [], // Return tracks have no session clips
          arrangementClips: [], // Return tracks have no arrangement clips
          instrument: null,
        });
      });

      it("throws when return track does not exist", () => {
        registerMockObject("0", {
          path: livePath.returnTrack(99),
          type: "Track",
        });

        expect(() => readTrack({ trackIndex: 99, category: "return" })).toThrow(
          "readTrack: returnTrackIndex 99 does not exist",
        );
      });

      it("includes routing properties for return tracks when requested", () => {
        setupTrackPathMappedMocks({
          trackPath: String(livePath.returnTrack(0)),
          trackId: "return_track_1",
          objects: {
            Track: createMasterTrackProperties({
              name: "Return A",
              ...createOutputOnlyRoutingMock(),
              available_input_routing_channels: null,
              available_input_routing_types: null,
              input_routing_channel: null,
              input_routing_type: null,
            }),
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
        setupTrackPathMappedMocks({
          trackPath: String(livePath.masterTrack()),
          trackId: "master_track",
          pathIdMap: {
            [String(livePath.masterTrack().device(0))]: "compressor1",
          },
          objects: {
            Track: createMasterTrackProperties({
              color: 16777215, // White
              devices: children("compressor1"),
            }),
            compressor1: {
              name: "Compressor",
              class_name: "Compressor2",
              class_display_name: "Compressor",
              type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
              is_active: 1,
              can_have_chains: 0,
              can_have_drum_pads: 0,
            },
          },
        });

        const result = readTrack({ trackIndex: 999, category: "master" }); // trackIndex should be ignored

        expect(result).toStrictEqual({
          id: "master_track",
          type: "audio",
          name: "Master",
          sessionClips: [], // Master track has no session clips
          arrangementClips: [], // Master track has no arrangement clips
          instrument: null,
        });

        // trackIndex should be ignored for master track
        expect(result.trackIndex).toBeUndefined();
        expect(result.returnTrackIndex).toBeUndefined();
      });

      it("throws when master track does not exist", () => {
        registerMockObject("0", {
          path: livePath.masterTrack(),
          type: "Track",
        });

        expect(() => readTrack({ trackIndex: 0, category: "master" })).toThrow(
          "readTrack: trackIndex null does not exist",
        );
      });

      it("includes audio effects for master track when requested", () => {
        setupTrackPathMappedMocks({
          trackPath: String(livePath.masterTrack()),
          trackId: "master_track",
          pathIdMap: {
            [String(livePath.masterTrack().device(0))]: "compressor1",
            [String(livePath.masterTrack().device(1))]: "limiter1",
          },
          objects: {
            Track: createMasterTrackProperties({
              devices: children("compressor1", "limiter1"),
            }),
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
            path: "mt/d0",
            type: "audio-effect: Compressor",
          },
          {
            id: "limiter1",
            path: "mt/d1",
            type: "audio-effect: Limiter",
          },
        ]);
      });

      it("sets null routing properties for master track when requested", () => {
        setupTrackPathMappedMocks({
          trackPath: String(livePath.masterTrack()),
          trackId: "master_track",
          objects: {
            Track: createMasterTrackProperties(),
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
        setupTrackPathMappedMocks({
          trackPath: String(livePath.masterTrack()),
          trackId: "master_track",
          objects: {
            Track: createMasterTrackProperties({
              color: 16777215, // White
            }),
          },
        });

        const result = readTrack({ category: "master" });

        expect(result).toStrictEqual({
          id: "master_track",
          type: "audio",
          name: "Master",
          sessionClips: [],
          arrangementClips: [],
          instrument: null,
        });
      });
    });

    describe("regular tracks (default behavior)", () => {
      it("defaults to regular track when category is not specified", () => {
        setupTrackPathMappedMocks({
          trackId: "track1",
          objects: {
            Track: mockTrackProperties({
              name: "Default Track",
            }),
          },
        });

        const result = readTrack({ trackIndex: 0 });

        expect(result.trackIndex).toBe(0);
        expect(result.returnTrackIndex).toBeUndefined();
        expect(result.id).toBe("track1");
      });

      it("reads regular track when category is explicitly 'regular'", () => {
        setupTrackPathMappedMocks({
          trackId: "track1",
          objects: {
            Track: mockTrackProperties({
              name: "Regular Track",
            }),
          },
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
