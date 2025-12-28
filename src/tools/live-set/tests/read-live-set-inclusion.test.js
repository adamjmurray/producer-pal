import { describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.js";
import { readLiveSet } from "../read-live-set.js";

describe("readLiveSet - inclusion", () => {
  it("returns sceneCount when includeScenes is false", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
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
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: children(),
        arrangement_clips: children(),
        devices: [],
      },
    });

    // Call with default include (which doesn't include "scenes")
    const result = readLiveSet();

    // Verify that sceneCount is returned instead of scenes array
    expect(result.sceneCount).toBe(3);
    expect(result.scenes).toBeUndefined();
  });

  it("returns minimal data when include is an empty array", () => {
    liveApiPath.mockImplementation(function () {
      return this._path;
    });
    liveApiId.mockImplementation(function () {
      return this._id ?? "test_id";
    });

    mockLiveApiGet({
      live_set: {
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
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "get_version_string") {
        return "12.2";
      }
      return null;
    });

    const result = readLiveSet({ include: [] });

    // Should have basic song properties
    expect(result).toEqual(
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
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set":
          return "live_set";
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 0 devices 0":
          return "drumrack1";
        case "live_set tracks 0 devices 0 drum_pads 60":
          return "pad1";
        case "live_set tracks 0 devices 0 drum_pads 60 chains 0":
          return "chain1";
        case "live_set tracks 0 devices 0 drum_pads 60 chains 0 devices 0":
          return "kick_device";
        case "live_set tracks 0 devices 0 chains 0":
          return "main_chain";
        case "live_app":
          return "live_app";
        default:
          return this._id;
      }
    });

    mockLiveApiGet({
      live_set: {
        name: "Test Song",
        tracks: children("track1"),
        return_tracks: [],
        scenes: [],
        back_to_arranger: 0,
        tempo: 120,
        time_signature_numerator: 4,
        time_signature_denominator: 4,
        scale_mode: 0, // Scale disabled
      },
      track1: {
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
        drum_pads: children("pad1"),
        chains: children("main_chain"),
        return_chains: [],
      },
      main_chain: {
        name: "Main Chain",
        mute: 0,
        muted_via_solo: 0,
        solo: 0,
        devices: [],
      },
      pad1: {
        note: 60, // C3
        name: "Test Kick",
        mute: 0,
        muted_via_solo: 0,
        solo: 0,
        chains: children("chain1"),
      },
      chain1: {
        name: "Kick Chain",
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
    });

    // Call with NO arguments - should use defaults (including drum-maps)
    const result = readLiveSet();

    // Should have drumMap on the track
    expect(result.tracks[0].drumMap).toEqual({
      C3: "Test Kick",
    });

    // Should have instrument but NO chains (proving drum-maps is default, not chains)
    expect(result.tracks[0].instrument).toEqual({
      id: "drumrack1",
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
    expect(result.tracks[0].instrument.chains).toBeUndefined();
  });

  it("omits name property when Live Set name is empty string", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") {
        return "live_set";
      }
      return "id 0";
    });

    mockLiveApiGet({
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
    });

    const result = readLiveSet();

    expect(result.name).toBeUndefined();
    expect(result).not.toHaveProperty("name");
  });
});
