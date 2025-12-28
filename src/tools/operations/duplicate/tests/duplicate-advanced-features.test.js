import { describe, expect, it, vi } from "vitest";
import { duplicate } from "../duplicate.js";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "../helpers/duplicate-test-helpers.js";

// Mock updateClip to avoid complex internal logic
vi.mock(import("#src/tools/clip/update/update-clip.js"), () => ({
  updateClip: vi.fn(({ ids }) => {
    // Return array format to simulate tiled clips
    return [{ id: ids }];
  }),
}));

// Mock arrangement-tiling helpers
vi.mock(import("#src/tools/shared/arrangement/arrangement-tiling.js"), () => ({
  createShortenedClipInHolding: vi.fn(() => ({
    holdingClipId: "holding_clip_id",
  })),
  moveClipFromHolding: vi.fn((_holdingClipId, track, _startBeats) => {
    // Return a mock LiveAPI object with necessary methods
    const clipId = `${track.path} arrangement_clips 0`;

    return {
      id: clipId,
      path: clipId,
      set: vi.fn(),
      getProperty: vi.fn((prop) => {
        if (prop === "is_arrangement_clip") {
          return 1;
        }

        if (prop === "start_time") {
          return _startBeats;
        }

        return null;
      }),
      // Add trackIndex getter for getMinimalClipInfo
      get trackIndex() {
        const match = clipId.match(/tracks (\d+)/);

        return match ? parseInt(match[1]) : null;
      },
    };
  }),
}));

describe("duplicate - routeToSource with duplicate track names", () => {
  it("should handle duplicate track names without crashing", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "track2") {
        return "live_set tracks 1"; // Second "Synth" track (sourceTrackIndex)
      }

      return this._path;
    });

    // Mock track properties including proper getChildIds for live_set
    mockLiveApiGet({
      LiveSet: {
        tracks: children("track0", "track2", "track3"), // Returns track IDs in creation order
      },
      track0: {
        name: "Synth", // First track with duplicate name (ID: 100)
      },
      track2: {
        name: "Synth", // Second track with duplicate name (ID: 200, our source)
        current_monitoring_state: 0,
        input_routing_type: { display_name: "All Ins" },
        arm: 0,
        available_input_routing_types: [
          { display_name: "No Input", identifier: "no_input_id" },
          { display_name: "All Ins", identifier: "all_ins_id" },
        ],
      },
      track3: {
        name: "Bass",
      },
      "live_set tracks 1": {
        name: "Synth", // Source track properties
        current_monitoring_state: 0,
        input_routing_type: { display_name: "All Ins" },
        arm: 0,
        available_input_routing_types: [
          { display_name: "No Input", identifier: "no_input_id" },
          { display_name: "All Ins", identifier: "all_ins_id" },
        ],
      },
      "live_set tracks 2": {
        // The new duplicated track
        available_output_routing_types: [
          { display_name: "Master", identifier: "master_id" },
          { display_name: "Synth", identifier: "synth_1_id" }, // First Synth track
          { display_name: "Synth", identifier: "synth_2_id" }, // Second Synth track
          { display_name: "Bass", identifier: "bass_id" },
        ],
      },
    });

    // Mock IDs for creation order - track2 has higher ID than track0
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set tracks 0" || this._id === "id track0") {
        return "100";
      }

      if (this._path === "live_set tracks 1" || this._id === "id track2") {
        return "200";
      } // Our source track

      if (this._path === "live_set tracks 2" || this._id === "id track3") {
        return "300";
      }

      return this._id;
    });

    // Test that the function doesn't crash with duplicate names
    const result = duplicate({
      type: "track",
      id: "track2", // Duplicate second "Synth" track
      routeToSource: true,
    });

    // Just verify it completed without crashing
    expect(result).toMatchObject({
      id: expect.any(String),
      trackIndex: expect.any(Number),
      clips: expect.any(Array),
    });
  });

  it("should handle unique track names without crashing (backward compatibility)", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "track1") {
        return "live_set tracks 0";
      }

      return this._path;
    });

    mockLiveApiGet({
      track1: {
        name: "UniqueTrack",
        current_monitoring_state: 0,
        input_routing_type: { display_name: "All Ins" },
        arm: 0,
        available_input_routing_types: [
          { display_name: "No Input", identifier: "no_input_id" },
          { display_name: "All Ins", identifier: "all_ins_id" },
        ],
      },
      "live_set tracks 0": {
        name: "UniqueTrack",
        current_monitoring_state: 0,
        input_routing_type: { display_name: "All Ins" },
        arm: 0,
        available_input_routing_types: [
          { display_name: "No Input", identifier: "no_input_id" },
          { display_name: "All Ins", identifier: "all_ins_id" },
        ],
      },
      "live_set tracks 1": {
        available_output_routing_types: [
          { display_name: "Master", identifier: "master_id" },
          { display_name: "UniqueTrack", identifier: "unique_track_id" },
        ],
      },
    });

    // Test that the function doesn't crash with unique names
    const result = duplicate({
      type: "track",
      id: "track1",
      routeToSource: true,
    });

    // Just verify it completed without crashing
    expect(result).toMatchObject({
      id: expect.any(String),
      trackIndex: expect.any(Number),
      clips: expect.any(Array),
    });
  });

  it("should warn when track is not found in routing options", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    liveApiPath.mockImplementation(function () {
      if (this._id === "track1") {
        return "live_set tracks 0";
      }

      return this._path;
    });

    mockLiveApiGet({
      track1: {
        name: "NonExistentTrack",
        current_monitoring_state: 0,
        input_routing_type: { display_name: "All Ins" },
        arm: 0,
        available_input_routing_types: [
          { display_name: "No Input", identifier: "no_input_id" },
          { display_name: "All Ins", identifier: "all_ins_id" },
        ],
      },
      "live_set tracks 0": {
        name: "NonExistentTrack",
        current_monitoring_state: 0,
        input_routing_type: { display_name: "All Ins" },
        arm: 0,
        available_input_routing_types: [
          { display_name: "No Input", identifier: "no_input_id" },
          { display_name: "All Ins", identifier: "all_ins_id" },
        ],
      },
      "live_set tracks 1": {
        available_output_routing_types: [
          { display_name: "Master", identifier: "master_id" },
          { display_name: "OtherTrack", identifier: "other_track_id" },
        ],
      },
    });

    duplicate({
      type: "track",
      id: "track1",
      routeToSource: true,
    });

    // Should warn about not finding the track
    expect(consoleSpy).toHaveBeenCalledWith(
      'Warning: Could not find track "NonExistentTrack" in routing options',
    );

    // Should not set output routing with NonExistentTrack identifier
    expect(liveApiSet).not.toHaveBeenCalledWith(
      "output_routing_type",
      expect.objectContaining({
        identifier: expect.stringContaining("NonExistent"),
      }),
    );

    consoleSpy.mockRestore();
  });
});

describe("duplicate - switchView functionality", () => {
  it("should switch to arrangement view when duplicating to arrangement destination", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "clip1") {
        return "live_set tracks 0 clip_slots 0 clip";
      }

      return this._path;
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "duplicate_clip_to_arrangement") {
        return ["id", "live_set tracks 0 arrangement_clips 0"];
      }

      return null;
    });

    const originalPath = liveApiPath.getMockImplementation();

    liveApiPath.mockImplementation(function () {
      if (this._path === "id live_set tracks 0 arrangement_clips 0") {
        return "live_set tracks 0 arrangement_clips 0";
      }

      return originalPath ? originalPath.call(this) : this._path;
    });

    mockLiveApiGet({
      clip1: { exists: () => true, length: 4 },
      "live_set tracks 0 arrangement_clips 0": {
        is_arrangement_clip: 1,
        start_time: 0,
      },
    });

    duplicate({
      type: "clip",
      id: "clip1",
      destination: "arrangement",
      arrangementStart: "1|1",
      switchView: true,
    });

    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
  });

  it("should switch to session view when duplicating to session destination", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "clip1") {
        return "live_set tracks 0 clip_slots 0 clip";
      }

      return this._path;
    });

    liveApiCall.mockImplementation(function () {
      return null;
    });

    mockLiveApiGet({
      clip1: { exists: () => true },
      "live_set tracks 0 clip_slots 1 clip": {
        is_arrangement_clip: 0,
      },
    });

    duplicate({
      type: "clip",
      id: "clip1",
      destination: "session",
      switchView: true,
      toTrackIndex: 0,
      toSceneIndex: "1",
    });

    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
  });

  it("should switch to session view when duplicating tracks", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "track1") {
        return "live_set tracks 0";
      }

      return this._path;
    });

    duplicate({
      type: "track",
      id: "track1",
      switchView: true,
    });

    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
  });

  it("should switch to session view when duplicating scenes", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "scene1") {
        return "live_set scenes 0";
      }

      return this._path;
    });

    duplicate({
      type: "scene",
      id: "scene1",
      switchView: true,
    });

    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
  });

  it("should not switch views when switchView=false", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "track1") {
        return "live_set tracks 0";
      }

      return this._path;
    });

    duplicate({
      type: "track",
      id: "track1",
      switchView: false,
    });

    expect(liveApiCall).not.toHaveBeenCalledWith(
      "show_view",
      expect.anything(),
    );
  });

  it("should work with multiple duplicates when switchView=true", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "track1") {
        return "live_set tracks 0";
      }

      return this._path;
    });

    const result = duplicate({
      type: "track",
      id: "track1",
      count: 2,
      switchView: true,
    });

    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
    expect(result).toHaveLength(2);
  });
});
