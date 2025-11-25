import { describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  mockLiveApiGet,
} from "../../../test/mock-live-api.js";
import { readTrack } from "./read-track.js";

describe("readTrack - mixer properties", () => {
  it("excludes mixer properties by default", () => {
    liveApiId.mockReturnValue("track1");
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
    });

    const result = readTrack({ trackIndex: 0 });

    expect(result).not.toHaveProperty("gainDb");
    expect(result).not.toHaveProperty("pan");
  });

  it("includes mixer properties when requested", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 mixer_device":
          return "mixer_1";
        case "live_set tracks 0 mixer_device volume":
          return "volume_param_1";
        case "live_set tracks 0 mixer_device panning":
          return "panning_param_1";
        default:
          return "id 0";
      }
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
      MixerDevice: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
      },
      DeviceParameter: {
        display_value: 0, // 0 dB
        value: 0, // center pan
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", 0);
    expect(result).toHaveProperty("pan", 0);
  });

  it("includes non-zero gain and panning values", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 mixer_device":
          return "mixer_1";
        case "live_set tracks 0 mixer_device volume":
          return "volume_param_1";
        case "live_set tracks 0 mixer_device panning":
          return "panning_param_1";
        default:
          return "id 0";
      }
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
      volume_param_1: {
        display_value: -6.5, // -6.5 dB
      },
      panning_param_1: {
        value: 0.5, // panned right
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", -6.5);
    expect(result).toHaveProperty("pan", 0.5);
  });

  it("includes mixer properties for return tracks", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set return_tracks 0":
          return "return1";
        case "live_set return_tracks 0 mixer_device":
          return "mixer_1";
        case "live_set return_tracks 0 mixer_device volume":
          return "volume_param_1";
        case "live_set return_tracks 0 mixer_device panning":
          return "panning_param_1";
        default:
          return "id 0";
      }
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 0,
        name: "Return Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
      MixerDevice: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
      },
      volume_param_1: {
        display_value: -3,
      },
      panning_param_1: {
        value: -0.5,
      },
    });

    const result = readTrack({
      trackIndex: 0,
      category: "return",
      include: ["mixer"],
    });

    expect(result).toHaveProperty("gainDb", -3);
    expect(result).toHaveProperty("pan", -0.5);
  });

  it("includes mixer properties for master track", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set master_track":
          return "master";
        case "live_set master_track mixer_device":
          return "mixer_1";
        case "live_set master_track mixer_device volume":
          return "volume_param_1";
        case "live_set master_track mixer_device panning":
          return "panning_param_1";
        default:
          return "id 0";
      }
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 0,
        name: "Master",
        devices: [],
        mixer_device: children("mixer_1"),
      },
      MixerDevice: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
      },
      DeviceParameter: {
        display_value: 0,
        value: 0,
      },
    });

    const result = readTrack({ category: "master", include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", 0);
    expect(result).toHaveProperty("pan", 0);
  });

  it("handles missing mixer device gracefully", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 mixer_device":
          return "id 0"; // Non-existent mixer
        default:
          return "id 0";
      }
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).not.toHaveProperty("gainDb");
    expect(result).not.toHaveProperty("pan");
  });

  it("handles missing volume parameter gracefully", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 mixer_device":
          return "mixer_1";
        case "live_set tracks 0 mixer_device volume":
          return "id 0"; // Non-existent volume
        case "live_set tracks 0 mixer_device panning":
          return "panning_param_1";
        default:
          return "id 0";
      }
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
      MixerDevice: {
        panning: children("panning_param_1"),
      },
      panning_param_1: {
        value: 0.25,
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).not.toHaveProperty("gainDb");
    expect(result).toHaveProperty("pan", 0.25);
  });

  it("handles missing panning parameter gracefully", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 mixer_device":
          return "mixer_1";
        case "live_set tracks 0 mixer_device volume":
          return "volume_param_1";
        case "live_set tracks 0 mixer_device panning":
          return "id 0"; // Non-existent panning
        default:
          return "id 0";
      }
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
      MixerDevice: {
        volume: children("volume_param_1"),
      },
      volume_param_1: {
        display_value: -12,
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", -12);
    expect(result).not.toHaveProperty("pan");
  });

  it("includes mixer with wildcard include", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 mixer_device":
          return "mixer_1";
        case "live_set tracks 0 mixer_device volume":
          return "volume_param_1";
        case "live_set tracks 0 mixer_device panning":
          return "panning_param_1";
        default:
          return "id 0";
      }
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
      MixerDevice: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
      },
      volume_param_1: {
        display_value: 2,
      },
      panning_param_1: {
        value: -0.25,
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["*"] });

    expect(result).toHaveProperty("gainDb", 2);
    expect(result).toHaveProperty("pan", -0.25);
  });
});
