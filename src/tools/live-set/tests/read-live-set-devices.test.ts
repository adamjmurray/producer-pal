// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { LIVE_API_DEVICE_TYPE_AUDIO_EFFECT } from "#src/tools/constants.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { createDeviceMockProperties } from "#src/tools/track/read/helpers/read-track-device-test-helpers.ts";
import { setupLiveSetPathMappedMocks } from "./read-live-set-path-mapped-test-helpers.ts";

function reverbDeviceProps() {
  return createDeviceMockProperties({
    name: "Reverb",
    className: "Reverb",
    classDisplayName: "Reverb",
    type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  });
}

describe("readLiveSet - devices", () => {
  it("includes devices per track when devices include is specified", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
        [String(livePath.track(0).device(0))]: "device_1",
        [String(livePath.masterTrack())]: "master",
      },
      objects: {
        LiveSet: {
          name: "Devices Test Set",
          tracks: children("track1"),
          return_tracks: children(),
          scenes: [],
        },
        [String(livePath.track(0))]: {
          has_midi_input: 1,
          name: "Test Track",
          clip_slots: [],
          devices: children("device_1"),
        },
        [String(livePath.track(0).device(0))]: reverbDeviceProps(),
        [String(livePath.masterTrack())]: {
          has_midi_input: 0,
          name: "Master",
          devices: [],
        },
      },
    });

    const result = readLiveSet({ include: ["tracks", "devices"] });
    const tracks = result.tracks as Array<Record<string, unknown>>;

    expect(tracks[0]?.devices).toStrictEqual([
      { id: "device_1", path: "t0/d0", type: "audio-effect: Reverb" },
    ]);
  });

  it("excludes devices from tracks when devices is not included", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
        [String(livePath.track(0).device(0))]: "device_1",
        [String(livePath.masterTrack())]: "master",
      },
      objects: {
        LiveSet: {
          name: "Devices Test Set",
          tracks: children("track1"),
          return_tracks: children(),
          scenes: [],
        },
        [String(livePath.track(0))]: {
          has_midi_input: 1,
          name: "Test Track",
          clip_slots: [],
          devices: children("device_1"),
        },
        [String(livePath.track(0).device(0))]: reverbDeviceProps(),
        [String(livePath.masterTrack())]: {
          has_midi_input: 0,
          name: "Master",
          devices: [],
        },
      },
    });

    const result = readLiveSet({ include: ["tracks"] });
    const tracks = result.tracks as Array<Record<string, unknown>>;

    expect(tracks[0]).not.toHaveProperty("devices");
  });

  it("includes devices in return tracks", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        [String(livePath.returnTrack(0))]: "return1",
        [String(livePath.returnTrack(0).device(0))]: "device_1",
        [String(livePath.masterTrack())]: "master",
      },
      objects: {
        LiveSet: {
          name: "Devices Test Set",
          tracks: children(),
          return_tracks: children("return1"),
          scenes: [],
        },
        [String(livePath.returnTrack(0))]: {
          has_midi_input: 0,
          name: "Return Track",
          clip_slots: [],
          devices: children("device_1"),
        },
        [String(livePath.returnTrack(0).device(0))]: reverbDeviceProps(),
        [String(livePath.masterTrack())]: {
          has_midi_input: 0,
          name: "Master",
          devices: [],
        },
      },
    });

    const result = readLiveSet({ include: ["tracks", "devices"] });
    const returnTracks = result.returnTracks as Array<Record<string, unknown>>;

    expect(returnTracks[0]?.devices).toStrictEqual([
      { id: "device_1", path: "rt0/d0", type: "audio-effect: Reverb" },
    ]);
  });

  it("includes devices in master track", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        [String(livePath.masterTrack())]: "master",
        [String(livePath.masterTrack().device(0))]: "device_1",
      },
      objects: {
        LiveSet: {
          name: "Devices Test Set",
          tracks: children(),
          return_tracks: children(),
          scenes: [],
        },
        [String(livePath.masterTrack())]: {
          has_midi_input: 0,
          name: "Master",
          devices: children("device_1"),
        },
        [String(livePath.masterTrack().device(0))]: reverbDeviceProps(),
      },
    });

    const result = readLiveSet({ include: ["tracks", "devices"] });
    const masterTrack = result.masterTrack as Record<string, unknown>;

    expect(masterTrack.devices).toStrictEqual([
      { id: "device_1", path: "mt/d0", type: "audio-effect: Reverb" },
    ]);
  });

  it("includes devices with wildcard include", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
        [String(livePath.track(0).device(0))]: "device_1",
        [String(livePath.masterTrack())]: "master",
      },
      objects: {
        LiveSet: {
          name: "Devices Test Set",
          tracks: children("track1"),
          return_tracks: children(),
          scenes: [],
        },
        [String(livePath.track(0))]: {
          has_midi_input: 1,
          name: "Test Track",
          clip_slots: [],
          devices: children("device_1"),
        },
        [String(livePath.track(0).device(0))]: reverbDeviceProps(),
        [String(livePath.masterTrack())]: {
          has_midi_input: 0,
          name: "Master",
          devices: [],
        },
      },
    });

    const result = readLiveSet({ include: ["*"] });
    const tracks = result.tracks as Array<Record<string, unknown>>;

    expect(tracks[0]?.devices).toStrictEqual([
      { id: "device_1", path: "t0/d0", type: "audio-effect: Reverb" },
    ]);
  });

  it("includes devices in multiple tracks", () => {
    setupLiveSetPathMappedMocks({
      liveSetId: "live_set_id",
      pathIdMap: {
        [String(livePath.track(0))]: "track1",
        [String(livePath.track(1))]: "track2",
        [String(livePath.track(0).device(0))]: "device_1",
        [String(livePath.track(1).device(0))]: "device_2",
        [String(livePath.masterTrack())]: "master",
      },
      objects: {
        LiveSet: {
          name: "Devices Test Set",
          tracks: children("track1", "track2"),
          return_tracks: children(),
          scenes: [],
        },
        [String(livePath.track(0))]: {
          has_midi_input: 1,
          name: "Track 1",
          clip_slots: [],
          devices: children("device_1"),
        },
        [String(livePath.track(1))]: {
          has_midi_input: 1,
          name: "Track 2",
          clip_slots: [],
          devices: children("device_2"),
        },
        [String(livePath.track(0).device(0))]: reverbDeviceProps(),
        [String(livePath.track(1).device(0))]: reverbDeviceProps(),
        [String(livePath.masterTrack())]: {
          has_midi_input: 0,
          name: "Master",
          devices: [],
        },
      },
    });

    const result = readLiveSet({ include: ["tracks", "devices"] });
    const tracks = result.tracks as Array<Record<string, unknown>>;

    expect(tracks[0]?.devices).toStrictEqual([
      { id: "device_1", path: "t0/d0", type: "audio-effect: Reverb" },
    ]);
    expect(tracks[1]?.devices).toStrictEqual([
      { id: "device_2", path: "t1/d0", type: "audio-effect: Reverb" },
    ]);
  });
});
