// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { setupLiveSetPathMappedMocks } from "./read-live-set-path-mapped-test-helpers.ts";

// Helper to set up mocks for a single track with mixer properties
function setupSingleTrackMixerMock({
  displayValue,
  panValue,
}: {
  displayValue: number;
  panValue: number;
}) {
  setupLiveSetPathMappedMocks({
    liveSetId: "live_set_id",
    pathIdMap: {
      "live_set tracks 0": "track1",
      "live_set tracks 0 mixer_device": "mixer_1",
      "live_set tracks 0 mixer_device volume": "volume_param_1",
      "live_set tracks 0 mixer_device panning": "panning_param_1",
      "live_set master_track": "master",
    },
    objects: {
      LiveSet: {
        name: "Mixer Test Set",
        tracks: children("track1"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
        mixer_device: children("mixer_1"),
        clip_slots: [],
        devices: [],
      },
      "live_set master_track": {
        has_midi_input: 0,
        name: "Master",
        mixer_device: children("master_mixer"),
        devices: [],
      },
      "live_set master_track mixer_device": {
        volume: children("master_volume"),
        panning: children("master_pan"),
      },
      master_volume: { display_value: 0 },
      master_pan: { value: 0 },
      "live_set tracks 0 mixer_device": {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
      },
      volume_param_1: { display_value: displayValue },
      panning_param_1: { value: panValue },
    },
  });
}

describe("readLiveSet - mixer properties", () => {
  it("includes mixer properties in tracks when mixer include is specified", () => {
    setupSingleTrackMixerMock({ displayValue: -6, panValue: 0.5 });

    const result = readLiveSet({
      include: ["regular-tracks", "mixer"],
    });

    const tracks = result.tracks as unknown[];

    expect(tracks[0]).toStrictEqual(
      expect.objectContaining({
        name: "Test Track",
        gainDb: -6,
        pan: 0.5,
      }),
    );
  });

  it("excludes mixer properties from tracks when mixer is not included", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        "live_set tracks 0": "track1",
      },
      objects: {
        LiveSet: {
          name: "Mixer Test Set",
          tracks: children("track1"),
          scenes: [],
        },
        "live_set tracks 0": {
          has_midi_input: 1,
          name: "Test Track",
          mixer_device: children("mixer_1"),
          clip_slots: [],
          devices: [],
        },
      },
    });

    const result = readLiveSet({
      include: ["regular-tracks"],
    });

    const tracks = result.tracks as unknown[];

    expect(tracks[0]).not.toHaveProperty("gainDb");
    expect(tracks[0]).not.toHaveProperty("pan");
  });

  it("includes mixer properties in return tracks", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        "live_set return_tracks 0": "return1",
        "live_set return_tracks 0 mixer_device": "mixer_1",
        "live_set return_tracks 0 mixer_device volume": "volume_param_1",
        "live_set return_tracks 0 mixer_device panning": "panning_param_1",
      },
      objects: {
        LiveSet: {
          name: "Mixer Test Set",
          return_tracks: children("return1"),
          scenes: [],
        },
        "live_set return_tracks 0": {
          has_midi_input: 0,
          name: "Return Track",
          mixer_device: children("mixer_1"),
          clip_slots: [],
          devices: [],
        },
        "live_set return_tracks 0 mixer_device": {
          volume: children("volume_param_1"),
          panning: children("panning_param_1"),
        },
        volume_param_1: {
          display_value: -3,
        },
        panning_param_1: {
          value: -0.25,
        },
      },
    });

    const result = readLiveSet({
      include: ["return-tracks", "mixer"],
    });

    const returnTracks = result.returnTracks as unknown[];

    expect(returnTracks[0]).toStrictEqual(
      expect.objectContaining({
        name: "Return Track",
        gainDb: -3,
        pan: -0.25,
      }),
    );
  });

  it("includes mixer properties in master track", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        "live_set master_track": "master",
        "live_set master_track mixer_device": "mixer_1",
        "live_set master_track mixer_device volume": "volume_param_1",
        "live_set master_track mixer_device panning": "panning_param_1",
      },
      objects: {
        LiveSet: {
          name: "Mixer Test Set",
          master_track: children("master"),
          scenes: [],
        },
        "live_set master_track": {
          has_midi_input: 0,
          name: "Master",
          mixer_device: children("mixer_1"),
          devices: [],
        },
        "live_set master_track mixer_device": {
          volume: children("volume_param_1"),
          panning: children("panning_param_1"),
        },
        volume_param_1: {
          display_value: 0,
        },
        panning_param_1: {
          value: 0,
        },
      },
    });

    const result = readLiveSet({
      include: ["master-track", "mixer"],
    });

    expect(result.masterTrack).toStrictEqual(
      expect.objectContaining({
        name: "Master",
        gainDb: 0,
        pan: 0,
      }),
    );
  });

  it("includes mixer properties with wildcard include", () => {
    setupSingleTrackMixerMock({ displayValue: 2, panValue: -1 });

    const result = readLiveSet({
      include: ["*"],
    });

    const tracks = result.tracks as unknown[];

    expect(tracks[0]).toStrictEqual(
      expect.objectContaining({
        name: "Test Track",
        gainDb: 2,
        pan: -1,
      }),
    );
  });

  it("includes mixer properties in multiple tracks", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        "live_set tracks 0": "track1",
        "live_set tracks 1": "track2",
        "live_set tracks 0 mixer_device": "mixer_1",
        "live_set tracks 1 mixer_device": "mixer_2",
        "live_set tracks 0 mixer_device volume": "volume_param_1",
        "live_set tracks 1 mixer_device volume": "volume_param_2",
        "live_set tracks 0 mixer_device panning": "panning_param_1",
        "live_set tracks 1 mixer_device panning": "panning_param_2",
      },
      objects: {
        LiveSet: {
          name: "Mixer Test Set",
          tracks: children("track1", "track2"),
          scenes: [],
        },
        "live_set tracks 0": {
          has_midi_input: 1,
          name: "Track 1",
          mixer_device: children("mixer_1"),
          clip_slots: [],
          devices: [],
        },
        "live_set tracks 1": {
          has_midi_input: 1,
          name: "Track 2",
          mixer_device: children("mixer_2"),
          clip_slots: [],
          devices: [],
        },
        "live_set tracks 0 mixer_device": {
          volume: children("volume_param_1"),
          panning: children("panning_param_1"),
        },
        "live_set tracks 1 mixer_device": {
          volume: children("volume_param_2"),
          panning: children("panning_param_2"),
        },
        volume_param_1: {
          display_value: -6,
        },
        panning_param_1: {
          value: 0.5,
        },
        volume_param_2: {
          display_value: -12,
        },
        panning_param_2: {
          value: -0.75,
        },
      },
    });

    const result = readLiveSet({
      include: ["regular-tracks", "mixer"],
    });

    const tracks = result.tracks as unknown[];

    expect(tracks[0]).toStrictEqual(
      expect.objectContaining({
        name: "Track 1",
        gainDb: -6,
        pan: 0.5,
      }),
    );
    expect(tracks[1]).toStrictEqual(
      expect.objectContaining({
        name: "Track 2",
        gainDb: -12,
        pan: -0.75,
      }),
    );
  });
});
