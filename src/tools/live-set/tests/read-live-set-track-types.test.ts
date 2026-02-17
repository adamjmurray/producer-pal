// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { createSimpleRoutingMock } from "#src/test/mocks/routing-mock-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { setupLiveSetPathMappedMocks } from "./read-live-set-path-mapped-test-helpers.ts";

describe("readLiveSet - track types", () => {
  it("conditionally includes return tracks and master track", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
        [String(livePath.returnTrack(0))]: "return1",
        [String(livePath.returnTrack(1))]: "return2",
        [String(livePath.masterTrack())]: "master1",
      },
      objects: {
        LiveSet: {
          name: "Track Types Test Set",
          tracks: children("track1"),
          return_tracks: children("return1", "return2"),
          scenes: [],
        },
        [String(livePath.track(0))]: {
          has_midi_input: 1,
          name: "Regular Track",
          clip_slots: children(),
          arrangement_clips: children(),
          devices: [],
        },
        [String(livePath.returnTrack(0))]: {
          has_midi_input: 0,
          name: "Return A",
          clip_slots: children(),
          arrangement_clips: children(),
          devices: [],
        },
        [String(livePath.returnTrack(1))]: {
          has_midi_input: 0,
          name: "Return B",
          clip_slots: children(),
          arrangement_clips: children(),
          devices: [],
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

    // Test with all track types included
    const resultAll = readLiveSet({
      include: ["regular-tracks", "return-tracks", "master-track"],
    });

    expect(resultAll).toStrictEqual(
      expect.objectContaining({
        tracks: [
          expect.objectContaining({
            id: "track1",
            name: "Regular Track",
            type: "midi",
            trackIndex: 0,
          }),
        ],
        returnTracks: [
          expect.objectContaining({
            id: "return1",
            name: "Return A",
            type: "return",
            returnTrackIndex: 0,
          }),
          expect.objectContaining({
            id: "return2",
            name: "Return B",
            type: "return",
            returnTrackIndex: 1,
          }),
        ],
        masterTrack: expect.objectContaining({
          id: "master1",
          name: "Master",
          type: "master",
        }),
      }),
    );
  });

  it("returns counts when track types not included", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
        [String(livePath.returnTrack(0))]: "return1",
        [String(livePath.returnTrack(1))]: "return2",
        [String(livePath.masterTrack())]: "master1",
      },
      objects: {
        LiveSet: {
          name: "Track Types Test Set",
          tracks: children("track1"),
          return_tracks: children("return1", "return2"),
          scenes: [],
        },
        [String(livePath.track(0))]: {
          has_midi_input: 1,
          name: "Regular Track",
          clip_slots: children(),
          arrangement_clips: children(),
          devices: [],
        },
        [String(livePath.returnTrack(0))]: {
          has_midi_input: 0,
          name: "Return A",
        },
        [String(livePath.returnTrack(1))]: {
          has_midi_input: 0,
          name: "Return B",
        },
      },
    });

    // Only return tracks: regularTrackCount shown instead of tracks array
    const resultReturnOnly = readLiveSet({
      include: ["return-tracks"],
    });

    expect(resultReturnOnly.tracks).toBeUndefined();
    expect(resultReturnOnly.regularTrackCount).toBe(1);
    expect(resultReturnOnly.returnTracks).toHaveLength(2);
    expect(resultReturnOnly.masterTrack).toBeUndefined();

    // Default: all counts, no arrays
    const resultDefault = readLiveSet();

    expect(resultDefault.regularTrackCount).toBe(1);
    expect(resultDefault.returnTrackCount).toBe(2);
    expect(resultDefault.tracks).toBeUndefined();
    expect(resultDefault.returnTracks).toBeUndefined();
    expect(resultDefault.masterTrack).toBeUndefined();
  });

  it("includes all available options when '*' is used", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
        [String(livePath.returnTrack(0))]: "return1",
        [String(livePath.masterTrack())]: "master1",
        [livePath.scene(0)]: "scene1",
        [String(livePath.track(0).device(0))]: "synth1",
      },
      objects: {
        LiveSet: {
          name: "Wildcard Test Set",
          tracks: children("track1"),
          return_tracks: children("return1"),
          scenes: children("scene1"),
          cue_points: [],
        },
        [String(livePath.track(0))]: {
          has_midi_input: 1,
          name: "Test Track",
          clip_slots: children(),
          arrangement_clips: children(),
          devices: children("synth1"),
          ...createSimpleRoutingMock(),
        },
        [String(livePath.returnTrack(0))]: {
          has_midi_input: 0,
          name: "Return A",
          arrangement_clips: children(),
          devices: [],
        },
        [String(livePath.masterTrack())]: {
          has_midi_input: 0,
          name: "Master",
          arrangement_clips: children(),
          devices: [],
        },
        [livePath.scene(0)]: {
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
      },
    });

    // Test with '*' - should include everything
    const resultWildcard = readLiveSet({
      include: ["*"],
    });

    // Test explicit list - should produce identical result
    const resultExplicit = readLiveSet({
      include: [
        "scenes",
        "routings",
        "regular-tracks",
        "return-tracks",
        "master-track",
        "color",
        "locators",
        "mixer",
      ],
    });

    // Results should be identical
    expect(resultWildcard).toStrictEqual(resultExplicit);

    // Verify key properties are included
    expect(resultWildcard).toStrictEqual(
      expect.objectContaining({
        tracks: expect.any(Array),
        returnTracks: expect.any(Array),
        masterTrack: expect.any(Object),
        scenes: expect.any(Array),
      }),
    );

    // Verify track has routing and color from propagation
    const tracks = resultWildcard.tracks as unknown[];

    expect(tracks[0]).toStrictEqual(
      expect.objectContaining({
        instrument: "Analog",
        inputRoutingChannel: expect.any(Object),
        color: expect.any(String),
        sessionClipCount: expect.any(Number),
        arrangementClipCount: expect.any(Number),
      }),
    );
  });
});
