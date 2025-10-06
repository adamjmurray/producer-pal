import { describe, expect, it } from "vitest";
import {
  children,
  expectedClip,
  expectedTrack,
  liveApiCall,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "../../test/mock-live-api.js";
import {
  DEVICE_TYPE,
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "../constants.js";
import { readLiveSet } from "./read-live-set.js";

describe("readLiveSet", () => {
  it("returns live set information including tracks and scenes", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 1":
          return "track2";
        case "live_set tracks 2":
          return "track3";
        case "live_set scenes 0":
          return "scene1";
        case "live_set scenes 1":
          return "scene2";
        case "live_set tracks 0 clip_slots 0 clip":
          return "clip1";
        case "live_set tracks 0 clip_slots 2 clip":
          return "clip2";
        case "live_set tracks 1 clip_slots 0 clip":
          return "clip3";
        case "live_set view selected_track":
          return "track1";
        case "live_set view selected_scene":
          return "scene1";
        case "live_set view detail_clip":
          return "clip1";
        case "live_set view highlighted_clip_slot":
          return "highlighted_slot";
        default:
          // normally we should return this._id but in this test we mocked out everything
          // and don't want any of the default mocks for clips or tracks to look like they exist:
          return "id 0";
      }
    });

    liveApiPath.mockImplementation(function () {
      switch (this._path) {
        case "live_set view selected_track":
          return "live_set tracks 0"; // Return path of the selected track
        case "live_set view selected_scene":
          return "live_set scenes 0"; // Return path of the selected scene
        case "live_set view highlighted_clip_slot":
          return "live_set tracks 0 clip_slots 0"; // Return path of the highlighted slot
        default:
          return this._path;
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Test Live Set",
        is_playing: 1,
        scale_mode: 1,
        scale_name: "Major",
        root_note: 0,
        scale_intervals: [0, 2, 4, 5, 7, 9, 11],
        signature_numerator: 4,
        signature_denominator: 4,
        tempo: 120,
        tracks: children("track1", "track2", "track3"),
        scenes: children("scene1", "scene2"),
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "MIDI Track 1",
        color: 16711680, // Red
        mute: 0,
        solo: 1,
        arm: 1,
        can_be_armed: 0, // Group track
        is_foldable: 1,
        is_grouped: 0,
        group_track: ["id", 0],
        clip_slots: children("slot1", "slot2", "slot3"),
      },
      "live_set tracks 1": {
        has_midi_input: 0,
        name: "Audio Track 2",
        color: 65280, // Green
        mute: 1,
        solo: 0,
        arm: 0,
        back_to_arranger: 1,
        is_foldable: 0,
        is_grouped: 1,
        group_track: ["id", "track1"],
        clip_slots: children("slot4"),
      },
      "live_set scenes 0": {
        name: "Scene 1",
        color: 16711680, // Red
        is_empty: 0,
        is_triggered: 0,
        tempo: 120,
        tempo_enabled: 1,
        time_signature_numerator: 4,
        time_signature_denominator: 4,
        time_signature_enabled: 1,
      },
      "live_set scenes 1": {
        name: "Scene 2",
        color: 65280, // Green
        is_empty: 1,
        is_triggered: 1,
        tempo: -1,
        tempo_enabled: 0,
        time_signature_numerator: -1,
        time_signature_denominator: -1,
        time_signature_enabled: 0,
      },
    });

    const result = readLiveSet({
      include: [
        "regular-tracks",
        "instruments",
        "rack-chains",
        "scenes",
        "session-clips",
        "arrangement-clips",
        "clip-notes",
      ],
    });

    expect(result).toEqual({
      id: "live_set_id",
      name: "Test Live Set",
      isPlaying: true,
      arrangementFollower: true,
      tempo: 120,
      timeSignature: "4/4",
      scale: "C Major",
      scalePitches: ["C", "D", "E", "F", "G", "A", "B"],
      tracks: [
        {
          id: "track1",
          type: "midi",
          name: "MIDI Track 1",
          trackIndex: 0,
          state: "soloed",
          arrangementFollower: true,
          isGroup: true,
          playingSlotIndex: 2,
          firedSlotIndex: 3,
          arrangementClips: [],
          sessionClips: [
            {
              ...expectedClip({ id: "clip1", trackIndex: 0, sceneIndex: 0 }),
              color: undefined,
            },
            {
              ...expectedClip({ id: "clip2", trackIndex: 0, sceneIndex: 2 }),
              color: undefined,
            },
          ].map(({ color, ...clip }) => clip),
          instruments: null,
        },
        {
          id: "track2",
          type: "audio",
          name: "Audio Track 2",
          trackIndex: 1,
          state: "muted",
          arrangementFollower: false,
          isGroupMember: true,
          groupId: "track1",
          playingSlotIndex: 2,
          firedSlotIndex: 3,
          arrangementClips: [],
          sessionClips: [
            {
              ...expectedClip({ id: "clip3", trackIndex: 1, sceneIndex: 0 }),
              color: undefined,
            },
          ].map(({ color, ...clip }) => clip),
          instruments: null,
        },
        (() => {
          const { color, ...track } = expectedTrack({
            id: "track3",
            trackIndex: 2,
          });
          return track;
        })(),
      ],
      scenes: [
        {
          id: "scene1",
          name: "Scene 1 (1)",
          sceneIndex: 0,
          clipCount: 2,
          tempo: 120,
          timeSignature: "4/4",
        },
        {
          id: "scene2",
          name: "Scene 2 (2)",
          sceneIndex: 1,
          clipCount: 0,
          triggered: true,
        },
      ],
    });

    // Verify expensive Live API calls WERE made due to includeNotes: true
    expect(liveApiCall).toHaveBeenCalledWith(
      "get_notes_extended",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("handles when no tracks or scenes exist", () => {
    liveApiId.mockImplementation(function () {
      if (this.path === "live_set") {
        return "live_set";
      }
      return "id 0"; // All selection objects return non-existent IDs
    });

    liveApiPath.mockImplementation(function () {
      return this._path;
    });

    mockLiveApiGet({
      AppView: {
        focused_document_view: "Arranger",
      },
      LiveSet: {
        name: "Empty Live Set",
        is_playing: 0,
        back_to_arranger: 1,
        scale_mode: 0,
        scale_name: "Minor",
        root_note: 2,
        scale_intervals: [0, 2, 3, 5, 7, 8, 10],
        signature_numerator: 3,
        signature_denominator: 4,
        tempo: 100,
        tracks: [],
        scenes: [],
      },
    });

    const result = readLiveSet({
      include: [
        "regular-tracks",
        "instruments",
        "rack-chains",
        "session-clips",
        "arrangement-clips",
        "clip-notes",
      ],
    });

    expect(result).toEqual({
      id: "live_set",
      name: "Empty Live Set",
      tempo: 100,
      timeSignature: "3/4",
      arrangementFollower: false,
      tracks: [],
      sceneCount: 0,
    });
  });

  it("includes device information across multiple tracks with includeDrumChains", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") return "live_set_id";
      if (this._path === "live_set tracks 0") return "track1";
      if (this._path === "live_set tracks 1") return "track2";
      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Device Test Set",
        tracks: children("track1", "track2"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Synth Track",
        devices: children("synth1", "eq1"),
      },
      "live_set tracks 1": {
        has_midi_input: 0,
        name: "Audio Track",
        devices: children("reverb1"),
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
      eq1: {
        name: "EQ Eight",
        class_name: "Eq8",
        class_display_name: "EQ Eight",
        type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        is_active: 1,
        can_have_chains: 0,
        can_have_drum_pads: 0,
      },
      reverb1: {
        name: "Reverb",
        class_name: "Reverb",
        class_display_name: "Reverb",
        type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        is_active: 1,
        can_have_chains: 0,
        can_have_drum_pads: 0,
      },
    });

    const result = readLiveSet({
      include: [
        "regular-tracks",
        "instruments",
        "rack-chains",
        "drum-chains",
        "audio-effects",
      ],
    });

    // Check that tracks have the expected device configurations
    expect(result.tracks).toEqual([
      expect.objectContaining({
        name: "Synth Track",
        instruments: expect.objectContaining({
          name: "Analog",
          type: DEVICE_TYPE.INSTRUMENT,
        }),
        audioEffects: [
          expect.objectContaining({
            name: "EQ Eight",
            type: DEVICE_TYPE.AUDIO_EFFECT,
          }),
        ],
      }),
      expect.objectContaining({
        name: "Audio Track",
        instruments: null,
        audioEffects: [
          expect.objectContaining({
            name: "Reverb",
            type: DEVICE_TYPE.AUDIO_EFFECT,
          }),
        ],
      }),
    ]);
  });

  it("excludes drum rack devices by default", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") return "live_set_id";
      if (this._path === "live_set tracks 0") return "track1";
      if (this._path === "live_set tracks 0 devices 0") return "drum_rack1";
      if (this._path === "live_set tracks 0 devices 1") return "reverb1";
      if (this._path === "live_set tracks 0 devices 0 drum_pads 36")
        return "kick_pad";
      if (this._path === "live_set tracks 0 devices 0 drum_pads 36 chains 0")
        return "kick_chain";
      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Drum Rack Test Set",
        tracks: children("track1"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Drum Track",
        devices: children("drum_rack1", "reverb1"),
      },
      drum_rack1: {
        name: "My Drums",
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
        note: 36, // C1
        mute: 0,
        solo: 0,
        chains: children("kick_chain"),
      },
      kick_chain: {
        name: "Kick",
        color: 16711680, // Red
        mute: 0,
        solo: 0,
        devices: children("kick_device"),
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
      reverb1: {
        name: "Reverb",
        class_name: "Reverb",
        class_display_name: "Reverb",
        type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        is_active: 1,
        can_have_chains: 0,
        can_have_drum_pads: 0,
      },
    });

    const result = readLiveSet({
      include: [
        "regular-tracks",
        "instruments",
        "rack-chains",
        "audio-effects",
        "session-clips",
        "arrangement-clips",
        "clip-notes",
      ],
    });

    // Check that drum rack devices are included with drumPads but without devices in drumPad chains
    expect(result.tracks[0].instruments).toEqual(
      expect.objectContaining({
        name: "Drum Rack",
        type: DEVICE_TYPE.DRUM_RACK,
        drumPads: expect.any(Array), // Should have drumPads property
      }),
    );
    expect(result.tracks[0].audioEffects).toEqual([
      expect.objectContaining({
        name: "Reverb",
        type: DEVICE_TYPE.AUDIO_EFFECT,
      }),
    ]);
    // Drum rack device should be present with drumPads but drumPad chains should not have devices
    const drumRack = result.tracks[0].instruments;
    expect(drumRack).toBeDefined();
    expect(drumRack.drumPads).toBeDefined();
    // If drumPads exist, they should not have chain property when includeDrumChains=false
    if (drumRack.drumPads && drumRack.drumPads.length > 0) {
      expect(drumRack.drumPads[0].chain).toBeUndefined();
    }
  });

  it("includes routing information in tracks when includeRoutings is true", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") return "live_set_id";
      if (this._path === "live_set tracks 0") return "track1";
      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Routing Test Set",
        tracks: children("track1"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
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
    });

    const result = readLiveSet({
      include: ["regular-tracks", "instruments", "rack-chains", "routings"],
    });

    expect(result.tracks[0]).toEqual(
      expect.objectContaining({
        name: "Test Track",
        inputRoutingChannel: { name: "In 1", inputId: "1" },
        inputRoutingType: { name: "Ext. In", inputId: "17" },
        outputRoutingChannel: { name: "Master", outputId: "26" },
        outputRoutingType: { name: "Track Out", outputId: "25" },
        monitoringState: "auto",
      }),
    );

    // Verify that available routing properties are NOT included (read-live-set doesn't support them)
    expect(result.tracks[0]).not.toHaveProperty(
      "availableInputRoutingChannels",
    );
    expect(result.tracks[0]).not.toHaveProperty("availableInputRoutingTypes");
    expect(result.tracks[0]).not.toHaveProperty(
      "availableOutputRoutingChannels",
    );
    expect(result.tracks[0]).not.toHaveProperty("availableOutputRoutingTypes");
  });

  it("excludes routing information from tracks when includeRoutings is false", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") return "live_set_id";
      if (this._path === "live_set tracks 0") return "track1";
      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Routing Test Set",
        tracks: children("track1"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
      },
    });

    const result = readLiveSet({
      include: ["regular-tracks", "instruments", "rack-chains"],
    });

    expect(result.tracks[0]).toEqual(
      expect.objectContaining({
        name: "Test Track",
      }),
    );
    // Verify routing properties are not present
    expect(result.tracks[0].availableInputRoutingChannels).toBeUndefined();
    expect(result.tracks[0].availableInputRoutingTypes).toBeUndefined();
    expect(result.tracks[0].availableOutputRoutingChannels).toBeUndefined();
    expect(result.tracks[0].availableOutputRoutingTypes).toBeUndefined();
    expect(result.tracks[0].inputRoutingChannel).toBeUndefined();
    expect(result.tracks[0].inputRoutingType).toBeUndefined();
    expect(result.tracks[0].outputRoutingChannel).toBeUndefined();
    expect(result.tracks[0].outputRoutingType).toBeUndefined();
    expect(result.tracks[0].monitoringState).toBeUndefined();
  });

  it("passes clip loading parameters to readTrack", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 clip_slots 0 clip": // Path-based access
          return "clip1";
        case "id slot1 clip": // Direct access to slot1's clip
          return "clip1";
        case "clip1":
          return "clip1";
        case "id clip1":
          return "clip1";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Clip Test Set",
        tracks: children("track1"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: children("slot1"),
        arrangement_clips: children("arr_clip1"),
        devices: [],
      },
      "id slot1": {
        clip: ["id", "clip1"],
      },
    });

    // Test with minimal clip loading (no session-clips or arrangement-clips in include)
    const result = readLiveSet({
      include: ["regular-tracks", "instruments", "rack-chains"],
    });

    // When session-clips and arrangement-clips are not in include, we get counts instead of arrays
    expect(result.tracks[0].sessionClipCount).toBe(1);
    expect(result.tracks[0].arrangementClipCount).toBe(1);
  });

  it("uses default parameter values when no arguments provided", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 clip_slots 0 clip": // Path-based access
          return "clip1";
        case "id slot1 clip":
          return "clip1";
        case "clip1":
          return "clip1";
        case "id clip1":
          return "clip1";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Default Test Set",
        tracks: children("track1"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: children("slot1"),
        arrangement_clips: children("arr_clip1"),
        devices: [],
      },
      "id slot1": {
        clip: ["id", "clip1"],
      },
    });

    // Call readLiveSet with no arguments to test defaults
    const result = readLiveSet();

    // Verify default behavior: clip counts only (defaults have session-clips and arrangement-clips false)
    expect(result.tracks[0].sessionClipCount).toBe(1);
    expect(result.tracks[0].arrangementClipCount).toBe(1);

    // Verify expensive Live API calls were not made due to default minimal behavior
    expect(liveApiCall).not.toHaveBeenCalledWith("get_notes_extended");
  });

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
        "drum-chains",
        "clip-notes",
        "rack-chains",
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
        instruments: expect.any(Object),
        inputRoutingChannel: expect.any(Object),
        sessionClips: expect.any(Array),
        arrangementClips: expect.any(Array),
        color: expect.any(String),
      }),
    );
  });

  it("returns sceneCount when includeScenes is false", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Scene Count Test Set",
        is_playing: 0,
        back_to_arranger: 1,
        scale_mode: 0,
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        tracks: children("track1"),
        scenes: children("scene9", "scene10", "scene11"),
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: children(),
        arrangement_clips: children(),
        devices: [],
      },
    });

    // Call with default include (which doesn't include "scenes")
    const result = readLiveSet();

    // Verify that sceneCount is returned instead of scenes array
    expect(result.sceneCount).toBe(3);
    expect(result.scenes).toBeUndefined();
  });

  it("returns minimal data when include is an empty array", () => {
    liveApiPath.mockImplementation(function () {
      return this._path;
    });
    liveApiId.mockImplementation(function () {
      return this._id ?? "test_id";
    });

    mockLiveApiGet({
      live_set: {
        tracks: children(),
        return_tracks: children(),
        scenes: children(),
        name: "Test Set",
        is_playing: 0,
        back_to_arranger: 0,
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        scale_mode: 0,
      },
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "get_version_string") {
        return "12.2";
      }
      return null;
    });

    const result = readLiveSet({ include: [] });

    // Should have basic song properties
    expect(result).toEqual(
      expect.objectContaining({
        id: "live_set",
        name: "Test Set",
        arrangementFollower: true,
        tempo: 120,
        timeSignature: "4/4",
        sceneCount: 0, // No scenes exist in the Live Set
      }),
    );

    // Should NOT include any of the optional properties
    expect(result).not.toHaveProperty("tracks");
    expect(result).not.toHaveProperty("returnTracks");
    expect(result).not.toHaveProperty("masterTrack");
    expect(result).not.toHaveProperty("scenes");
  });

  it("uses drum-maps by default and strips chains", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set":
          return "live_set";
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
        case "live_app":
          return "live_app";
        default:
          return this._id;
      }
    });

    mockLiveApiGet({
      live_set: {
        name: "Test Song",
        tracks: children("track1"),
        return_tracks: [],
        scenes: [],
        back_to_arranger: 0,
        tempo: 120,
        time_signature_numerator: 4,
        time_signature_denominator: 4,
        scale_mode: 0, // Scale disabled
      },
      track1: {
        has_midi_input: 1,
        name: "Drums",
        color: 16711680,
        back_to_arranger: 0,
        devices: children("drumrack1"),
        clip_slots: [],
        arrangement_clips: [],
        can_be_armed: 1,
        arm: 0,
        is_foldable: 0,
        is_grouped: 0,
        group_track: ["id", "0"],
        mute: 0,
        solo: 0,
        muted_via_solo: 0,
        playing_slot_index: -1,
        fired_slot_index: -1,
      },
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
      live_app: {
        version_string: "12.2.5",
      },
    });

    // Call with NO arguments - should use defaults (including drum-maps)
    const result = readLiveSet();

    // Should have drumMap on the track
    expect(result.tracks[0].drumMap).toEqual({
      C3: "Test Kick",
    });

    // Should have instrument but NO chains (proving drum-maps is default, not rack-chains)
    expect(result.tracks[0].instruments).toEqual({
      id: "drumrack1",
      name: "Drum Rack",
      displayName: "Test Drum Rack",
      type: DEVICE_TYPE.DRUM_RACK,
      drumPads: [
        {
          name: "Test Kick",
          note: 60,
        },
      ],
    });

    // Critical: chains should be stripped due to drum-maps default
    expect(result.tracks[0].instruments.chains).toBeUndefined();
  });

  it("omits name property when Live Set name is empty string", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") return "live_set";
      return "id 0";
    });

    mockLiveApiGet({
      LiveSet: {
        name: "", // Empty name
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        back_to_arranger: 1,
        is_playing: 0,
        tracks: [],
        scenes: [],
      },
    });

    const result = readLiveSet();

    expect(result.name).toBeUndefined();
    expect(result).not.toHaveProperty("name");
  });
});
