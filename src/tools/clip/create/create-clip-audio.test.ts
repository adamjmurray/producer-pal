// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiSet,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";
import { createClip } from "./create-clip.ts";
import { setupAudioArrangementClipMocks } from "./create-clip-test-helpers.ts";

function mockClipIds(pathToIdMap: Record<string, string>): void {
  liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
    const pathMatch = pathToIdMap[this._path ?? ""];

    if (pathMatch) return pathMatch;
    const idMatch = this._id ? pathToIdMap[this._id] : undefined;

    if (idMatch) return idMatch;

    return this._id;
  });
}

describe("createClip - audio clips", () => {
  describe("validation", () => {
    it("should throw error when both sampleFile and notes are provided", async () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
      });

      await expect(
        createClip({
          view: "session",
          trackIndex: 0,
          sceneIndex: "0",
          sampleFile: "/path/to/audio.wav",
          notes: "C3 1|1",
        }),
      ).rejects.toThrow(
        "createClip failed: cannot specify both sampleFile and notes - audio clips cannot contain MIDI notes",
      );
    });
  });

  describe("session view", () => {
    it("should create audio clip in session view", async () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        Clip: { length: 16 }, // Mock audio file length (4 bars in 4/4)
      });

      mockClipIds({ "live_set tracks 0 clip_slots 0 clip": "audio_clip_0_0" });

      const result = await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        sampleFile: "/path/to/audio.wav",
      });

      // Verify create_audio_clip was called with the file path
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
        "create_audio_clip",
        "/path/to/audio.wav",
      );

      // Verify no add_new_notes call for audio clips
      expect(liveApiCall).not.toHaveBeenCalledWith("add_new_notes");

      expect(result).toStrictEqual({
        id: "audio_clip_0_0",
        trackIndex: 0,
        sceneIndex: 0,
        length: "4:0", // 16 beats = 4 bars in 4/4
      });
    });

    it("should create audio clip with name and color", async () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        Clip: { length: 8 },
      });

      mockClipIds({ "live_set tracks 0 clip_slots 0 clip": "audio_clip_0_0" });

      const result = await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        sampleFile: "/path/to/kick.wav",
        name: "Kick Sample",
        color: "#FF0000",
      });

      // Verify name and color are set
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 clip_slots 0 clip",
        }),
        "name",
        "Kick Sample",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 clip_slots 0 clip",
        }),
        "color",
        16711680, // #FF0000 converted to integer
      );

      // Verify no looping/timing properties are set for audio clips
      expect(liveApiSet).not.toHaveBeenCalledWith("loop_start");
      expect(liveApiSet).not.toHaveBeenCalledWith("loop_end");
      expect(liveApiSet).not.toHaveBeenCalledWith("start_marker");

      expect(result).toStrictEqual({
        id: "audio_clip_0_0",
        trackIndex: 0,
        sceneIndex: 0,
        length: "2:0",
      });
    });

    it("should create multiple audio clips in successive scenes", async () => {
      mockLiveApiGet({
        LiveSet: { scenes: children("scene_0", "scene_1") }, // 2 existing scenes
        ClipSlot: { has_clip: 0 },
        "live_set/tracks/0/clip_slots/0/clip": { length: 4 },
        "live_set/tracks/0/clip_slots/1/clip": { length: 4 },
      });

      // Mock clip IDs based on path
      mockClipIds({
        "live_set tracks 0 clip_slots 0 clip": "audio_clip_0_0",
        "live_set tracks 0 clip_slots 1 clip": "audio_clip_0_1",
      });

      const result = await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0,1",
        sampleFile: "/path/to/loop.wav",
        name: "Loop",
      });

      // Verify clips were created at specified scenes
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
        "create_audio_clip",
        "/path/to/loop.wav",
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0 clip_slots 1" }),
        "create_audio_clip",
        "/path/to/loop.wav",
      );

      expect(result).toStrictEqual([
        {
          id: "audio_clip_0_0",
          trackIndex: 0,
          sceneIndex: 0,
          length: "1:0",
        },
        {
          id: "audio_clip_0_1",
          trackIndex: 0,
          sceneIndex: 1,
          length: "1:0",
        },
      ]);
    });

    it("should auto-create scenes for audio clips when needed", async () => {
      mockLiveApiGet({
        LiveSet: { scenes: children("scene_0") }, // Only 1 existing scene
        ClipSlot: { has_clip: 0 },
        Clip: { length: 4 },
      });

      let clipIndex = 0;

      liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._path?.includes("clip_slots")) {
          return `audio_clip_0_${clipIndex++}`;
        }

        return this._id ?? "";
      });

      await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "1", // Scene doesn't exist yet
        sampleFile: "/path/to/audio.wav",
      });

      // Verify scene was auto-created
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "create_scene",
        -1, // -1 means append at end
      );

      // Verify clip was created in the new scene
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0 clip_slots 1" }),
        "create_audio_clip",
        "/path/to/audio.wav",
      );
    });

    it("should emit warning and return empty array when scene index exceeds maximum", async () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        LiveSet: { signature_numerator: 4 },
      });

      // Runtime errors during clip creation are now warnings, not fatal errors
      const result = await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: String(MAX_AUTO_CREATED_SCENES),
        sampleFile: "/path/to/audio.wav",
      });

      // Should return empty array (no clips created)
      expect(result).toStrictEqual([]);
    });

    it("should emit warning and return empty array when clip already exists", async () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 1 }, // Clip already exists
        LiveSet: { signature_numerator: 4 },
      });

      // Runtime errors during clip creation are now warnings, not fatal errors
      const result = await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        sampleFile: "/path/to/audio.wav",
      });

      // Should return empty array (no clips created)
      expect(result).toStrictEqual([]);
    });
  });

  describe("arrangement view", () => {
    it("should create audio clip in arrangement view", async () => {
      setupAudioArrangementClipMocks();

      const result = await createClip({
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "1|1",
        sampleFile: "/path/to/audio.wav",
      });

      // Verify create_audio_clip was called with file path and position
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_audio_clip",
        "/path/to/audio.wav",
        0, // Position in beats (1|1 = 0 beats)
      );

      expect(result).toStrictEqual({
        id: "arrangement_audio_clip",
        trackIndex: 0,
        arrangementStart: "1|1",
        length: "2:0",
      });
    });

    it("should create audio clip with name and color in arrangement", async () => {
      setupAudioArrangementClipMocks({ clipLength: 16 });

      const result = await createClip({
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "5|1",
        sampleFile: "/path/to/vocals.wav",
        name: "Vocals",
        color: "#00FF00",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "arrangement_audio_clip" }),
        "name",
        "Vocals",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "arrangement_audio_clip" }),
        "color",
        65280, // #00FF00 converted to integer
      );

      expect(result).toStrictEqual({
        id: "arrangement_audio_clip",
        trackIndex: 0,
        arrangementStart: "5|1",
        length: "4:0",
      });
    });

    it("should create multiple audio clips at specified positions in arrangement", async () => {
      let clipCounter = 0;

      liveApiCall.mockImplementation((method, ..._args) => {
        if (method === "create_audio_clip") {
          return ["id", `arrangement_audio_clip_${clipCounter++}`];
        }

        return null;
      });

      liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
        // Handle "id arrangement_audio_clip_N" paths (from LiveAPI.from())
        if (this._path?.startsWith("id arrangement_audio_clip_")) {
          return this._path.replace("id ", "");
        }

        // Handle direct construction with clip ID (for querying length)
        if (
          this._path === "arrangement_audio_clip_0" ||
          this._path === "arrangement_audio_clip_1" ||
          this._path === "arrangement_audio_clip_2"
        ) {
          return this._path;
        }

        return this._id;
      });

      // Mock length for all audio clip IDs (by both path and id formats)
      mockLiveApiGet({
        Track: { exists: () => true },
        LiveSet: { signature_numerator: 4, signature_denominator: 4 },
        arrangement_audio_clip_0: { length: 4 },
        arrangement_audio_clip_1: { length: 4 },
        arrangement_audio_clip_2: { length: 4 },
      });

      const result = await createClip({
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "1|1,2|1,3|1",
        sampleFile: "/path/to/loop.wav",
        name: "Loop",
      });

      // Verify clips created at specified positions
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_audio_clip",
        "/path/to/loop.wav",
        0, // First clip at position 0 (1|1)
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_audio_clip",
        "/path/to/loop.wav",
        4, // Second clip at position 4 (2|1)
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_audio_clip",
        "/path/to/loop.wav",
        8, // Third clip at position 8 (3|1)
      );

      expect(result).toStrictEqual([
        {
          id: "arrangement_audio_clip_0",
          trackIndex: 0,
          arrangementStart: "1|1",
          length: "1:0",
        },
        {
          id: "arrangement_audio_clip_1",
          trackIndex: 0,
          arrangementStart: "2|1",
          length: "1:0",
        },
        {
          id: "arrangement_audio_clip_2",
          trackIndex: 0,
          arrangementStart: "3|1",
          length: "1:0",
        },
      ]);
    });

    it("should emit warning and return empty array when arrangement position exceeds maximum", async () => {
      mockLiveApiGet({
        Track: { exists: () => true },
        LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      // Position 394202|1 = 1,576,804 beats which exceeds the limit of 1,576,800
      // Runtime errors during clip creation are now warnings, not fatal errors
      const result = await createClip({
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "394202|1",
        sampleFile: "/path/to/audio.wav",
      });

      // Should return empty array (no clips created)
      expect(result).toStrictEqual([]);
    });

    it("should throw error when track does not exist", async () => {
      // Mock liveApiId to return "id 0" which makes exists() return false
      liveApiId.mockReturnValue("id 0");

      mockLiveApiGet({
        LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      await expect(
        createClip({
          view: "arrangement",
          trackIndex: 99,
          arrangementStart: "1|1",
          sampleFile: "/path/to/audio.wav",
        }),
      ).rejects.toThrow("createClip failed: track 99 does not exist");
    });

    it("should emit warning and return empty array when audio clip creation fails", async () => {
      // Make track exist but clip creation fails (clip.exists() returns false)
      liveApiCall.mockImplementation((method, ..._args) => {
        if (method === "create_audio_clip") {
          // Return an invalid clip reference that doesn't exist
          return ["id", "0"];
        }

        return null;
      });

      liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
        // Track exists
        if (this._path === "live_set tracks 0") {
          return "track_0_id";
        }

        // Created clip doesn't exist - return "0" to make exists() return false
        if (this._path === "id 0") {
          return "0";
        }

        return this._id;
      });

      mockLiveApiGet({
        Track: { exists: () => true },
        LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      const result = await createClip({
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "1|1",
        sampleFile: "/path/to/invalid.wav",
      });

      // Should return empty array (no clips created)
      expect(result).toStrictEqual([]);
    });
  });

  describe("audio clip length handling", () => {
    it("should use actual audio clip length from Live API", async () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        Clip: { length: 12.5 }, // Irregular audio length
      });

      mockClipIds({ "live_set tracks 0 clip_slots 0 clip": "audio_clip_0_0" });

      const result = await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        sampleFile: "/path/to/audio.wav",
      });

      // Length should come from Live API, not calculated
      expect(result).toStrictEqual({
        id: "audio_clip_0_0",
        trackIndex: 0,
        sceneIndex: 0,
        length: "3:0.5", // 12.5 beats in 4/4 = 3 bars + 0.5 beats
      });
    });

    it("should report same length for multiple clips from same sample", async () => {
      mockClipIds({
        "live_set tracks 0 clip_slots 0 clip": "audio_clip_0_0",
        "live_set tracks 0 clip_slots 1 clip": "audio_clip_0_1",
      });

      mockLiveApiGet({
        LiveSet: { scenes: children("scene_0", "scene_1") },
        ClipSlot: { has_clip: 0 },
        audio_clip_0_0: { length: 8 }, // Mock by clip ID for getProperty calls
        audio_clip_0_1: { length: 8 },
      });

      const result = await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0,1",
        sampleFile: "/path/to/loop.wav",
      });

      // Both clips should have same length
      expect(result).toStrictEqual([
        {
          id: "audio_clip_0_0",
          trackIndex: 0,
          sceneIndex: 0,
          length: "2:0",
        },
        {
          id: "audio_clip_0_1",
          trackIndex: 0,
          sceneIndex: 1,
          length: "2:0",
        },
      ]);
    });
  });

  describe("parameters ignored for audio clips", () => {
    it("should not set timing parameters on audio clips", async () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        Clip: { length: 8 },
      });

      mockClipIds({ "live_set tracks 0 clip_slots 0 clip": "audio_clip_0_0" });

      await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        sampleFile: "/path/to/audio.wav",
        start: "1|1",
        length: "2:0",
        looping: true,
        firstStart: "1|2",
      });

      // Verify timing parameters are NOT set for audio clips
      expect(liveApiSet).not.toHaveBeenCalledWith("start_marker");
      expect(liveApiSet).not.toHaveBeenCalledWith("loop_start");
      expect(liveApiSet).not.toHaveBeenCalledWith("loop_end");
      expect(liveApiSet).not.toHaveBeenCalledWith("end_marker");
      expect(liveApiSet).not.toHaveBeenCalledWith("playing_position");
      expect(liveApiSet).not.toHaveBeenCalledWith("looping");
    });

    it("should not set time signature on audio clips", async () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        Clip: { length: 8 },
      });

      mockClipIds({ "live_set tracks 0 clip_slots 0 clip": "audio_clip_0_0" });

      await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        sampleFile: "/path/to/audio.wav",
        timeSignature: "3/4",
      });

      // Verify time signature is NOT set for audio clips
      expect(liveApiSet).not.toHaveBeenCalledWith("signature_numerator");
      expect(liveApiSet).not.toHaveBeenCalledWith("signature_denominator");
    });
  });
});
