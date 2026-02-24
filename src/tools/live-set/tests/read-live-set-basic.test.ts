// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { children, expectedTrack } from "#src/test/mocks/mock-live-api.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { setupLiveSetPathMappedMocks } from "./read-live-set-path-mapped-test-helpers.ts";

const SYNTH_DEVICE = {
  name: "Analog",
  class_name: "UltraAnalog",
  class_display_name: "Analog",
  type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
  is_active: 1,
  can_have_chains: 0,
  can_have_drum_pads: 0,
};

const REVERB_DEVICE = {
  name: "Reverb",
  class_name: "Reverb",
  class_display_name: "Reverb",
  type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  is_active: 1,
  can_have_chains: 0,
  can_have_drum_pads: 0,
};

describe("readLiveSet - basic reading", () => {
  it("returns live set information with tracks and scenes", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
        [String(livePath.track(1))]: "track2",
        [String(livePath.track(2))]: "track3",
        [livePath.scene(0)]: "scene1",
        [livePath.scene(1)]: "scene2",
        [livePath.scene(2)]: "scene3",
        [livePath.track(0).clipSlot(0).clip()]: "clip1",
        [livePath.track(0).clipSlot(2).clip()]: "clip2",
        [livePath.track(1).clipSlot(0).clip()]: "clip3",
        [String(livePath.masterTrack())]: "master1",
      },
      objects: {
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
          return_tracks: children(),
          scenes: children("scene1", "scene2", "scene3"),
        },
        [String(livePath.track(0))]: {
          has_midi_input: 1,
          name: "MIDI Track 1",
          color: 16711680,
          mute: 0,
          solo: 1,
          arm: 1,
          can_be_armed: 0, // Group track
          is_foldable: 1,
          is_grouped: 0,
          group_track: ["id", 0],
          clip_slots: children("slot1", "slot2", "slot3"),
          devices: [],
        },
        [String(livePath.track(1))]: {
          has_midi_input: 0,
          name: "Audio Track 2",
          color: 65280,
          mute: 1,
          solo: 0,
          arm: 0,
          back_to_arranger: 1,
          is_foldable: 0,
          is_grouped: 1,
          group_track: ["id", "track1"],
          clip_slots: children("slot4"),
        },
        [livePath.scene(0)]: {
          name: "Scene 1",
          color: 16711680,
          is_empty: 0,
          is_triggered: 0,
          tempo: 120,
          tempo_enabled: 1,
          time_signature_numerator: 4,
          time_signature_denominator: 4,
          time_signature_enabled: 1,
        },
        [livePath.scene(1)]: {
          name: "Scene 2",
          color: 65280,
          is_empty: 1,
          is_triggered: 1,
          tempo: -1,
          tempo_enabled: 0,
          time_signature_numerator: -1,
          time_signature_denominator: -1,
          time_signature_enabled: 0,
        },
        [livePath.scene(2)]: {
          name: "Scene 3",
          color: 255,
          is_empty: 0,
          is_triggered: 0,
          tempo: 120,
          tempo_enabled: 1,
          time_signature_numerator: 4,
          time_signature_denominator: 4,
          time_signature_enabled: 1,
        },
        [String(livePath.masterTrack())]: {
          has_midi_input: 0,
          name: "Master",
          clip_slots: children(),
          arrangement_clips: children(),
          devices: [],
        },
      },
    });

    const result = readLiveSet({
      include: ["tracks", "scenes"],
    });

    expect(result).toStrictEqual({
      name: "Test Live Set",
      isPlaying: true,
      tempo: 120,
      timeSignature: "4/4",
      scale: "C Major",
      scalePitches: "C,D,E,F,G,A,B",
      returnTracks: [],
      masterTrack: expect.objectContaining({
        id: "master1",
        type: "master",
        name: "Master",
        deviceCount: 0,
      }),
      tracks: [
        {
          id: "track1",
          type: "midi",
          name: "MIDI Track 1",
          trackIndex: 0,
          state: "soloed",
          isGroup: true,
          playingSlotIndex: 2,
          firedSlotIndex: 3,
          sessionClipCount: 2,
          arrangementClipCount: 0,
          deviceCount: 0,
        },
        {
          id: "track2",
          type: "audio",
          name: "Audio Track 2",
          trackIndex: 1,
          state: "muted",
          isGroupMember: true,
          groupId: "track1",
          playingSlotIndex: 2,
          firedSlotIndex: 3,
          sessionClipCount: 1,
          arrangementClipCount: 0,
          deviceCount: 0,
        },
        (() => {
          const { color: _color, ...track } = expectedTrack({
            id: "track3",
            trackIndex: 2,
          });

          return track;
        })(),
      ],
      scenes: [
        {
          id: "scene1",
          name: "Scene 1",
          sceneIndex: 0,
          clipCount: 2,
          tempo: 120,
          timeSignature: "4/4",
        },
        {
          id: "scene2",
          name: "Scene 2",
          sceneIndex: 1,
          clipCount: 0,
          triggered: true,
        },
        {
          id: "scene3",
          name: "Scene 3",
          sceneIndex: 2,
          clipCount: 1,
          tempo: 120,
          timeSignature: "4/4",
        },
      ],
    });
  });

  it("handles when no tracks or scenes exist", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set",
      pathIdMap: {
        [String(livePath.masterTrack())]: "master1",
      },
      objects: {
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
          return_tracks: children(),
          scenes: [],
        },
        [String(livePath.masterTrack())]: {
          has_midi_input: 0,
          name: "Master",
          clip_slots: children(),
          arrangement_clips: children(),
          devices: [],
        },
      },
    });

    const result = readLiveSet({
      include: ["tracks"],
    });

    expect(result).toStrictEqual({
      name: "Empty Live Set",
      tempo: 100,
      timeSignature: "3/4",
      tracks: [],
      returnTracks: [],
      masterTrack: expect.objectContaining({
        id: "master1",
        type: "master",
        name: "Master",
        deviceCount: 0,
      }),
      sceneCount: 0,
    });
  });

  it("includes instrument name on tracks with instruments", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
        [String(livePath.track(1))]: "track2",
        [String(livePath.masterTrack())]: "master1",
      },
      objects: {
        LiveSet: {
          name: "Device Test Set",
          tracks: children("track1", "track2"),
          return_tracks: children(),
          scenes: [],
        },
        [String(livePath.masterTrack())]: {
          has_midi_input: 0,
          name: "Master",
          devices: [],
        },
        [String(livePath.track(0))]: {
          has_midi_input: 1,
          name: "Synth Track",
          devices: children("synth1", "reverb1"),
        },
        [String(livePath.track(1))]: {
          has_midi_input: 0,
          name: "Audio Track",
          devices: children("reverb2"),
        },
        synth1: SYNTH_DEVICE,
        reverb1: REVERB_DEVICE,
        reverb2: REVERB_DEVICE,
      },
    });

    const result = readLiveSet({
      include: ["tracks"],
    });

    const tracks = result.tracks as Record<string, unknown>[];

    // Track with instrument shows instrument name as string
    expect(tracks[0]).toStrictEqual(
      expect.objectContaining({
        name: "Synth Track",
        instrument: "Analog",
      }),
    );

    // Track without instrument omits instrument field
    expect(tracks[1]).toStrictEqual(
      expect.objectContaining({
        name: "Audio Track",
      }),
    );
    expect(tracks[1]).not.toHaveProperty("instrument");
  });
});
