import { describe, expect, it } from "vitest";
import { VERSION } from "../../../shared/version.js";
import {
  children,
  expectedClip,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "../../../test/mock-live-api.js";
import { mockTrackProperties } from "./helpers/read-track-test-helpers.js";
import { readTrack } from "./read-track.js";

describe("readTrack", () => {
  it("returns null values when the track does not exist", () => {
    liveApiId.mockReturnValue("id 0");

    const result = readTrack({ trackIndex: 99 });

    expect(result).toEqual({
      id: null,
      type: null,
      name: null,
      trackIndex: 99,
    });
  });

  it("returns track information for MIDI tracks", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 0":
          return "track1";
        default:
          // make default mocks appear to not exist:
          return "id 0";
      }
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Track 1",
        color: 16711680, // Red
        mute: 0,
        solo: 1,
        arm: 1,
        can_be_armed: 1,
        playing_slot_index: 2,
        fired_slot_index: 3,
        clip_slots: children("slot1", "slot2"),
        devices: [],
      },
    });

    const result = readTrack({ trackIndex: 0 });

    expect(result).toEqual({
      id: "track1",
      type: "midi",
      name: "Track 1",
      trackIndex: 0,
      state: "soloed",
      isArmed: true,
      arrangementFollower: true,
      playingSlotIndex: 2,
      firedSlotIndex: 3,
      arrangementClips: [],
      sessionClips: [],
      instrument: null,
    });
  });

  it("returns track information for audio tracks", () => {
    liveApiId.mockReturnValue("track2");
    mockLiveApiGet({
      Track: {
        has_midi_input: 0,
        name: "Audio Track",
        color: 65280, // Green
        mute: 1,
        solo: 0,
        arm: 0,
        playing_slot_index: -1,
        fired_slot_index: -1,
        clip_slots: [],
        devices: [],
      },
    });

    const result = readTrack({ trackIndex: 1 });

    expect(result).toEqual({
      id: "track2",
      type: "audio",
      name: "Audio Track",
      trackIndex: 1,
      state: "muted",
      arrangementFollower: true,
      arrangementClips: [],
      sessionClips: [],
      instrument: null,
    });
  });

  it("returns track group information", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 0":
          return "track1";
        default:
          // make default mocks appear to not exist:
          return "id 0";
      }
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Track 1",
        color: 16711680, // Red
        mute: 0,
        solo: 1,
        arm: 1,
        can_be_armed: 0, // Group tracks can't be armed
        is_foldable: 1,
        is_grouped: 1,
        group_track: ["id", 456],
        playing_slot_index: 2,
        fired_slot_index: 3,
        clip_slots: children("slot1", "slot2"),
        devices: [],
      },
    });

    const result = readTrack({ trackIndex: 0 });

    expect(result).toEqual({
      id: "track1",
      type: "midi",
      name: "Track 1",
      trackIndex: 0,
      state: "soloed",
      arrangementFollower: true,
      isGroup: true,
      isGroupMember: true,
      groupId: "456",
      playingSlotIndex: 2,
      firedSlotIndex: 3,
      arrangementClips: [],
      sessionClips: [],
      instrument: null,
    });
  });

  it("should detect Producer Pal host track", () => {
    liveApiPath.mockImplementation(function () {
      if (this._path === "this_device") {
        return "live_set tracks 1 devices 0";
      }
      return this._path;
    });

    liveApiId.mockReturnValue("track1");
    mockLiveApiGet({
      Track: mockTrackProperties(),
    });

    const result = readTrack({ trackIndex: 1 });
    expect(result.hasProducerPalDevice).toBe(true);
    expect(result.producerPalVersion).toBe(VERSION);

    const result2 = readTrack({ trackIndex: 0 });
    expect(result2.hasProducerPalDevice).toBeUndefined();
    expect(result2.producerPalVersion).toBeUndefined();
  });

  it("should omit instrument property when null for Producer Pal host track", () => {
    liveApiPath.mockImplementation(function () {
      if (this._path === "this_device") {
        return "live_set tracks 1 devices 0";
      }
      return this._path;
    });

    liveApiId.mockReturnValue("track1");
    mockLiveApiGet({
      Track: mockTrackProperties({
        devices: [], // No devices means instrument will be null
      }),
    });

    // Producer Pal host track with null instrument - should omit the property
    const hostResult = readTrack({ trackIndex: 1 });
    expect(hostResult.hasProducerPalDevice).toBe(true);
    expect(hostResult).not.toHaveProperty("instrument");

    // Regular track with null instrument - should include the property
    const regularResult = readTrack({ trackIndex: 0 });
    expect(regularResult.hasProducerPalDevice).toBeUndefined();
    expect(regularResult).toHaveProperty("instrument");
    expect(regularResult.instrument).toBe(null);
  });

  it("returns sessionClips information when the track has clips in Session view", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 2":
          return "track3";
        case "live_set tracks 2 clip_slots 0 clip":
          return "clip1";
        case "live_set tracks 2 clip_slots 2 clip":
          return "clip2";
        default:
          // make default mocks appear to not exist:
          return "id 0";
      }
    });

    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Track with Clips",
        color: 255, // Blue
        mute: 0,
        solo: 0,
        arm: 0,
        playing_slot_index: 0,
        fired_slot_index: -1,
        back_to_arranger: 1,
        clip_slots: children("slot1", "slot2", "slot3"),
        devices: [],
      },
    });

    const result = readTrack({ trackIndex: 2 });

    expect(result).toEqual({
      id: "track3",
      type: "midi",
      name: "Track with Clips",
      trackIndex: 2,
      arrangementFollower: false,
      playingSlotIndex: 0,
      arrangementClips: [],
      sessionClips: [
        {
          ...expectedClip({ id: "clip1", trackIndex: 2, sceneIndex: 0 }),
          color: undefined,
        },
        {
          ...expectedClip({ id: "clip2", trackIndex: 2, sceneIndex: 2 }),
          color: undefined,
        },
      ].map(({ color: _color, ...clip }) => clip),
      instrument: null,
    });
  });

  it("returns arrangementClips when the track has clips in Arrangement view", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 2":
          return "track3";
        case "id arr_clip1":
        case "id arr_clip2":
          return this._path.substring(3);
        default:
          // make default mocks appear to not exist:
          return "id 0";
      }
    });

    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "arr_clip1":
          return "live_set tracks 2 arrangement_clips 0";
        case "arr_clip2":
          return "live_set tracks 2 arrangement_clips 1";
        default:
          return this._path;
      }
    });

    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Track with Arrangement Clips",
        color: 255,
        clip_slots: children("slot1", "slot2", "slot3"),
        arrangement_clips: children("arr_clip1", "arr_clip2"),
        devices: [],
      },
      arr_clip1: {
        is_arrangement_clip: 1,
      },
      arr_clip2: {
        is_arrangement_clip: 1,
      },
    });

    const result = readTrack({ trackIndex: 2 });

    expect(result.arrangementClips.length).toBe(2);
    expect(result.arrangementClips[0].id).toBe("arr_clip1");
    expect(result.arrangementClips[1].id).toBe("arr_clip2");
  });

  it("returns session clip count when includeSessionClips is false", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 2":
          return "track3";
        case "live_set tracks 2 clip_slots 0 clip": // Path-based access for slot 0
          return "clip1";
        case "live_set tracks 2 clip_slots 1 clip": // Path-based access for slot 1 (empty)
          return "id 0";
        case "live_set tracks 2 clip_slots 2 clip": // Path-based access for slot 2
          return "clip2";
        case "id slot1 clip": // Direct access to slot1's clip
          return "clip1";
        case "id slot3 clip": // Direct access to slot3's clip
          return "clip2";
        case "clip1":
          return "clip1";
        case "clip2":
          return "clip2";
        case "id clip1":
          return "clip1";
        case "id clip2":
          return "clip2";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Track with Clips",
        color: 255,
        mute: 0,
        solo: 0,
        arm: 0,
        playing_slot_index: 0,
        fired_slot_index: -1,
        back_to_arranger: 1,
        clip_slots: children("slot1", "slot2", "slot3"),
        devices: [],
      },
      "id slot1": {
        clip: ["id", "clip1"],
      },
      "id slot2": {
        clip: ["id", 0],
      },
      "id slot3": {
        clip: ["id", "clip2"],
      },
    });

    const result = readTrack({
      trackIndex: 2,
      include: ["clip-notes", "chains", "instruments"],
    });

    // Since clips exist at slots 0 and 2, we should get a count of 2
    expect(result.sessionClipCount).toBe(2);
  });

  it("returns arrangement clip count when includeArrangementClips is false", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 2":
          return "track3";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Track with Arrangement Clips",
        color: 255,
        clip_slots: [],
        arrangement_clips: children("arr_clip1", "arr_clip2"),
        devices: [],
      },
    });

    const result = readTrack({
      trackIndex: 2,
      include: ["clip-notes", "chains", "instruments"],
    });

    expect(result.arrangementClipCount).toBe(2);
  });

  it("returns arrangement clip count when includeArrangementClips is false (additional test)", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 1":
          return "track2";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Arrangement ID Test Track",
        color: 255,
        clip_slots: [],
        arrangement_clips: children("arr_clip3", "arr_clip4", "arr_clip5"),
        devices: [],
      },
    });

    // Call with includeArrangementClips explicitly false to get count
    const result = readTrack({
      trackIndex: 1,
      include: ["clip-notes", "chains", "instruments"], // excludes "arrangement-clips"
    });

    // Verify that we get a count instead of clip details
    expect(result.arrangementClipCount).toBe(3);

    // Verify consistency with track ID format
    expect(result.id).toBe("track2");
  });
});
