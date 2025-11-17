import { describe, expect, it } from "vitest";
import {
  children,
  expectedClip,
  expectedTrack,
  liveApiCall,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "../../test/mock-live-api.js";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "../constants.js";
import { readLiveSet } from "./read-live-set.js";

describe("readLiveSet - clips", () => {
  it("passes clip loading parameters to readTrack", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 clip_slots 0 clip": // Path-based access
          return "clip1";
        case "id slot1 clip": // Direct access to slot1's clip
          return "clip1";
        case "clip1":
          return "clip1";
        case "id clip1":
          return "clip1";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Clip Test Set",
        tracks: children("track1"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: children("slot1"),
        arrangement_clips: children("arr_clip1"),
        devices: [],
      },
      "id slot1": {
        clip: ["id", "clip1"],
      },
    });

    // Test with minimal clip loading (no session-clips or arrangement-clips in include)
    const result = readLiveSet({
      include: ["regular-tracks", "instruments", "rack-chains"],
    });

    // When session-clips and arrangement-clips are not in include, we get counts instead of arrays
    expect(result.tracks[0].sessionClipCount).toBe(1);
    expect(result.tracks[0].arrangementClipCount).toBe(1);
  });

  it("uses default parameter values when no arguments provided", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 clip_slots 0 clip": // Path-based access
          return "clip1";
        case "id slot1 clip":
          return "clip1";
        case "clip1":
          return "clip1";
        case "id clip1":
          return "clip1";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Default Test Set",
        tracks: children("track1"),
        scenes: [],
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: children("slot1"),
        arrangement_clips: children("arr_clip1"),
        devices: [],
      },
      "id slot1": {
        clip: ["id", "clip1"],
      },
    });

    // Call readLiveSet with no arguments to test defaults
    const result = readLiveSet();

    // Verify default behavior: clip counts only (defaults have session-clips and arrangement-clips false)
    expect(result.tracks[0].sessionClipCount).toBe(1);
    expect(result.tracks[0].arrangementClipCount).toBe(1);

    // Verify expensive Live API calls were not made due to default minimal behavior
    expect(liveApiCall).not.toHaveBeenCalledWith("get_notes_extended");
  });
});
