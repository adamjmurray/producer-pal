import { describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.js";
import { readLiveSet } from "../read-live-set.js";

describe("readLiveSet - track types", () => {
  it("conditionally includes return tracks and master track", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        case "live_set return_tracks 0":
          return "return1";
        case "live_set return_tracks 1":
          return "return2";
        case "live_set master_track":
          return "master1";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Track Types Test Set",
        tracks: children("track1"),
        return_tracks: children("return1", "return2"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Regular Track",
        clip_slots: children(),
        arrangement_clips: children(),
        devices: [],
      },
      "live_set return_tracks 0": {
        has_midi_input: 0,
        name: "Return A",
        clip_slots: children(), // Return tracks don't have clip slots in actual Live
        arrangement_clips: children(),
        devices: [],
      },
      "live_set return_tracks 1": {
        has_midi_input: 0,
        name: "Return B",
        clip_slots: children(),
        arrangement_clips: children(),
        devices: [],
      },
      "live_set master_track": {
        has_midi_input: 0,
        name: "Master",
        clip_slots: children(), // Master track doesn't have clip slots in actual Live
        arrangement_clips: children(),
        devices: [],
      },
    });

    // Test with all track types included
    const resultAll = readLiveSet({
      include: [
        "regular-tracks",
        "return-tracks",
        "master-track",
        "instruments",
      ],
    });

    expect(resultAll).toEqual(
      expect.objectContaining({
        tracks: [
          expect.objectContaining({
            id: "track1",
            name: "Regular Track",
            trackIndex: 0,
          }),
        ],
        returnTracks: [
          expect.objectContaining({
            id: "return1",
            name: "Return A",
            returnTrackIndex: 0,
            sessionClipCount: 0, // Return tracks don't have session clips
            arrangementClipCount: 0, // Return tracks don't have arrangement clips
          }),
          expect.objectContaining({
            id: "return2",
            name: "Return B",
            returnTrackIndex: 1,
            sessionClipCount: 0, // Return tracks don't have session clips
            arrangementClipCount: 0, // Return tracks don't have arrangement clips
          }),
        ],
        masterTrack: expect.objectContaining({
          id: "master1",
          name: "Master",
          sessionClipCount: 0, // Master track doesn't have session clips
          arrangementClipCount: 0, // Master track doesn't have arrangement clips
        }),
      }),
    );

    // Test with only return tracks included
    const resultReturnOnly = readLiveSet({
      include: ["return-tracks", "instruments"],
    });

    expect(resultReturnOnly.tracks).toBeUndefined();
    expect(resultReturnOnly.returnTracks).toHaveLength(2);
    expect(resultReturnOnly.masterTrack).toBeUndefined();

    // Test with only master track included
    const resultMasterOnly = readLiveSet({
      include: ["master-track", "instruments"],
    });

    expect(resultMasterOnly.tracks).toBeUndefined();
    expect(resultMasterOnly.returnTracks).toBeUndefined();
    expect(resultMasterOnly.masterTrack).toBeDefined();

    // Test default behavior (should include regular tracks by default)
    const resultDefault = readLiveSet();

    expect(resultDefault.tracks).toHaveLength(1);
    expect(resultDefault.returnTracks).toBeUndefined();
    expect(resultDefault.masterTrack).toBeUndefined();
  });

  it("includes all available options when '*' is used", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        case "live_set return_tracks 0":
          return "return1";
        case "live_set master_track":
          return "master1";
        case "live_set scenes 0":
          return "scene1";
        case "live_set tracks 0 devices 0":
          return "synth1";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Wildcard Test Set",
        tracks: children("track1"),
        return_tracks: children("return1"),
        scenes: children("scene1"),
        cue_points: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: children(),
        arrangement_clips: children(),
        devices: children("synth1"),
        available_input_routing_channels: [
          '{"available_input_routing_channels": [{"display_name": "In 1", "identifier": 1}]}',
        ],
        available_input_routing_types: [
          '{"available_input_routing_types": [{"display_name": "Ext. In", "identifier": 17}]}',
        ],
        available_output_routing_channels: [
          '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}]}',
        ],
        available_output_routing_types: [
          '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}]}',
        ],
        input_routing_channel: [
          '{"input_routing_channel": {"display_name": "In 1", "identifier": 1}}',
        ],
        input_routing_type: [
          '{"input_routing_type": {"display_name": "Ext. In", "identifier": 17}}',
        ],
        output_routing_channel: [
          '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}',
        ],
        output_routing_type: [
          '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}',
        ],
        current_monitoring_state: [1],
      },
      "live_set return_tracks 0": {
        has_midi_input: 0,
        name: "Return A",
        arrangement_clips: children(),
        devices: [],
      },
      "live_set master_track": {
        has_midi_input: 0,
        name: "Master",
        arrangement_clips: children(),
        devices: [],
      },
      "live_set scenes 0": {
        name: "Scene 1",
        is_empty: 0,
        tempo_enabled: 0,
        time_signature_enabled: 0,
        is_triggered: 0,
        color: 16777215,
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
    });

    // Test with '*' - should include everything
    const resultWildcard = readLiveSet({
      include: ["*"],
    });

    // Test explicit list - should produce identical result
    const resultExplicit = readLiveSet({
      include: [
        "drum-pads",
        "clip-notes",
        "chains",
        "scenes",
        "midi-effects",
        "instruments",
        "audio-effects",
        "routings",
        "session-clips",
        "arrangement-clips",
        "regular-tracks",
        "return-tracks",
        "master-track",
        "color",
        "locators",
      ],
    });

    // Results should be identical
    expect(resultWildcard).toEqual(resultExplicit);

    // Verify key properties are included
    expect(resultWildcard).toEqual(
      expect.objectContaining({
        tracks: expect.any(Array),
        returnTracks: expect.any(Array),
        masterTrack: expect.any(Object),
        scenes: expect.any(Array),
      }),
    );

    // Verify track has all expected properties
    expect(resultWildcard.tracks[0]).toEqual(
      expect.objectContaining({
        instrument: expect.any(Object),
        inputRoutingChannel: expect.any(Object),
        sessionClips: expect.any(Array),
        arrangementClips: expect.any(Array),
        color: expect.any(String),
      }),
    );
  });
});
