// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { setupLiveSetPathMappedMocks } from "./read-live-set-path-mapped-test-helpers.ts";

describe("readLiveSet - inclusion", () => {
  it("returns sceneCount when includeScenes is false", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
      },
      objects: {
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
        [String(livePath.track(0))]: {
          has_midi_input: 1,
          name: "Test Track",
          clip_slots: children(),
          arrangement_clips: children(),
          devices: [],
        },
      },
    });

    // Call with default include (which doesn't include "scenes")
    const result = readLiveSet();

    // Verify that sceneCount is returned instead of scenes array
    expect(result.sceneCount).toBe(3);
    expect(result.scenes).toBeUndefined();
  });

  it("returns minimal data when include is an empty array", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set",
      objects: {
        LiveSet: {
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
      },
    });

    const result = readLiveSet({ include: [] });

    // Should have basic song properties
    expect(result).toStrictEqual(
      expect.objectContaining({
        id: "live_set",
        name: "Test Set",
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
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set",
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
        [String(livePath.track(0).device(0))]: "drumrack1",
        "live_set tracks 0 devices 0 chains 0": "chain1",
        "live_set tracks 0 devices 0 chains 0 devices 0": "kick_device",
        live_app: "live_app",
      },
      objects: {
        LiveSet: {
          name: "Test Song",
          tracks: children("track1"),
          return_tracks: [],
          scenes: [],
          back_to_arranger: 0,
          tempo: 120,
          signature_numerator: 4,
          signature_denominator: 4,
          scale_mode: 0, // Scale disabled
        },
        [String(livePath.track(0))]: {
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
          chains: children("chain1"), // Chains directly on drum rack with in_note
          return_chains: [],
        },
        chain1: {
          in_note: 60, // C3 - chains use in_note instead of pad note
          name: "Test Kick",
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
      },
    });

    // Call with NO arguments - should use defaults (including drum-maps)
    const result = readLiveSet();

    // Should have drumMap on the track
    const tracks = result.tracks as {
      drumMap: Record<string, string>;
      instrument: { id: string; name: string; type: string; chains?: unknown };
    }[];

    expect(tracks[0]!.drumMap).toStrictEqual({
      C3: "Test Kick",
    });

    // Should have instrument but NO chains (proving drum-maps is default, not chains)
    expect(tracks[0]!.instrument).toStrictEqual({
      id: "drumrack1",
      path: "t0/d0",
      name: "Test Drum Rack",
      type: "drum-rack",
      // drumPads: [ // Only included when drum-pads is requested
      //   {
      //     name: "Test Kick",
      //     note: 60,
      //   },
      // ],
    });

    // Critical: chains should be stripped due to drum-maps default
    expect(tracks[0]!.instrument.chains).toBeUndefined();
  });

  it("omits name property when Live Set name is empty string", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set",
      objects: {
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
      },
    });

    const result = readLiveSet();

    expect(result.name).toBeUndefined();
    expect(result).not.toHaveProperty("name");
  });
});
