import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/v8-max-console.js";
import {
  children,
  liveApiId,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
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
    expect(result).toHaveProperty("panningMode", "stereo");
    expect(result).toHaveProperty("pan", 0);
    expect(result).not.toHaveProperty("leftPan");
    expect(result).not.toHaveProperty("rightPan");
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
    expect(result).toHaveProperty("panningMode", "stereo");
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

  it("returns split panning mode with leftPan and rightPan", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 mixer_device":
          return "mixer_1";
        case "live_set tracks 0 mixer_device volume":
          return "volume_param_1";
        case "live_set tracks 0 mixer_device left_split_stereo":
          return "left_split_param_1";
        case "live_set tracks 0 mixer_device right_split_stereo":
          return "right_split_param_1";
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
      mixer_1: {
        volume: children("volume_param_1"),
        panning_mode: 1, // Split mode
        left_split_stereo: children("left_split_param_1"),
        right_split_stereo: children("right_split_param_1"),
      },
      volume_param_1: {
        display_value: -3,
      },
      left_split_param_1: {
        value: -1, // Full left
      },
      right_split_param_1: {
        value: 1, // Full right
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", -3);
    expect(result).toHaveProperty("panningMode", "split");
    expect(result).toHaveProperty("leftPan", -1);
    expect(result).toHaveProperty("rightPan", 1);
    expect(result).not.toHaveProperty("pan");
  });

  it("returns split panning mode with non-default values", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 mixer_device":
          return "mixer_1";
        case "live_set tracks 0 mixer_device volume":
          return "volume_param_1";
        case "live_set tracks 0 mixer_device left_split_stereo":
          return "left_split_param_1";
        case "live_set tracks 0 mixer_device right_split_stereo":
          return "right_split_param_1";
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
      mixer_1: {
        volume: children("volume_param_1"),
        panning_mode: 1, // Split mode
        left_split_stereo: children("left_split_param_1"),
        right_split_stereo: children("right_split_param_1"),
      },
      volume_param_1: {
        display_value: 0,
      },
      left_split_param_1: {
        value: 0.25,
      },
      right_split_param_1: {
        value: -0.5,
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", 0);
    expect(result).toHaveProperty("panningMode", "split");
    expect(result).toHaveProperty("leftPan", 0.25);
    expect(result).toHaveProperty("rightPan", -0.5);
    expect(result).not.toHaveProperty("pan");
  });

  it("includes sends with return track names when requested", () => {
    liveApiId.mockImplementation(function () {
      // For ID-based paths (from getChildren), return the ID portion
      if (this.path?.startsWith("id ")) {
        return this.path.slice(3);
      }
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
      mixer_1: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
        sends: children("send_1", "send_2"),
        panning_mode: 0,
      },
      send_1: {
        display_value: -12.5,
      },
      send_2: {
        display_value: -6.0,
      },
      volume_param_1: {
        display_value: 0,
      },
      panning_param_1: {
        value: 0,
      },
    });

    const result = readTrack({
      trackIndex: 0,
      include: ["mixer"],
      returnTrackNames: ["Reverb", "Delay"],
    });

    expect(result).toHaveProperty("sends");
    expect(result.sends).toHaveLength(2);
    expect(result.sends[0]).toEqual({ gainDb: -12.5, return: "Reverb" });
    expect(result.sends[1]).toEqual({ gainDb: -6.0, return: "Delay" });
  });

  it("does not include sends property when track has no sends", () => {
    liveApiId.mockImplementation(function () {
      if (this.path?.startsWith("id ")) {
        return this.path.slice(3);
      }
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
      mixer_1: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
        sends: [], // Empty sends (MIDI track with no instrument)
        panning_mode: 0,
      },
      volume_param_1: {
        display_value: 0,
      },
      panning_param_1: {
        value: 0,
      },
    });

    const result = readTrack({
      trackIndex: 0,
      include: ["mixer"],
      returnTrackNames: ["Reverb"],
    });

    expect(result).not.toHaveProperty("sends");
  });

  it("fetches return track names if not provided", () => {
    liveApiId.mockImplementation(function () {
      if (this.path?.startsWith("id ")) {
        return this.path.slice(3);
      }
      switch (this.path) {
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 mixer_device":
          return "mixer_1";
        case "live_set tracks 0 mixer_device volume":
          return "volume_param_1";
        case "live_set tracks 0 mixer_device panning":
          return "panning_param_1";
        case "live_set":
          return "liveSet";
        case "live_set return_tracks 0":
          return "return1";
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
      mixer_1: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
        sends: children("send_1"),
        panning_mode: 0,
      },
      send_1: {
        display_value: -10.0,
      },
      volume_param_1: {
        display_value: 0,
      },
      panning_param_1: {
        value: 0,
      },
      liveSet: {
        return_tracks: children("return1"),
      },
      return1: {
        name: "FetchedReverb",
      },
    });

    const result = readTrack({
      trackIndex: 0,
      include: ["mixer"],
      // Note: returnTrackNames not provided
    });

    expect(result).toHaveProperty("sends");
    expect(result.sends).toHaveLength(1);
    expect(result.sends[0]).toEqual({
      gainDb: -10.0,
      return: "FetchedReverb",
    });
  });

  it("warns when send count doesn't match return track count", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    liveApiId.mockImplementation(function () {
      if (this.path?.startsWith("id ")) {
        return this.path.slice(3);
      }
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
      mixer_1: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
        sends: children("send_1", "send_2"), // 2 sends
        panning_mode: 0,
      },
      send_1: {
        display_value: -12.5,
      },
      send_2: {
        display_value: -6.0,
      },
      volume_param_1: {
        display_value: 0,
      },
      panning_param_1: {
        value: 0,
      },
    });

    const result = readTrack({
      trackIndex: 0,
      include: ["mixer"],
      returnTrackNames: ["Reverb"], // Only 1 return track name, but 2 sends
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "Send count (2) doesn't match return track count (1)",
    );
    // Still returns sends with fallback for missing name
    expect(result.sends).toHaveLength(2);
    expect(result.sends[0]).toEqual({ gainDb: -12.5, return: "Reverb" });
    expect(result.sends[1]).toEqual({ gainDb: -6.0, return: "Return 2" });

    consoleSpy.mockRestore();
  });
});
