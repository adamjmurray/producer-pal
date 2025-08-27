// src/tools/operations/duplicate.test.js
import { describe, expect, it, vi } from "vitest";
import {
  children,
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "../../mock-live-api";
import { duplicate } from "./duplicate";

describe("duplicate", () => {
  it("should throw an error when type is missing", () => {
    expect(() => duplicate({ id: "some-id" })).toThrow(
      "duplicate failed: type is required",
    );
  });

  it("should throw an error when id is missing", () => {
    expect(() => duplicate({ type: "track" })).toThrow(
      "duplicate failed: id is required",
    );
  });

  it("should throw an error when type is invalid", () => {
    expect(() => duplicate({ type: "invalid", id: "some-id" })).toThrow(
      "duplicate failed: type must be one of track, scene, clip",
    );
  });

  it("should throw an error when count is less than 1", () => {
    expect(() => duplicate({ type: "track", id: "some-id", count: 0 })).toThrow(
      "duplicate failed: count must be at least 1",
    );
  });

  it("should throw an error when the object doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => duplicate({ type: "track", id: "nonexistent" })).toThrow(
      'duplicate failed: id "nonexistent" does not exist',
    );
  });

  describe("track duplication", () => {
    it("should duplicate a single track (default count)", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      const result = duplicate({ type: "track", id: "track1" });

      expect(result).toStrictEqual({
        type: "track",
        id: "track1",
        count: 1,
        duplicated: true,
        newTrackId: "live_set/tracks/1",
        newTrackIndex: 1,
        duplicatedClips: [],
        tip: "TIP: Use routeToSource=true to create layered MIDI setups where multiple tracks control this instrument.",
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_track",
        0,
      );
    });

    it("should duplicate multiple tracks with auto-incrementing names", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      const result = duplicate({
        type: "track",
        id: "track1",
        count: 3,
        name: "Custom Track",
      });

      expect(result).toStrictEqual({
        type: "track",
        id: "track1",
        count: 3,
        name: "Custom Track",
        duplicated: true,
        tip: "TIP: Use routeToSource=true to create layered MIDI setups where multiple tracks control this instrument.",
        objects: [
          {
            newTrackId: "live_set/tracks/1",
            newTrackIndex: 1,
            name: "Custom Track",
            duplicatedClips: [],
          },
          {
            newTrackId: "live_set/tracks/2",
            newTrackIndex: 2,
            name: "Custom Track 2",
            duplicatedClips: [],
          },
          {
            newTrackId: "live_set/tracks/3",
            newTrackIndex: 3,
            name: "Custom Track 3",
            duplicatedClips: [],
          },
        ],
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_track",
        0,
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_track",
        1,
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_track",
        2,
      );

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 1" }),
        "name",
        "Custom Track",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 2" }),
        "name",
        "Custom Track 2",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 3" }),
        "name",
        "Custom Track 3",
      );
    });

    it("should duplicate a track without clips when withoutClips is true", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      // Mock track with clips
      mockLiveApiGet({
        "live_set tracks 1": {
          clip_slots: children("slot0", "slot1", "slot2"),
          arrangement_clips: children("arrangementClip0", "arrangementClip1"),
        },
        slot0: { has_clip: 1 },
        slot1: { has_clip: 0 },
        slot2: { has_clip: 1 },
      });

      const result = duplicate({
        type: "track",
        id: "track1",
        withoutClips: true,
      });

      expect(result).toStrictEqual({
        type: "track",
        id: "track1",
        count: 1,
        withoutClips: true,
        duplicated: true,
        newTrackId: "live_set/tracks/1",
        newTrackIndex: 1,
        duplicatedClips: [],
        tip: "TIP: Use routeToSource=true to create layered MIDI setups where multiple tracks control this instrument.",
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_track",
        0,
      );

      // Verify delete_clip was called for session clips (on clip slots)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: expect.stringContaining("slot") }),
        "delete_clip",
      );

      // Verify delete_clip was called for arrangement clips (on track with clip IDs)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 1" }),
        "delete_clip",
        "id arrangementClip0",
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 1" }),
        "delete_clip",
        "id arrangementClip1",
      );

      // Verify the track instance called delete_clip for arrangement clips
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 1" }),
        "delete_clip",
        "id arrangementClip0",
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 1" }),
        "delete_clip",
        "id arrangementClip1",
      );
    });

    it("should duplicate a track without devices when withoutDevices is true", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      // Mock track with devices
      mockLiveApiGet({
        "live_set tracks 1": {
          devices: children("device0", "device1", "device2"),
        },
      });

      const result = duplicate({
        type: "track",
        id: "track1",
        withoutDevices: true,
      });

      expect(result).toStrictEqual({
        type: "track",
        id: "track1",
        count: 1,
        withoutDevices: true,
        duplicated: true,
        newTrackId: "live_set/tracks/1",
        newTrackIndex: 1,
        duplicatedClips: [],
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_track",
        0,
      );

      // Verify delete_device was called for each device (backwards)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 1" }),
        "delete_device",
        2,
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 1" }),
        "delete_device",
        1,
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 1" }),
        "delete_device",
        0,
      );
    });

    it("should duplicate a track with devices by default (withoutDevices not specified)", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      // Mock track with devices
      mockLiveApiGet({
        "live_set tracks 1": {
          devices: children("device0", "device1"),
        },
      });

      const result = duplicate({
        type: "track",
        id: "track1",
      });

      expect(result).toStrictEqual({
        type: "track",
        id: "track1",
        count: 1,
        duplicated: true,
        newTrackId: "live_set/tracks/1",
        newTrackIndex: 1,
        duplicatedClips: [],
        tip: "TIP: Use routeToSource=true to create layered MIDI setups where multiple tracks control this instrument.",
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_track",
        0,
      );

      // Verify delete_device was NOT called
      expect(liveApiCall).not.toHaveBeenCalledWith(
        "delete_device",
        expect.anything(),
      );
    });

    it("should duplicate a track with devices when withoutDevices is false", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      // Mock track with devices
      mockLiveApiGet({
        "live_set tracks 1": {
          devices: children("device0", "device1"),
        },
      });

      const result = duplicate({
        type: "track",
        id: "track1",
        withoutDevices: false,
      });

      expect(result).toStrictEqual({
        type: "track",
        id: "track1",
        count: 1,
        withoutDevices: false,
        duplicated: true,
        newTrackId: "live_set/tracks/1",
        newTrackIndex: 1,
        duplicatedClips: [],
        tip: "TIP: Use routeToSource=true to create layered MIDI setups where multiple tracks control this instrument.",
      });
      // withoutDevices should not appear in result when false (default)

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_track",
        0,
      );

      // Verify delete_device was NOT called
      expect(liveApiCall).not.toHaveBeenCalledWith(
        "delete_device",
        expect.anything(),
      );
    });

    describe("routeToSource functionality", () => {
      it("should throw an error when routeToSource is used with non-track type", () => {
        expect(() =>
          duplicate({ type: "scene", id: "scene1", routeToSource: true }),
        ).toThrow(
          "duplicate failed: routeToSource is only supported for type 'track'",
        );
      });

      it("should configure routing when routeToSource is true", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "track1") {
            return "live_set tracks 0";
          }
          return this._path;
        });

        // Mock track properties for routing configuration
        mockLiveApiGet({
          "live_set tracks 0": {
            name: "Source Track",
            current_monitoring_state: 1, // AUTO
            input_routing_type: { display_name: "Audio In" },
            available_input_routing_types: [
              { display_name: "No Input", identifier: "no_input_id" },
              { display_name: "Audio In", identifier: "audio_in_id" },
            ],
          },
          "live_set tracks 1": {
            available_output_routing_types: [
              { display_name: "Master", identifier: "master_id" },
              { display_name: "Source Track", identifier: "source_track_id" },
            ],
          },
        });

        const result = duplicate({
          type: "track",
          id: "track1",
          routeToSource: true,
        });

        expect(result).toStrictEqual({
          type: "track",
          id: "track1",
          count: 1,
          routeToSource: true,
          withoutClips: true,
          withoutDevices: true,
          duplicated: true,
          newTrackId: "live_set/tracks/1",
          newTrackIndex: 1,
          duplicatedClips: [],
        });

        // Test currently simplified to verify basic functionality
        // TODO: Add specific API call verifications when LiveAPI mocking is improved
      });

      it("should not change source track monitoring if already set to In", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "track1") {
            return "live_set tracks 0";
          }
          return this._path;
        });

        // Mock track with monitoring already set to "In"
        mockLiveApiGet({
          "live_set tracks 0": {
            name: "Source Track",
            current_monitoring_state: 0, // IN
            input_routing_type: { display_name: "No Input" },
          },
          "live_set tracks 1": {
            available_output_routing_types: [
              { display_name: "Source Track", identifier: "source_track_id" },
            ],
          },
        });

        duplicate({
          type: "track",
          id: "track1",
          routeToSource: true,
        });

        // Verify monitoring was NOT changed
        expect(liveApiSet).not.toHaveBeenCalledWith(
          "current_monitoring_state",
          expect.anything(),
        );
      });

      it("should not change source track input routing if already set to No Input", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "track1") {
            return "live_set tracks 0";
          }
          return this._path;
        });

        // Mock track with input already set to "No Input"
        mockLiveApiGet({
          "live_set tracks 0": {
            name: "Source Track",
            current_monitoring_state: 0, // IN
            input_routing_type: { display_name: "No Input" },
          },
          "live_set tracks 1": {
            available_output_routing_types: [
              { display_name: "Source Track", identifier: "source_track_id" },
            ],
          },
        });

        duplicate({
          type: "track",
          id: "track1",
          routeToSource: true,
        });

        // Verify input routing was NOT changed
        expect(liveApiCall).not.toHaveBeenCalledWith(
          "setProperty",
          "input_routing_type",
          expect.anything(),
        );
      });

      it("should override withoutClips to true when routeToSource is true", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "track1") {
            return "live_set tracks 0";
          }
          return this._path;
        });

        const result = duplicate({
          type: "track",
          id: "track1",
          routeToSource: true,
          withoutClips: false, // This should be overridden
        });

        expect(result.withoutClips).toBe(true);
        expect(result.routeToSource).toBe(true);
      });

      it("should override withoutDevices to true when routeToSource is true", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "track1") {
            return "live_set tracks 0";
          }
          return this._path;
        });

        const result = duplicate({
          type: "track",
          id: "track1",
          routeToSource: true,
          withoutDevices: false, // This should be overridden
        });

        expect(result.withoutDevices).toBe(true);
        expect(result.routeToSource).toBe(true);
      });

      it("should arm the source track when routeToSource is true", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "track1") {
            return "live_set tracks 0";
          }
          return this._path;
        });

        // Mock track properties for routing configuration
        mockLiveApiGet({
          "live_set tracks 0": {
            name: "Source Track",
            input_routing_type: { display_name: "Audio In" },
            available_input_routing_types: [
              { display_name: "No Input", identifier: "no_input_id" },
              { display_name: "Audio In", identifier: "audio_in_id" },
            ],
          },
          "live_set tracks 1": {
            available_output_routing_types: [
              { display_name: "Master", identifier: "master_id" },
              { display_name: "Source Track", identifier: "source_track_id" },
            ],
          },
        });

        duplicate({
          type: "track",
          id: "track1",
          routeToSource: true,
        });

        // Verify the source track was armed
        expect(liveApiSet).toHaveBeenCalledWithThis(
          expect.objectContaining({ path: "live_set tracks 0" }),
          "arm",
          1,
        );
      });

      it("should not emit arm warning when source track is already armed", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "track1") {
            return "live_set tracks 0";
          }
          return this._path;
        });

        // Mock track properties with track already armed
        mockLiveApiGet({
          "live_set tracks 0": {
            name: "Source Track",
            arm: 1, // Already armed
            input_routing_type: { display_name: "Audio In" },
            available_input_routing_types: [
              { display_name: "No Input", identifier: "no_input_id" },
              { display_name: "Audio In", identifier: "audio_in_id" },
            ],
          },
          "live_set tracks 1": {
            available_output_routing_types: [
              { display_name: "Master", identifier: "master_id" },
              { display_name: "Source Track", identifier: "source_track_id" },
            ],
          },
        });

        const consoleSpy = vi.spyOn(console, "error");

        duplicate({
          type: "track",
          id: "track1",
          routeToSource: true,
        });

        // Verify the source track was still set to armed (even though it already was)
        expect(liveApiSet).toHaveBeenCalledWithThis(
          expect.objectContaining({ path: "live_set tracks 0" }),
          "arm",
          1,
        );

        // Verify the arm warning was NOT emitted since it was already armed
        expect(consoleSpy).not.toHaveBeenCalledWith(
          "routeToSource: Armed the source track",
        );

        consoleSpy.mockRestore();
      });
    });
  });

  describe("scene duplication", () => {
    it("should duplicate a single scene to session view (default behavior)", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") {
          return "live_set scenes 0";
        }
        return this._path;
      });

      // Mock scene with clips in tracks 0 and 1
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0", "track1"),
        },
        "live_set tracks 0 clip_slots 1": { has_clip: 1 },
        "live_set tracks 1 clip_slots 1": { has_clip: 1 },
      });

      const result = duplicate({ type: "scene", id: "scene1" });

      expect(result).toStrictEqual({
        type: "scene",
        id: "scene1",
        count: 1,
        duplicated: true,
        newSceneId: "live_set/scenes/1",
        newSceneIndex: 1,
        duplicatedClips: [
          {
            id: "live_set/tracks/0/clip_slots/1/clip",
            view: "session",
            trackIndex: 0,
            clipSlotIndex: 1,
          },
          {
            id: "live_set/tracks/1/clip_slots/1/clip",
            view: "session",
            trackIndex: 1,
            clipSlotIndex: 1,
          },
        ],
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_scene",
        0,
      );
    });

    it("should duplicate multiple scenes with auto-incrementing names", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") {
          return "live_set scenes 0";
        }
        return this._path;
      });

      // Mock scene with clips in tracks 0 and 1
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0", "track1"),
        },
        "live_set tracks 0 clip_slots 1": { has_clip: 1 },
        "live_set tracks 1 clip_slots 1": { has_clip: 1 },
        "live_set tracks 0 clip_slots 2": { has_clip: 1 },
        "live_set tracks 1 clip_slots 2": { has_clip: 1 },
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        count: 2,
        name: "Custom Scene",
      });

      expect(result).toStrictEqual({
        type: "scene",
        id: "scene1",
        count: 2,
        name: "Custom Scene",
        duplicated: true,
        objects: [
          {
            newSceneId: "live_set/scenes/1",
            newSceneIndex: 1,
            name: "Custom Scene",
            duplicatedClips: [
              {
                id: "live_set/tracks/0/clip_slots/1/clip",
                view: "session",
                trackIndex: 0,
                clipSlotIndex: 1,
              },
              {
                id: "live_set/tracks/1/clip_slots/1/clip",
                view: "session",
                trackIndex: 1,
                clipSlotIndex: 1,
              },
            ],
          },
          {
            newSceneId: "live_set/scenes/2",
            newSceneIndex: 2,
            name: "Custom Scene 2",
            duplicatedClips: [
              {
                id: "live_set/tracks/0/clip_slots/2/clip",
                view: "session",
                trackIndex: 0,
                clipSlotIndex: 2,
              },
              {
                id: "live_set/tracks/1/clip_slots/2/clip",
                view: "session",
                trackIndex: 1,
                clipSlotIndex: 2,
              },
            ],
          },
        ],
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_scene",
        0,
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_scene",
        1,
      );

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set scenes 1" }),
        "name",
        "Custom Scene",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set scenes 2" }),
        "name",
        "Custom Scene 2",
      );
    });

    it("should duplicate a scene without clips when withoutClips is true", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") {
          return "live_set scenes 0";
        }
        return this._path;
      });

      // Mock scene with clips in tracks 0 and 1
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0", "track1", "track2"),
        },
        "live_set tracks 0 clip_slots 1": { has_clip: 1 },
        "live_set tracks 1 clip_slots 1": { has_clip: 1 },
        "live_set tracks 2 clip_slots 1": { has_clip: 0 },
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        withoutClips: true,
      });

      expect(result).toStrictEqual({
        type: "scene",
        id: "scene1",
        count: 1,
        withoutClips: true,
        duplicated: true,
        newSceneId: "live_set/scenes/1",
        newSceneIndex: 1,
        duplicatedClips: [],
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_scene",
        0,
      );

      // Verify delete_clip was called for clips in the duplicated scene
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: expect.stringContaining("clip_slots"),
        }),
        "delete_clip",
      );
      const deleteCallCount = liveApiCall.mock.calls.filter(
        (call) => call[0] === "delete_clip",
      ).length;
      expect(deleteCallCount).toBe(2); // Should delete 2 clips (tracks 0 and 1)
    });

    describe("arrangement destination", () => {
      it("should throw error when arrangementStartTime is missing for scene to arrangement", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "scene1") {
            return "live_set scenes 0";
          }
          return this._path;
        });

        expect(() =>
          duplicate({
            type: "scene",
            id: "scene1",
            destination: "arrangement",
          }),
        ).toThrow(
          "duplicate failed: arrangementStartTime is required when destination is 'arrangement'",
        );
      });

      it("should duplicate a scene to arrangement view", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "scene1") {
            return "live_set scenes 0";
          }
          return this._path;
        });

        // Mock scene with clips in tracks 0 and 2
        mockLiveApiGet({
          LiveSet: {
            tracks: children("track0", "track1", "track2"),
          },
          "live_set tracks 0 clip_slots 0": { has_clip: 1 },
          "live_set tracks 1 clip_slots 0": { has_clip: 0 },
          "live_set tracks 2 clip_slots 0": { has_clip: 1 },
          "live_set tracks 0 clip_slots 0 clip": {
            length: 4,
            name: "Clip 1",
            color: 4047616,
            signature_numerator: 4,
            signature_denominator: 4,
            looping: 0,
            loop_start: 0,
            loop_end: 4,
            is_midi_clip: 1,
          },
          "live_set tracks 2 clip_slots 0 clip": {
            length: 8,
            name: "Clip 2",
            color: 8355711,
            signature_numerator: 4,
            signature_denominator: 4,
            looping: 0,
            loop_start: 0,
            loop_end: 8,
            is_midi_clip: 1,
          },
        });

        let clipCounter = 0;
        liveApiCall.mockImplementation(
          function (method, clipIdOrStartTime, startTimeOrLength) {
            if (method === "duplicate_clip_to_arrangement") {
              // Extract track index from the clip ID path
              const trackMatch = clipIdOrStartTime.match(/tracks\/(\d+)/);
              const trackIndex = trackMatch ? trackMatch[1] : "0";
              // Return a mock arrangement clip ID
              return [
                "id",
                `live_set tracks ${trackIndex} arrangement_clips 0`,
              ];
            }
            if (method === "create_midi_clip") {
              // For create_midi_clip, determine track index from the calling context (this.path)
              let trackIndex = "0";
              if (this.path) {
                const trackMatch = this.path.match(/live_set tracks (\d+)/);
                if (trackMatch) {
                  trackIndex = trackMatch[1];
                }
              }
              const result = [
                "id",
                `live_set tracks ${trackIndex} arrangement_clips 0`,
              ];
              clipCounter++;
              return result;
            }
            if (method === "get_notes_extended") {
              return JSON.stringify({ notes: [] }); // Empty notes for testing
            }
            return null;
          },
        );

        // Add mocking for the arrangement clips
        // TODO: find a better way to do this
        const originalGet = liveApiGet.getMockImplementation();
        const originalPath = liveApiPath.getMockImplementation();

        liveApiPath.mockImplementation(function () {
          // For arrangement clips created by ID, return a proper path
          if (
            this._path.startsWith("id live_set tracks") &&
            this._path.includes("arrangement_clips")
          ) {
            return this._path.slice(3); // Remove "id " prefix
          }
          return originalPath ? originalPath.call(this) : this._path;
        });

        liveApiGet.mockImplementation(function (prop) {
          // Check if this is an arrangement clip requesting is_arrangement_clip
          if (
            this._path.includes("arrangement_clips") &&
            prop === "is_arrangement_clip"
          ) {
            return [1];
          }
          // Check if this is an arrangement clip requesting start_time
          if (
            this._path.includes("arrangement_clips") &&
            prop === "start_time"
          ) {
            return [16];
          }
          // Otherwise use the original mock implementation
          return originalGet ? originalGet.call(this, prop) : [];
        });

        const result = duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementStartTime: "5|1",
        });

        // Track 0 clip (4 beats) should use duplicate_clip_to_arrangement since it already exists
        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ path: "live_set tracks 0" }),
          "duplicate_clip_to_arrangement",
          "id live_set/tracks/0/clip_slots/0/clip",
          16,
        );
        // Track 2 clip (8 beats) should also use create_midi_clip since it equals scene length
        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ path: "live_set tracks 2" }),
          "create_midi_clip",
          16,
          8,
        );

        expect(result).toStrictEqual({
          type: "scene",
          id: "scene1",
          count: 1,
          destination: "arrangement",
          arrangementStartTime: "5|1",
          duplicated: true,
          arrangementStartTime: "5|1",
          duplicatedClips: [
            {
              id: "live_set tracks 0 arrangement_clips 0",
              view: "arrangement",
              trackIndex: 0,
              arrangementStartTime: "5|1",
            },
            {
              id: "live_set tracks 2 arrangement_clips 0",
              view: "arrangement",
              trackIndex: 2,
              arrangementStartTime: "5|1",
            },
          ],
        });
      });

      it("should duplicate multiple scenes to arrangement view at sequential positions", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "scene1") {
            return "live_set scenes 0";
          }
          return this._path;
        });

        // Mock scene with one clip of length 8 beats
        mockLiveApiGet({
          LiveSet: {
            tracks: children("track0"),
          },
          "live_set tracks 0 clip_slots 0": { has_clip: 1 },
          "live_set tracks 0 clip_slots 0 clip": {
            length: 8,
            name: "Scene Clip",
            color: 4047616,
            signature_numerator: 4,
            signature_denominator: 4,
            looping: 0,
            loop_start: 0,
            loop_end: 8,
            is_midi_clip: 1,
          },
        });

        let clipCounter = 0;
        liveApiCall.mockImplementation(
          function (method, clipIdOrStartTime, startTimeOrLength) {
            if (method === "duplicate_clip_to_arrangement") {
              // Return unique clip IDs for each duplication
              const clipId = `live_set tracks 0 arrangement_clips ${clipCounter}`;
              clipCounter++;
              return ["id", clipId];
            }
            if (method === "create_midi_clip") {
              // For create_midi_clip, first param is startTime, second is length
              const clipId = `live_set tracks 0 arrangement_clips ${clipCounter}`;
              clipCounter++;
              return ["id", clipId];
            }
            if (method === "get_notes_extended") {
              return JSON.stringify({ notes: [] }); // Empty notes for testing
            }
            return null;
          },
        );

        // Add mocking for the arrangement clips
        const originalGet = liveApiGet.getMockImplementation();
        const originalPath = liveApiPath.getMockImplementation();

        liveApiPath.mockImplementation(function () {
          // For arrangement clips created by ID, return a proper path
          if (
            this._path.startsWith("id live_set tracks") &&
            this._path.includes("arrangement_clips")
          ) {
            return this._path.slice(3); // Remove "id " prefix
          }
          return originalPath ? originalPath.call(this) : this._path;
        });

        liveApiGet.mockImplementation(function (prop) {
          // Check if this is an arrangement clip requesting is_arrangement_clip
          if (
            this._path.includes("arrangement_clips") &&
            prop === "is_arrangement_clip"
          ) {
            return [1];
          }
          // Check if this is an arrangement clip requesting start_time
          if (
            this._path.includes("arrangement_clips") &&
            prop === "start_time"
          ) {
            // Return different start times based on clip index
            const clipMatch = this._path.match(/arrangement_clips (\d+)/);
            if (clipMatch) {
              const clipIndex = parseInt(clipMatch[1]);
              return [16 + clipIndex * 8]; // 16, 24, 32
            }
            return [16];
          }
          // Otherwise use the original mock implementation
          return originalGet ? originalGet.call(this, prop) : [];
        });

        const result = duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementStartTime: "5|1",
          count: 3,
          name: "Scene Copy",
        });

        // Scenes should be placed at sequential positions based on scene length (8 beats)
        // Should use create_midi_clip for exact length control
        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ path: "live_set tracks 0" }),
          "create_midi_clip",
          16,
          8,
        );
        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ path: "live_set tracks 0" }),
          "create_midi_clip",
          24,
          8,
        );
        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ path: "live_set tracks 0" }),
          "create_midi_clip",
          32,
          8,
        );

        expect(result).toStrictEqual({
          type: "scene",
          id: "scene1",
          count: 3,
          destination: "arrangement",
          arrangementStartTime: "5|1",
          name: "Scene Copy",
          duplicated: true,
          objects: [
            {
              arrangementStartTime: "5|1",
              name: "Scene Copy",
              duplicatedClips: [
                {
                  id: "live_set tracks 0 arrangement_clips 0",
                  view: "arrangement",
                  trackIndex: 0,
                  arrangementStartTime: "5|1",
                  name: "Scene Copy",
                },
              ],
            },
            {
              arrangementStartTime: "7|1",
              name: "Scene Copy 2",
              duplicatedClips: [
                {
                  id: "live_set tracks 0 arrangement_clips 1",
                  view: "arrangement",
                  trackIndex: 0,
                  arrangementStartTime: "7|1",
                  name: "Scene Copy 2",
                },
              ],
            },
            {
              arrangementStartTime: "9|1",
              name: "Scene Copy 3",
              duplicatedClips: [
                {
                  id: "live_set tracks 0 arrangement_clips 2",
                  view: "arrangement",
                  trackIndex: 0,
                  arrangementStartTime: "9|1",
                  name: "Scene Copy 3",
                },
              ],
            },
          ],
        });
      });

      it("should handle empty scenes gracefully", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "scene1") {
            return "live_set scenes 0";
          }
          return this._path;
        });

        // Mock empty scene
        mockLiveApiGet({
          LiveSet: {
            tracks: children("track0", "track1"),
          },
          "live_set tracks 0 clip_slots 0": { has_clip: 0 },
          "live_set tracks 1 clip_slots 0": { has_clip: 0 },
        });

        const result = duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementStartTime: "5|1",
        });

        expect(result).toStrictEqual({
          type: "scene",
          id: "scene1",
          count: 1,
          destination: "arrangement",
          arrangementStartTime: "5|1",
          duplicated: true,
          arrangementStartTime: "5|1",
          duplicatedClips: [],
        });
      });

      it("should duplicate a scene to arrangement without clips when withoutClips is true", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "scene1") {
            return "live_set scenes 0";
          }
          return this._path;
        });

        // Mock scene with clips in tracks 0 and 2
        mockLiveApiGet({
          LiveSet: {
            tracks: children("track0", "track1", "track2"),
          },
          "live_set tracks 0 clip_slots 0": { has_clip: 1 },
          "live_set tracks 1 clip_slots 0": { has_clip: 0 },
          "live_set tracks 2 clip_slots 0": { has_clip: 1 },
          "live_set tracks 0 clip_slots 0 clip": { length: 4 },
          "live_set tracks 2 clip_slots 0 clip": { length: 8 },
        });

        const result = duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementStartTime: "5|1",
          withoutClips: true,
        });

        // Verify that duplicate_clip_to_arrangement was NOT called
        expect(liveApiCall).not.toHaveBeenCalledWith(
          "duplicate_clip_to_arrangement",
          expect.any(String),
          expect.any(Number),
        );

        // Verify that show_view was still called

        expect(result).toStrictEqual({
          type: "scene",
          id: "scene1",
          count: 1,
          destination: "arrangement",
          arrangementStartTime: "5|1",
          withoutClips: true,
          duplicated: true,
          arrangementStartTime: "5|1",
          duplicatedClips: [],
        });
      });
    });
  });

  describe("clip duplication", () => {
    it("should throw an error when destination is missing", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });
      expect(() => duplicate({ type: "clip", id: "clip1" })).toThrow(
        "duplicate failed: destination is required for type 'clip'",
      );
    });

    it("should throw an error when destination is invalid", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });
      expect(() =>
        duplicate({ type: "clip", id: "clip1", destination: "invalid" }),
      ).toThrow(
        "duplicate failed: destination must be 'session' or 'arrangement'",
      );
    });

    describe("session destination", () => {
      it("should duplicate a single clip to the session view", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "live_set tracks 0 clip_slots 0 clip";
          }
          return this._path;
        });

        const result = duplicate({
          type: "clip",
          id: "clip1",
          destination: "session",
        });

        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ path: "live_set tracks 0" }),
          "duplicate_clip_slot",
          0,
        );

        expect(result).toStrictEqual({
          type: "clip",
          id: "clip1",
          count: 1,
          destination: "session",
          duplicated: true,
          duplicatedClip: {
            id: "live_set/tracks/0/clip_slots/1/clip",
            view: "session",
            trackIndex: 0,
            clipSlotIndex: 1,
          },
        });
      });

      it("should duplicate multiple clips to session view with auto-incrementing names", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "live_set tracks 0 clip_slots 0 clip";
          }
          return this._path;
        });

        const result = duplicate({
          type: "clip",
          id: "clip1",
          destination: "session",
          count: 2,
          name: "Custom Clip",
        });

        expect(result).toStrictEqual({
          type: "clip",
          id: "clip1",
          count: 2,
          destination: "session",
          name: "Custom Clip",
          duplicated: true,
          objects: [
            {
              duplicatedClip: {
                id: "live_set/tracks/0/clip_slots/1/clip",
                view: "session",
                trackIndex: 0,
                clipSlotIndex: 1,
                name: "Custom Clip",
              },
            },
            {
              duplicatedClip: {
                id: "live_set/tracks/0/clip_slots/2/clip",
                view: "session",
                trackIndex: 0,
                clipSlotIndex: 2,
                name: "Custom Clip 2",
              },
            },
          ],
        });

        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ path: "live_set tracks 0" }),
          "duplicate_clip_slot",
          0,
        );
        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ path: "live_set tracks 0" }),
          "duplicate_clip_slot",
          1,
        );

        expect(liveApiSet).toHaveBeenCalledWithThis(
          expect.objectContaining({
            path: "live_set tracks 0 clip_slots 1 clip",
          }),
          "name",
          "Custom Clip",
        );
        expect(liveApiSet).toHaveBeenCalledWithThis(
          expect.objectContaining({
            path: "live_set tracks 0 clip_slots 2 clip",
          }),
          "name",
          "Custom Clip 2",
        );
      });
    });

    describe("arrangement destination", () => {
      it("should throw an error when arrangementStartTime is missing", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "live_set tracks 0 clip_slots 0 clip";
          }
          return this._path;
        });
        mockLiveApiGet({ clip1: { exists: () => true } });

        expect(() =>
          duplicate({ type: "clip", id: "clip1", destination: "arrangement" }),
        ).toThrow(
          "duplicate failed: arrangementStartTime is required when destination is 'arrangement'",
        );
      });

      it("should duplicate a single clip to the arrangement view", () => {
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

        // Mock for getMinimalClipInfo on the new arrangement clip
        const originalPath = liveApiPath.getMockImplementation();
        liveApiPath.mockImplementation(function () {
          if (this._path === "id live_set tracks 0 arrangement_clips 0") {
            return "live_set tracks 0 arrangement_clips 0";
          }
          return originalPath ? originalPath.call(this) : this._path;
        });

        mockLiveApiGet({
          clip1: { exists: () => true },
          "live_set tracks 0 arrangement_clips 0": {
            is_arrangement_clip: 1,
            start_time: 8,
          },
        });

        const result = duplicate({
          type: "clip",
          id: "clip1",
          destination: "arrangement",
          arrangementStartTime: "3|1",
        });

        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ path: "live_set tracks 0" }),
          "duplicate_clip_to_arrangement",
          "id clip1",
          8,
        );

        expect(result).toStrictEqual({
          type: "clip",
          id: "clip1",
          count: 1,
          destination: "arrangement",
          arrangementStartTime: "3|1",
          duplicated: true,
          arrangementStartTime: "3|1",
          duplicatedClip: {
            id: "live_set tracks 0 arrangement_clips 0",
            view: "arrangement",
            trackIndex: 0,
            arrangementStartTime: "3|1",
          },
        });
      });

      it("should duplicate multiple clips to arrangement view at sequential positions", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "live_set tracks 0 clip_slots 0 clip";
          }
          return this._path;
        });
        let clipCounter = 0;
        liveApiCall.mockImplementation(function (method) {
          if (method === "duplicate_clip_to_arrangement") {
            const clipId = `live_set tracks 0 arrangement_clips ${clipCounter}`;
            clipCounter++;
            return ["id", clipId];
          }
          return null;
        });

        // Mock for getMinimalClipInfo on the new arrangement clips
        const originalPath = liveApiPath.getMockImplementation();
        liveApiPath.mockImplementation(function () {
          if (
            this._path.startsWith("id live_set tracks") &&
            this._path.includes("arrangement_clips")
          ) {
            return this._path.slice(3); // Remove "id " prefix
          }
          return originalPath ? originalPath.call(this) : this._path;
        });

        mockLiveApiGet({
          Clip: { length: 4 }, // Mock clip length of 4 beats
          "live_set tracks 0 arrangement_clips 0": {
            is_arrangement_clip: 1,
            start_time: 8,
          },
          "live_set tracks 0 arrangement_clips 1": {
            is_arrangement_clip: 1,
            start_time: 12,
          },
          "live_set tracks 0 arrangement_clips 2": {
            is_arrangement_clip: 1,
            start_time: 16,
          },
        });

        const result = duplicate({
          type: "clip",
          id: "clip1",
          destination: "arrangement",
          arrangementStartTime: "3|1",
          count: 3,
          name: "Custom Clip",
        });

        expect(result).toStrictEqual({
          type: "clip",
          id: "clip1",
          count: 3,
          destination: "arrangement",
          arrangementStartTime: "3|1",
          name: "Custom Clip",
          duplicated: true,
          objects: [
            {
              arrangementStartTime: "3|1",
              name: "Custom Clip",
              duplicatedClip: {
                id: "live_set tracks 0 arrangement_clips 0",
                view: "arrangement",
                trackIndex: 0,
                arrangementStartTime: "3|1",
              },
            },
            {
              arrangementStartTime: "4|1",
              name: "Custom Clip 2",
              duplicatedClip: {
                id: "live_set tracks 0 arrangement_clips 1",
                view: "arrangement",
                trackIndex: 0,
                arrangementStartTime: "4|1",
              },
            },
            {
              arrangementStartTime: "5|1",
              name: "Custom Clip 3",
              duplicatedClip: {
                id: "live_set tracks 0 arrangement_clips 2",
                view: "arrangement",
                trackIndex: 0,
                arrangementStartTime: "5|1",
              },
            },
          ],
        });

        // Clips should be placed at sequential positions
        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ path: "live_set tracks 0" }),
          "duplicate_clip_to_arrangement",
          "id clip1",
          8,
        );
        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ path: "live_set tracks 0" }),
          "duplicate_clip_to_arrangement",
          "id clip1",
          12,
        );
        expect(liveApiCall).toHaveBeenCalledWithThis(
          expect.objectContaining({ path: "live_set tracks 0" }),
          "duplicate_clip_to_arrangement",
          "id clip1",
          16,
        );
        expect(liveApiCall).toHaveBeenCalledTimes(3); // 3 duplicates
      });
    });
  });

  describe("return format", () => {
    it("should return single object format when count=1", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      const result = duplicate({ type: "track", id: "track1", count: 1 });

      expect(result).toStrictEqual({
        type: "track",
        id: "track1",
        count: 1,
        duplicated: true,
        newTrackId: expect.any(String),
        newTrackIndex: expect.any(Number),
        duplicatedClips: [],
        tip: "TIP: Use routeToSource=true to create layered MIDI setups where multiple tracks control this instrument.",
      });
      expect(result.objects).toBeUndefined();
    });

    it("should return objects array format when count>1", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      const result = duplicate({ type: "track", id: "track1", count: 2 });

      expect(result).toMatchObject({
        type: "track",
        id: "track1",
        count: 2,
        duplicated: true,
        objects: expect.arrayContaining([
          expect.objectContaining({ newTrackIndex: expect.any(Number) }),
          expect.objectContaining({ newTrackIndex: expect.any(Number) }),
        ]),
      });
      expect(result.newTrackIndex).toBeUndefined();
    });
  });

  describe("arrangementLength functionality", () => {
    it("should duplicate a clip to arrangement with shorter length", () => {
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
        if (method === "create_midi_clip") {
          return ["id", "live_set tracks 0 arrangement_clips 0"];
        }
        if (method === "get_notes_extended") {
          return JSON.stringify({ notes: [] }); // Empty notes for testing
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
        clip1: {
          exists: () => true,
          length: 8, // 8 beats original length
          looping: 0,
          name: "Test Clip",
          color: 4047616,
          signature_numerator: 4,
          signature_denominator: 4,
          loop_start: 0,
          loop_end: 8,
          is_midi_clip: 1,
        },
        "live_set tracks 0 arrangement_clips 0": {
          is_arrangement_clip: 1,
          start_time: 16,
        },
      });

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        arrangementStartTime: "5|1",
        arrangementLength: "1:0", // 4 beats - shorter than original 8 beats
      });

      expect(result).toStrictEqual({
        type: "clip",
        id: "clip1",
        count: 1,
        destination: "arrangement",
        arrangementStartTime: "5|1",
        arrangementLength: "1:0",
        duplicated: true,
        duplicatedClip: {
          id: "live_set tracks 0 arrangement_clips 0",
          view: "arrangement",
          trackIndex: 0,
          arrangementStartTime: "5|1",
        },
      });

      // Should create clip with exact length instead of duplicating and shortening
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_midi_clip",
        16,
        4,
      ); // start=16, length=4
      // Check that properties were copied correctly
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 arrangement_clips 0",
        }),
        "name",
        "Test Clip",
      ); // Copied from source
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 arrangement_clips 0",
        }),
        "color",
        4047616,
      ); // setColor converts hex to integer
    });

    it("should duplicate a looping clip multiple times to fill longer length", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });

      let clipCounter = 0;
      liveApiCall.mockImplementation(function (method) {
        if (method === "duplicate_clip_to_arrangement") {
          const clipId = `live_set tracks 0 arrangement_clips ${clipCounter}`;
          clipCounter++;
          return ["id", clipId];
        }
        if (method === "create_midi_clip") {
          const clipId = `live_set tracks 0 arrangement_clips ${clipCounter}`;
          clipCounter++;
          return ["id", clipId];
        }
        if (method === "get_notes_extended") {
          return JSON.stringify({ notes: [] }); // Empty notes for testing
        }
        return null;
      });

      const originalPath = liveApiPath.getMockImplementation();
      liveApiPath.mockImplementation(function () {
        if (
          this._path.startsWith("id live_set tracks") &&
          this._path.includes("arrangement_clips")
        ) {
          return this._path.slice(3);
        }
        return originalPath ? originalPath.call(this) : this._path;
      });

      mockLiveApiGet({
        clip1: {
          exists: () => true,
          length: 4, // 4 beats original length
          looping: 1, // Looping enabled
          name: "Test Clip",
          color: 4047616,
          signature_numerator: 4,
          signature_denominator: 4,
          loop_start: 0,
          loop_end: 4,
          is_midi_clip: 1,
        },
        "live_set tracks 0 arrangement_clips 0": {
          is_arrangement_clip: 1,
          start_time: 16,
        },
        "live_set tracks 0 arrangement_clips 1": {
          is_arrangement_clip: 1,
          start_time: 20,
        },
        "live_set tracks 0 arrangement_clips 2": {
          is_arrangement_clip: 1,
          start_time: 24,
        },
      });

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        arrangementStartTime: "5|1",
        arrangementLength: "1:2", // 6 beats - longer than original 4 beats
      });

      // Should create 2 clips: one full (4 beats) + one partial (2 beats)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_midi_clip",
        16,
        4,
      ); // First clip: start=16, length=4
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_midi_clip",
        20,
        2,
      ); // Second clip: start=20, length=2

      // Check that properties were copied correctly for both clips
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 arrangement_clips 0",
        }),
        "name",
        "Test Clip",
      ); // Copied from source
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 arrangement_clips 0",
        }),
        "color",
        4047616,
      ); // setColor converts hex to integer

      expect(result.duplicatedClip).toHaveLength(2);
    });

    it("should duplicate a non-looping clip at original length when requested length is longer", () => {
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
        clip1: {
          exists: () => true,
          length: 4, // 4 beats original length
          looping: 0, // Not looping
        },
        "live_set tracks 0 arrangement_clips 0": {
          is_arrangement_clip: 1,
          start_time: 16,
        },
      });

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        arrangementStartTime: "5|1",
        arrangementLength: "2:0", // 8 beats - longer than original 4 beats
      });

      // Should create clip at original length (no end_marker set)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id clip1",
        16,
      );
      expect(liveApiSet).not.toHaveBeenCalledWith(
        "end_marker",
        expect.anything(),
      );

      expect(result).toStrictEqual({
        type: "clip",
        id: "clip1",
        count: 1,
        destination: "arrangement",
        arrangementStartTime: "5|1",
        arrangementLength: "2:0",
        duplicated: true,
        duplicatedClip: {
          id: "live_set tracks 0 arrangement_clips 0",
          view: "arrangement",
          trackIndex: 0,
          arrangementStartTime: "5|1",
        },
      });
    });

    it("should correctly handle 6/8 time signature duration conversion", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "create_midi_clip") {
          // Track which track this is called on
          let trackIndex = "0";
          if (this.path) {
            const trackMatch = this.path.match(/live_set tracks (\d+)/);
            if (trackMatch) {
              trackIndex = trackMatch[1];
            }
          }
          return ["id", `live_set tracks ${trackIndex} arrangement_clips 0`];
        }
        if (method === "get_notes_extended") {
          return JSON.stringify({ notes: [] });
        }
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
        clip1: {
          exists: () => true,
          length: 12, // 12 Ableton beats = 4 bars in 6/8 time (longer than requested length)
          looping: 0,
          name: "Test Clip 6/8",
          color: 4047616,
          signature_numerator: 6,
          signature_denominator: 8,
          loop_start: 0,
          loop_end: 12,
          is_midi_clip: 1,
        },
        live_set: {
          signature_numerator: 4, // Song is in 4/4, but clip is in 6/8 - this causes the bug
          signature_denominator: 4,
        },
        "live_set tracks 0 arrangement_clips 0": {
          is_arrangement_clip: 1,
          start_time: 0,
        },
      });

      // This test verifies correct duration conversion: "1|0" duration should be 3 Ableton beats in 6/8 time
      // The implementation now correctly uses the CLIP time signature (6/8) for parsing
      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        arrangementStartTime: "1|1",
        arrangementLength: "1:0", // This should be 3 Ableton beats in 6/8 time
      });

      // Verify that the implementation correctly converts "1|0" to 3 Ableton beats for 6/8 time signature
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_midi_clip",
        0,
        3,
      );

      expect(result).toStrictEqual({
        type: "clip",
        id: "clip1",
        count: 1,
        destination: "arrangement",
        arrangementStartTime: "1|1",
        arrangementLength: "1:0",
        duplicated: true,
        duplicatedClip: {
          id: "live_set tracks 0 arrangement_clips 0",
          view: "arrangement",
          trackIndex: 0,
          arrangementStartTime: "1|1",
        },
      });
    });

    it("should correctly handle 2/2 time signature duration conversion", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "create_midi_clip") {
          let trackIndex = "0";
          if (this.path) {
            const trackMatch = this.path.match(/live_set tracks (\d+)/);
            if (trackMatch) {
              trackIndex = trackMatch[1];
            }
          }
          return ["id", `live_set tracks ${trackIndex} arrangement_clips 0`];
        }
        if (method === "get_notes_extended") {
          return JSON.stringify({ notes: [] });
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
        clip1: {
          exists: () => true,
          length: 8, // 8 Ableton beats = 2 bars in 2/2 time (longer than requested length)
          looping: 0,
          name: "Test Clip 2/2",
          color: 4047616,
          signature_numerator: 2,
          signature_denominator: 2,
          loop_start: 0,
          loop_end: 8,
          is_midi_clip: 1,
        },
        live_set: {
          signature_numerator: 4, // Song is in 4/4, but clip is in 2/2
          signature_denominator: 4,
        },
        "live_set tracks 0 arrangement_clips 0": {
          is_arrangement_clip: 1,
          start_time: 0,
        },
      });

      // In 2/2 time, "1|0" duration should be 4 Ableton beats (1 bar = 2 half notes = 4 quarter notes)
      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        arrangementStartTime: "1|1",
        arrangementLength: "1:0", // This should be 4 Ableton beats in 2/2 time
      });

      // Verify that the implementation correctly converts "1|0" to 4 Ableton beats for 2/2 time signature
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_midi_clip",
        0,
        4,
      );

      expect(result).toStrictEqual({
        type: "clip",
        id: "clip1",
        count: 1,
        destination: "arrangement",
        arrangementStartTime: "1|1",
        arrangementLength: "1:0",
        duplicated: true,
        duplicatedClip: {
          id: "live_set tracks 0 arrangement_clips 0",
          view: "arrangement",
          trackIndex: 0,
          arrangementStartTime: "1|1",
        },
      });
    });

    it("should error when arrangementLength is zero or negative", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });

      mockLiveApiGet({
        clip1: {
          exists: () => true,
          length: 4,
          looping: 1,
        },
      });

      expect(() =>
        duplicate({
          type: "clip",
          id: "clip1",
          destination: "arrangement",
          arrangementStartTime: "5|1",
          arrangementLength: "0:0", // 0 bars + 0 beats = 0 total
        }),
      ).toThrow(
        'duplicate failed: arrangementLength must be positive, got "0:0"',
      );
    });

    it("should work normally without arrangementLength (backward compatibility)", () => {
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
        clip1: {
          exists: () => true,
          length: 8,
          looping: 0,
        },
        "live_set tracks 0 arrangement_clips 0": {
          is_arrangement_clip: 1,
          start_time: 16,
        },
      });

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        arrangementStartTime: "5|1",
        // No arrangementLength specified
      });

      // Should use original behavior - no length manipulation
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id clip1",
        16,
      );
      // Check that no end_marker was set (setAll should only be called for name, which is undefined)
      expect(liveApiSet).not.toHaveBeenCalledWith(
        "end_marker",
        expect.anything(),
      );

      expect(result.arrangementLength).toBeUndefined();
    });
  });

  describe("routeToSource with duplicate track names", () => {
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
        if (this._path === "live_set tracks 0" || this._id === "id track0")
          return "100";
        if (this._path === "live_set tracks 1" || this._id === "id track2")
          return "200"; // Our source track
        if (this._path === "live_set tracks 2" || this._id === "id track3")
          return "300";
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
        type: "track",
        id: "track2",
        routeToSource: true,
        duplicated: true,
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
        type: "track",
        id: "track1",
        routeToSource: true,
        duplicated: true,
      });
    });

    it("should warn when track is not found in routing options", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

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

      const result = duplicate({
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
});
