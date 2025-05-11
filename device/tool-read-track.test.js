// device/tool-read-track.test.js
import { describe, it, expect } from "vitest";
import { liveApiId, mockLiveApiGet, children } from "./mock-live-api";
import { readTrack, DEVICE_TYPE_INSTRUMENT } from "./tool-read-track";

describe("readTrack", () => {
  it("returns error when track does not exist", () => {
    liveApiId.mockReturnValue("id 0");

    const result = readTrack({ trackIndex: 5 });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Track at index 5 does not exist");
  });

  it("returns basic MIDI track information", () => {
    mockLiveApiGet({
      "live_set tracks 0": {
        id: "track1",
        name: "MIDI Track",
        color: 16711680, // Red
        has_midi_input: 1,
        has_audio_input: 0,
        has_audio_output: 1,
        has_midi_output: 1,
        mute: 0,
        solo: 0,
        arm: 1,
        is_foldable: 0,
        is_grouped: 0,
        fold_state: 0,
        is_visible: 1,
        can_be_armed: 1,
        can_be_frozen: 1,
        can_show_chains: 0,
        is_showing_chains: 0,
        is_frozen: 0,
        muted_via_solo: 0,
        back_to_arranger: 0,
        playing_slot_index: -1,
        fired_slot_index: -1,
        devices: [],
        clip_slots: [],
      },
    });
    liveApiId.mockReturnValue("track1");

    const result = readTrack({ trackIndex: 0 });

    expect(result).toEqual({
      success: true,
      trackIndex: 0,
      id: "track1",
      name: "MIDI Track",
      color: "#FF0000",
      type: "midi",
      isMuted: false,
      isSoloed: false,
      isArmed: true,
      isGroup: false,
      isGrouped: false,
      isFolded: false,
      isVisible: true,
      canBeArmed: true,
      canBeFrozen: true,
      canShowChains: false,
      isShowingChains: false,
      isFrozen: false,
      mutedViaSolo: false,
      backToArranger: false,
      hasAudioInput: false,
      hasAudioOutput: true,
      hasMidiInput: true,
      hasMidiOutput: true,
      playingSlotIndex: -1,
      firedSlotIndex: -1,
      isPlaying: false,
      isTriggered: false,
      drumPads: null,
      clips: [],
    });
  });

  it("returns audio track information", () => {
    mockLiveApiGet({
      "live_set tracks 1": {
        name: "Audio Track",
        color: 65280, // Green
        has_midi_input: 0,
        has_audio_input: 1,
        mute: 1,
        solo: 1,
        arm: 0,
        playing_slot_index: 2,
        fired_slot_index: 3,
        devices: [],
        clip_slots: [],
      },
    });

    const result = readTrack({ trackIndex: 1 });

    expect(result.type).toBe("audio");
    expect(result.hasAudioInput).toBe(true);
    expect(result.hasMidiInput).toBe(false);
    expect(result.isMuted).toBe(true);
    expect(result.isSoloed).toBe(true);
    expect(result.playingSlotIndex).toBe(2);
    expect(result.firedSlotIndex).toBe(3);
    expect(result.isPlaying).toBe(true);
    expect(result.isTriggered).toBe(true);
  });

  it("returns group track information", () => {
    mockLiveApiGet({
      "live_set tracks 2": {
        name: "Group Track",
        color: 255, // Blue
        has_midi_input: 1,
        is_foldable: 1,
        is_grouped: 0,
        fold_state: 1,
        is_visible: 1,
        devices: [],
        clip_slots: [],
      },
    });

    const result = readTrack({ trackIndex: 2 });

    expect(result.isGroup).toBe(true);
    expect(result.isFolded).toBe(true);
    expect(result.isGrouped).toBe(false);
  });

  it("returns track with clips", () => {
    mockLiveApiGet({
      "live_set tracks 3": {
        name: "Track with Clips",
        has_midi_input: 1,
        devices: [],
        clip_slots: children("slot1", "slot2", "slot3"),
      },
      slot1: { has_clip: 1 },
      slot2: { has_clip: 0 },
      slot3: { has_clip: 1 },
      "live_set tracks 3 clip_slots 0 clip": {
        name: "Clip 1",
        is_midi_clip: 1,
        color: 16711680,
        length: 4,
        looping: 0,
        start_marker: 0,
        end_marker: 4,
        loop_start: 0,
        loop_end: 4,
        is_playing: 0,
      },
      "live_set tracks 3 clip_slots 2 clip": {
        name: "Clip 2",
        is_midi_clip: 1,
        color: 65280,
        length: 8,
        looping: 1,
        start_marker: 0,
        end_marker: 8,
        loop_start: 0,
        loop_end: 8,
        is_playing: 1,
      },
    });

    const result = readTrack({ trackIndex: 3 });

    expect(result.clips).toHaveLength(2);
    expect(result.clips[0]).toEqual(
      expect.objectContaining({
        name: "Clip 1",
        type: "midi",
        trackIndex: 3,
        clipSlotIndex: 0,
        length: 4,
        loop: false,
      })
    );
    expect(result.clips[1]).toEqual(
      expect.objectContaining({
        name: "Clip 2",
        type: "midi",
        trackIndex: 3,
        clipSlotIndex: 2,
        length: 8,
        loop: true,
      })
    );
    expect(result.clips).toEqual([
      {
        id: "1",
        type: "midi",
        name: "Clip 1",
        location: "session",
        clipSlotIndex: 0,
        trackIndex: 3,
        color: "#FF0000",
        length: 4,
        start_marker: 0,
        end_marker: 4,
        loop_start: 0,
        loop_end: 4,
        loop: false,
        is_playing: false,
        notes: "",
        noteCount: 0,
      },
      {
        id: "1",
        type: "midi",
        name: "Clip 2",
        location: "session",
        trackIndex: 3,
        clipSlotIndex: 2,
        color: "#00FF00",
        length: 8,
        start_marker: 0,
        end_marker: 8,
        loop_start: 0,
        loop_end: 8,
        loop: true,
        is_playing: true,
        notes: "",
        noteCount: 0,
      },
    ]);
  });

  it("returns track with drum pads when drum rack is present", () => {
    mockLiveApiGet({
      "live_set tracks 3": {
        name: "Drum Track",
        devices: children("device1"),
        clip_slots: [],
      },
      device1: {
        type: DEVICE_TYPE_INSTRUMENT,
        can_have_drum_pads: 1,
        drum_pads: children("pad1", "pad2"),
      },
      pad1: {
        note: 36,
        name: "Kick",
        chains: children("chain1"),
      },
      pad2: {
        note: 38,
        name: "Snare",
        chains: children("chain2"),
      },
    });

    const result = readTrack({ trackIndex: 3 });

    expect(result.drumPads).toEqual([
      { pitch: "C1", name: "Kick" },
      { pitch: "D1", name: "Snare" },
    ]);
  });

  it("returns null drum pads when device is not a drum rack", () => {
    mockLiveApiGet({
      "live_set tracks 4": {
        devices: children("device1"),
        clip_slots: [],
      },
      device1: {
        type: DEVICE_TYPE_INSTRUMENT,
        can_have_drum_pads: 0,
      },
    });

    const result = readTrack({ trackIndex: 4 });

    expect(result.drumPads).toBeNull();
  });

  it("returns null drum pads when track has no devices", () => {
    mockLiveApiGet({
      "live_set tracks 5": {
        devices: [],
        clip_slots: [],
      },
    });

    const result = readTrack({ trackIndex: 5 });

    expect(result.drumPads).toBeNull();
  });

  it("only includes drum pads with chains", () => {
    mockLiveApiGet({
      "live_set tracks 6": {
        devices: children("device1"),
        clip_slots: [],
      },
      device1: {
        type: DEVICE_TYPE_INSTRUMENT,
        can_have_drum_pads: 1,
        drum_pads: children("pad1", "pad2", "pad3"),
      },
      pad1: {
        note: 36,
        name: "Kick",
        chains: children("chain1"),
      },
      pad2: {
        note: 38,
        name: "Snare",
        chains: [], // No chains
      },
      pad3: {
        note: 42,
        name: "HiHat",
        chains: children("chain3"),
      },
    });

    const result = readTrack({ trackIndex: 6 });

    expect(result.drumPads).toEqual([
      { pitch: "C1", name: "Kick" },
      { pitch: "Gb1", name: "HiHat" },
    ]);
  });
});
