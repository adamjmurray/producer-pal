// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  children,
  expectedClip,
  expectedTrack,
} from "#src/test/mocks/mock-live-api.ts";
import { lookupMockObject } from "#src/test/mocks/mock-registry.ts";
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

const EQ_DEVICE = {
  name: "EQ Eight",
  class_name: "Eq8",
  class_display_name: "EQ Eight",
  type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
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

const SIMPLER_DEVICE = {
  name: "Simpler",
  class_name: "Simpler",
  class_display_name: "Simpler",
  type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
  is_active: 1,
  can_have_chains: 0,
  can_have_drum_pads: 0,
};

describe("readLiveSet - basic reading", () => {
  it("returns live set information including tracks and scenes", () => {
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
          scenes: children("scene1", "scene2", "scene3"),
        },
        [String(livePath.track(0))]: {
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
        [String(livePath.track(1))]: {
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
        [livePath.scene(0)]: {
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
        [livePath.scene(1)]: {
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
        [livePath.scene(2)]: {
          name: "Scene 3",
          color: 255, // Blue
          is_empty: 0,
          is_triggered: 0,
          tempo: 120,
          tempo_enabled: 1,
          time_signature_numerator: 4,
          time_signature_denominator: 4,
          time_signature_enabled: 1,
        },
      },
    });

    const result = readLiveSet({
      include: [
        "regular-tracks",
        "instruments",
        "chains",
        "scenes",
        "session-clips",
        "arrangement-clips",
        "clip-notes",
      ],
    });

    expect(result).toStrictEqual({
      id: "live_set_id",
      name: "Test Live Set",
      isPlaying: true,
      tempo: 120,
      timeSignature: "4/4",
      scale: "C Major",
      scalePitches: "C,D,E,F,G,A,B",
      tracks: [
        {
          id: "track1",
          type: "midi",
          name: "MIDI Track 1",
          category: "regular",
          trackIndex: 0,
          state: "soloed",
          isGroup: true,
          playingSlotIndex: 2,
          firedSlotIndex: 3,
          arrangementClips: [],
          sessionClips: [
            {
              ...expectedClip({
                id: "clip1",
                trackIndex: 0,
                sceneIndex: 0,
                notes: "",
              }),
              color: undefined,
            },
            {
              ...expectedClip({
                id: "clip2",
                trackIndex: 0,
                sceneIndex: 2,
                notes: "",
              }),
              color: undefined,
            },
          ].map(({ color: _color, ...clip }) => clip),
          instrument: null,
        },
        {
          id: "track2",
          type: "audio",
          name: "Audio Track 2",
          category: "regular",
          trackIndex: 1,
          state: "muted",
          isGroupMember: true,
          groupId: "track1",
          playingSlotIndex: 2,
          firedSlotIndex: 3,
          arrangementClips: [],
          sessionClips: [
            {
              ...expectedClip({
                id: "clip3",
                trackIndex: 1,
                sceneIndex: 0,
                notes: "",
              }),
              color: undefined,
            },
          ].map(({ color: _color, ...clip }) => clip),
          instrument: null,
        },
        (() => {
          const { color: _color, ...track } = expectedTrack({
            id: "track3",
            trackIndex: 2,
            category: "regular",
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
        {
          id: "scene3",
          name: "Scene 3 (3)",
          sceneIndex: 2,
          clipCount: 1,
          tempo: 120,
          timeSignature: "4/4",
        },
      ],
    });

    // Verify expensive note reads WERE made due to includeNotes: true
    const clip1 = lookupMockObject("clip1");
    const clip2 = lookupMockObject("clip2");
    const clip3 = lookupMockObject("clip3");

    expect(clip1?.call).toHaveBeenCalledWith(
      "get_notes_extended",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(clip2?.call).toHaveBeenCalledWith(
      "get_notes_extended",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(clip3?.call).toHaveBeenCalledWith(
      "get_notes_extended",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("handles when no tracks or scenes exist", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set",
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
          scenes: [],
        },
      },
    });

    const result = readLiveSet({
      include: [
        "regular-tracks",
        "instruments",
        "chains",
        "session-clips",
        "arrangement-clips",
        "clip-notes",
      ],
    });

    expect(result).toStrictEqual({
      id: "live_set",
      name: "Empty Live Set",
      tempo: 100,
      timeSignature: "3/4",
      tracks: [],
      sceneCount: 0,
    });
  });

  it("includes device information across multiple tracks with includeDrumPads", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
        [String(livePath.track(1))]: "track2",
      },
      objects: {
        LiveSet: {
          name: "Device Test Set",
          tracks: children("track1", "track2"),
          scenes: [],
        },
        [String(livePath.track(0))]: {
          has_midi_input: 1,
          name: "Synth Track",
          devices: children("synth1", "eq1"),
        },
        [String(livePath.track(1))]: {
          has_midi_input: 0,
          name: "Audio Track",
          devices: children("reverb1"),
        },
        synth1: SYNTH_DEVICE,
        eq1: EQ_DEVICE,
        reverb1: REVERB_DEVICE,
      },
    });

    const result = readLiveSet({
      include: [
        "regular-tracks",
        "instruments",
        "chains",
        "drum-pads",
        "audio-effects",
      ],
    });

    // Check that tracks have the expected device configurations
    expect(result.tracks).toStrictEqual([
      expect.objectContaining({
        name: "Synth Track",
        instrument: expect.objectContaining({
          type: "instrument: Analog",
        }),
        audioEffects: [
          expect.objectContaining({
            type: "audio-effect: EQ Eight",
          }),
        ],
      }),
      expect.objectContaining({
        name: "Audio Track",
        instrument: null,
        audioEffects: [
          expect.objectContaining({
            type: "audio-effect: Reverb",
          }),
        ],
      }),
    ]);
  });

  it("excludes drum rack devices by default", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
      },
      objects: {
        LiveSet: {
          name: "Drum Rack Test Set",
          tracks: children("track1"),
          scenes: [],
        },
        [String(livePath.track(0))]: {
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
        kick_device: SIMPLER_DEVICE,
        reverb1: REVERB_DEVICE,
      },
    });

    const result = readLiveSet({
      include: [
        "regular-tracks",
        "instruments",
        "chains",
        "audio-effects",
        "session-clips",
        "arrangement-clips",
        "clip-notes",
      ],
    });

    // Check that drum rack devices are included (drumPads hidden - drumMap provides the critical pitch-name mapping)
    const tracks = result.tracks as {
      instrument: unknown;
      audioEffects: unknown[];
    }[];

    expect(tracks[0]!.instrument).toStrictEqual(
      expect.objectContaining({
        name: "My Drums",
        type: "drum-rack",
        // drumPads: expect.any(Array), // Only included when drum-pads is requested
      }),
    );
    expect(tracks[0]!.audioEffects).toStrictEqual([
      expect.objectContaining({
        type: "audio-effect: Reverb",
      }),
    ]);
    // Drum rack device should be present (drumPads hidden)
    const drumRack = tracks[0]!.instrument;

    expect(drumRack).toBeDefined();
    // drumPads hidden - drumMap provides the critical pitch-name mapping
    // expect(drumRack.drumPads).toBeDefined();
    // // If drumPads exist, they should not have chain property when includeDrumPads=false
    // if (drumRack.drumPads && drumRack.drumPads.length > 0) {
    //   expect(drumRack.drumPads[0].chain).toBeUndefined();
    // }
  });
});
