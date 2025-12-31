import { describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import { readLiveSet } from "#src/tools/live-set/read-live-set.js";

describe("readLiveSet - mixer properties", () => {
  it("includes mixer properties in tracks when mixer include is specified", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") {
        return "live_set_id";
      }

      if (this._path === "live_set tracks 0") {
        return "track1";
      }

      if (this._path === "live_set tracks 0 mixer_device") {
        return "mixer_1";
      }

      if (this._path === "live_set tracks 0 mixer_device volume") {
        return "volume_param_1";
      }

      if (this._path === "live_set tracks 0 mixer_device panning") {
        return "panning_param_1";
      }

      return this._id;
    });

    mockLiveApiGet({
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
      MixerDevice: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
      },
      volume_param_1: {
        display_value: -6,
      },
      panning_param_1: {
        value: 0.5,
      },
    });

    const result = readLiveSet({
      include: ["regular-tracks", "mixer"],
    });

    expect(result.tracks[0]).toStrictEqual(
      expect.objectContaining({
        name: "Test Track",
        gainDb: -6,
        pan: 0.5,
      }),
    );
  });

  it("excludes mixer properties from tracks when mixer is not included", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") {
        return "live_set_id";
      }

      if (this._path === "live_set tracks 0") {
        return "track1";
      }

      return this._id;
    });

    mockLiveApiGet({
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
    });

    const result = readLiveSet({
      include: ["regular-tracks"],
    });

    expect(result.tracks[0]).not.toHaveProperty("gainDb");
    expect(result.tracks[0]).not.toHaveProperty("pan");
  });

  it("includes mixer properties in return tracks", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") {
        return "live_set_id";
      }

      if (this._path === "live_set return_tracks 0") {
        return "return1";
      }

      if (this._path === "live_set return_tracks 0 mixer_device") {
        return "mixer_1";
      }

      if (this._path === "live_set return_tracks 0 mixer_device volume") {
        return "volume_param_1";
      }

      if (this._path === "live_set return_tracks 0 mixer_device panning") {
        return "panning_param_1";
      }

      return this._id;
    });

    mockLiveApiGet({
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
      MixerDevice: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
      },
      volume_param_1: {
        display_value: -3,
      },
      panning_param_1: {
        value: -0.25,
      },
    });

    const result = readLiveSet({
      include: ["return-tracks", "mixer"],
    });

    expect(result.returnTracks[0]).toStrictEqual(
      expect.objectContaining({
        name: "Return Track",
        gainDb: -3,
        pan: -0.25,
      }),
    );
  });

  it("includes mixer properties in master track", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") {
        return "live_set_id";
      }

      if (this._path === "live_set master_track") {
        return "master";
      }

      if (this._path === "live_set master_track mixer_device") {
        return "mixer_1";
      }

      if (this._path === "live_set master_track mixer_device volume") {
        return "volume_param_1";
      }

      if (this._path === "live_set master_track mixer_device panning") {
        return "panning_param_1";
      }

      return this._id;
    });

    mockLiveApiGet({
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
      MixerDevice: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
      },
      volume_param_1: {
        display_value: 0,
      },
      panning_param_1: {
        value: 0,
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
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") {
        return "live_set_id";
      }

      if (this._path === "live_set tracks 0") {
        return "track1";
      }

      if (this._path === "live_set tracks 0 mixer_device") {
        return "mixer_1";
      }

      if (this._path === "live_set tracks 0 mixer_device volume") {
        return "volume_param_1";
      }

      if (this._path === "live_set tracks 0 mixer_device panning") {
        return "panning_param_1";
      }

      return this._id;
    });

    mockLiveApiGet({
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
      MixerDevice: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
      },
      volume_param_1: {
        display_value: 2,
      },
      panning_param_1: {
        value: -1,
      },
    });

    const result = readLiveSet({
      include: ["*"],
    });

    expect(result.tracks[0]).toStrictEqual(
      expect.objectContaining({
        name: "Test Track",
        gainDb: 2,
        pan: -1,
      }),
    );
  });

  it("includes mixer properties in multiple tracks", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") {
        return "live_set_id";
      }

      if (this._path === "live_set tracks 0") {
        return "track1";
      }

      if (this._path === "live_set tracks 1") {
        return "track2";
      }

      if (this._path === "live_set tracks 0 mixer_device") {
        return "mixer_1";
      }

      if (this._path === "live_set tracks 1 mixer_device") {
        return "mixer_2";
      }

      if (this._path === "live_set tracks 0 mixer_device volume") {
        return "volume_param_1";
      }

      if (this._path === "live_set tracks 1 mixer_device volume") {
        return "volume_param_2";
      }

      if (this._path === "live_set tracks 0 mixer_device panning") {
        return "panning_param_1";
      }

      if (this._path === "live_set tracks 1 mixer_device panning") {
        return "panning_param_2";
      }

      return this._id;
    });

    mockLiveApiGet({
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
    });

    const result = readLiveSet({
      include: ["regular-tracks", "mixer"],
    });

    expect(result.tracks[0]).toStrictEqual(
      expect.objectContaining({
        name: "Track 1",
        gainDb: -6,
        pan: 0.5,
      }),
    );
    expect(result.tracks[1]).toStrictEqual(
      expect.objectContaining({
        name: "Track 2",
        gainDb: -12,
        pan: -0.75,
      }),
    );
  });
});
