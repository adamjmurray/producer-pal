// src/tools/read-song.test.js
import { describe, expect, it } from "vitest";
import {
  children,
  expectedClip,
  expectedTrack,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "../mock-live-api";
import { readSong } from "./read-song";
import {
  DEVICE_TYPE,
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "./read-track";

describe("readSong", () => {
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

    const result = readSong({ includeEmptyScenes: true });

    expect(result).toEqual({
      id: "live_set_id",
      abletonLiveVersion: "12.2",
      view: "session",
      name: "Test Live Set",
      isPlaying: true,
      followsArrangement: true,
      tempo: 120,
      timeSignature: "4/4",
      scaleEnabled: true,
      scale: "Major",
      scaleRoot: "C",
      scaleIntervals: [0, 2, 4, 5, 7, 9, 11],
      selectedTrackIndex: 0,
      selectedSceneIndex: 0,
      selectedClipId: "clip1",
      highlightedClipSlot: null, // TODO: Fix this test mock
      tracks: [
        {
          id: "track1",
          type: "midi",
          name: "MIDI Track 1",
          trackIndex: 0,
          color: "#FF0000",
          state: "soloed",
          isArmed: true,
          followsArrangement: true,
          isGroup: true,
          isGroupMember: false,
          groupId: null,
          playingSlotIndex: 2,
          firedSlotIndex: 3,
          drumMap: null,
          arrangementClips: [],
          sessionClips: [
            expectedClip({ id: "clip1", trackIndex: 0, clipSlotIndex: 0 }),
            expectedClip({ id: "clip2", trackIndex: 0, clipSlotIndex: 2 }),
          ],
          devices: [],
          hasInstrument: false,
        },
        {
          id: "track2",
          type: "audio",
          name: "Audio Track 2",
          trackIndex: 1,
          color: "#00FF00",
          state: "muted",
          isArmed: false,
          isGroup: false,
          followsArrangement: false,
          isGroupMember: true,
          groupId: "track1",
          playingSlotIndex: 2,
          firedSlotIndex: 3,
          drumMap: null,
          arrangementClips: [],
          sessionClips: [
            expectedClip({ id: "clip3", trackIndex: 1, clipSlotIndex: 0 }),
          ],
          devices: [],
        },
        expectedTrack({ id: "track3", trackIndex: 2 }),
      ],
      scenes: [
        {
          id: "scene1",
          name: "Scene 1",
          sceneIndex: 0,
          color: "#FF0000",
          isEmpty: false,
          isTriggered: false,
          tempo: 120,
          timeSignature: "4/4",
        },
        {
          id: "scene2",
          name: "Scene 2",
          sceneIndex: 1,
          color: "#00FF00",
          isEmpty: true,
          isTriggered: true,
          tempo: "disabled",
          timeSignature: "disabled",
        },
      ],
    });
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

    const result = readSong({ includeEmptyScenes: true });

    expect(result).toEqual({
      id: "live_set",
      abletonLiveVersion: "12.2",
      view: "arrangement",
      name: "Empty Live Set",
      tempo: 100,
      timeSignature: "3/4",
      isPlaying: false,
      followsArrangement: false,
      scaleEnabled: false,
      selectedTrackIndex: null,
      selectedSceneIndex: null,
      selectedClipId: null,
      highlightedClipSlot: null,
      tracks: [],
      scenes: [],
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

    const result = readSong({ includeDrumChains: true });

    // Check that tracks have the expected device configurations
    expect(result.tracks).toEqual([
      expect.objectContaining({
        name: "Synth Track",
        devices: [
          expect.objectContaining({
            name: "Analog",
            type: DEVICE_TYPE.INSTRUMENT,
          }),
          expect.objectContaining({
            name: "EQ Eight",
            type: DEVICE_TYPE.AUDIO_EFFECT,
          }),
        ],
      }),
      expect.objectContaining({
        name: "Audio Track",
        devices: [
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

    const result = readSong({ includeEmptyScenes: true }); // Default behavior

    // Check that drum rack devices are included with drumPads but without devices in drumPad chains
    expect(result.tracks[0].devices).toEqual([
      expect.objectContaining({
        name: "Drum Rack",
        type: DEVICE_TYPE.DRUM_RACK,
        drumPads: expect.any(Array), // Should have drumPads property
      }),
      expect.objectContaining({
        name: "Reverb",
        type: DEVICE_TYPE.AUDIO_EFFECT,
      }),
    ]);
    // Drum rack device should be present with drumPads but drumPad chains should not have devices
    const drumRack = result.tracks[0].devices.find(
      (d) => d.type === DEVICE_TYPE.DRUM_RACK,
    );
    expect(drumRack).toBeDefined();
    expect(drumRack.drumPads).toBeDefined();
    // If drumPads exist, they should not have chain property when includeDrumChains=false
    if (drumRack.drumPads && drumRack.drumPads.length > 0) {
      expect(drumRack.drumPads[0].chain).toBeUndefined();
    }
  });
});
