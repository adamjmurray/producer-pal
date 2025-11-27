import { describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiSet,
  mockLiveApiGet,
} from "../../../test/mock-live-api.js";
import { MAX_AUTO_CREATED_SCENES } from "../../constants.js";
import { createClip } from "./create-clip.js";

describe("createClip - audio clips", () => {
  describe("validation", () => {
    it("should throw error when both sampleFile and notes are provided", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
      });

      expect(() =>
        createClip({
          view: "session",
          trackIndex: 0,
          sceneIndex: "0",
          sampleFile: "/path/to/audio.wav",
          notes: "C3 1|1",
        }),
      ).toThrow(
        "createClip failed: cannot specify both sampleFile and notes - audio clips cannot contain MIDI notes",
      );
    });
  });

  describe("session view", () => {
    it("should create audio clip in session view", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        Clip: { length: 16 }, // Mock audio file length (4 bars in 4/4)
      });

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 clip_slots 0 clip") {
          return "audio_clip_0_0";
        }
        return this._id;
      });

      const result = createClip({
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

      expect(result).toEqual({
        id: "audio_clip_0_0",
        trackIndex: 0,
        sceneIndex: 0,
        length: "4:0", // 16 beats = 4 bars in 4/4
      });
    });

    it("should create audio clip with name and color", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        Clip: { length: 8 },
      });

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 clip_slots 0 clip") {
          return "audio_clip_0_0";
        }
        return this._id;
      });

      const result = createClip({
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

      expect(result).toEqual({
        id: "audio_clip_0_0",
        trackIndex: 0,
        sceneIndex: 0,
        length: "2:0",
      });
    });

    it("should create multiple audio clips in successive scenes", () => {
      mockLiveApiGet({
        LiveSet: { scenes: children("scene_0", "scene_1") }, // 2 existing scenes
        ClipSlot: { has_clip: 0 },
        "live_set/tracks/0/clip_slots/0/clip": { length: 4 },
        "live_set/tracks/0/clip_slots/1/clip": { length: 4 },
      });

      // Mock clip IDs based on path
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 clip_slots 0 clip") {
          return "audio_clip_0_0";
        }
        if (this._path === "live_set tracks 0 clip_slots 1 clip") {
          return "audio_clip_0_1";
        }
        // When querying length, use the same ID
        if (this._id === "audio_clip_0_0" || this._id === "audio_clip_0_1") {
          return this._id;
        }
        return this._id;
      });

      const result = createClip({
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

      expect(result).toEqual([
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

    it("should auto-create scenes for audio clips when needed", () => {
      mockLiveApiGet({
        LiveSet: { scenes: children("scene_0") }, // Only 1 existing scene
        ClipSlot: { has_clip: 0 },
        Clip: { length: 4 },
      });

      let clipIndex = 0;
      liveApiId.mockImplementation(function () {
        if (this._path.includes("clip_slots")) {
          return `audio_clip_0_${clipIndex++}`;
        }
        return this._id;
      });

      createClip({
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

    it("should throw error when scene index exceeds maximum", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
      });

      expect(() =>
        createClip({
          view: "session",
          trackIndex: 0,
          sceneIndex: String(MAX_AUTO_CREATED_SCENES),
          sampleFile: "/path/to/audio.wav",
        }),
      ).toThrow(
        `createClip failed: sceneIndex ${MAX_AUTO_CREATED_SCENES} exceeds the maximum allowed value of ${MAX_AUTO_CREATED_SCENES - 1}`,
      );
    });

    it("should throw error when clip already exists at location", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 1 }, // Clip already exists
      });

      expect(() =>
        createClip({
          view: "session",
          trackIndex: 0,
          sceneIndex: "0",
          sampleFile: "/path/to/audio.wav",
        }),
      ).toThrow(
        "createClip failed: a clip already exists at track 0, clip slot 0",
      );
    });
  });

  describe("arrangement view", () => {
    it("should create audio clip in arrangement view", () => {
      liveApiCall.mockImplementation((method, ..._args) => {
        if (method === "create_audio_clip") {
          return ["id", "arrangement_audio_clip"];
        }
        return null;
      });

      liveApiId.mockImplementation(function () {
        if (this._path === "id arrangement_audio_clip") {
          return "arrangement_audio_clip";
        }
        return this._id;
      });

      mockLiveApiGet({
        Track: { exists: () => true },
        LiveSet: { signature_numerator: 4, signature_denominator: 4 },
        "id arrangement_audio_clip": { length: 8 }, // Mock by clip ID
      });

      const result = createClip({
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

      expect(result).toEqual({
        id: "arrangement_audio_clip",
        trackIndex: 0,
        arrangementStart: "1|1",
        length: "2:0",
      });
    });

    it("should create audio clip with name and color in arrangement", () => {
      liveApiCall.mockImplementation((method, ..._args) => {
        if (method === "create_audio_clip") {
          return ["id", "arrangement_audio_clip"];
        }
        return null;
      });

      liveApiId.mockImplementation(function () {
        if (this._path === "id arrangement_audio_clip") {
          return "arrangement_audio_clip";
        }
        return this._id;
      });

      mockLiveApiGet({
        Track: { exists: () => true },
        LiveSet: { signature_numerator: 4, signature_denominator: 4 },
        "id arrangement_audio_clip": { length: 16 }, // Mock by clip ID
      });

      const result = createClip({
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

      expect(result).toEqual({
        id: "arrangement_audio_clip",
        trackIndex: 0,
        arrangementStart: "5|1",
        length: "4:0",
      });
    });

    it("should create multiple audio clips at specified positions in arrangement", () => {
      let clipCounter = 0;
      liveApiCall.mockImplementation((method, ..._args) => {
        if (method === "create_audio_clip") {
          return ["id", `arrangement_audio_clip_${clipCounter++}`];
        }
        return null;
      });

      liveApiId.mockImplementation(function () {
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

      const result = createClip({
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

      expect(result).toEqual([
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

    it("should throw error when arrangement position exceeds maximum", () => {
      mockLiveApiGet({
        Track: { exists: () => true },
        LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      // Position 394202|1 = 1,576,804 beats which exceeds the limit of 1,576,800
      expect(() =>
        createClip({
          view: "arrangement",
          trackIndex: 0,
          arrangementStart: "394202|1",
          sampleFile: "/path/to/audio.wav",
        }),
      ).toThrow(
        "createClip failed: arrangement position 1576804 exceeds maximum allowed value of 1576800",
      );
    });

    it("should throw error when track does not exist", () => {
      // Mock liveApiId to return "id 0" which makes exists() return false
      liveApiId.mockReturnValue("id 0");

      mockLiveApiGet({
        LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      expect(() =>
        createClip({
          view: "arrangement",
          trackIndex: 99,
          arrangementStart: "1|1",
          sampleFile: "/path/to/audio.wav",
        }),
      ).toThrow("createClip failed: track with index 99 does not exist");
    });
  });

  describe("audio clip length handling", () => {
    it("should use actual audio clip length from Live API", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        Clip: { length: 12.5 }, // Irregular audio length
      });

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 clip_slots 0 clip") {
          return "audio_clip_0_0";
        }
        return this._id;
      });

      const result = createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        sampleFile: "/path/to/audio.wav",
      });

      // Length should come from Live API, not calculated
      expect(result).toEqual({
        id: "audio_clip_0_0",
        trackIndex: 0,
        sceneIndex: 0,
        length: "3:0.5", // 12.5 beats in 4/4 = 3 bars + 0.5 beats
      });
    });

    it("should report same length for multiple clips from same sample", () => {
      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 clip_slots 0 clip") {
          return "audio_clip_0_0";
        }
        if (this._path === "live_set tracks 0 clip_slots 1 clip") {
          return "audio_clip_0_1";
        }
        // When querying length with clip ID, return the same ID
        if (this._id === "audio_clip_0_0" || this._id === "audio_clip_0_1") {
          return this._id;
        }
        return this._id;
      });

      mockLiveApiGet({
        LiveSet: { scenes: children("scene_0", "scene_1") },
        ClipSlot: { has_clip: 0 },
        audio_clip_0_0: { length: 8 }, // Mock by clip ID for getProperty calls
        audio_clip_0_1: { length: 8 },
      });

      const result = createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0,1",
        sampleFile: "/path/to/loop.wav",
      });

      // Both clips should have same length
      expect(result).toEqual([
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
    it("should not set timing parameters on audio clips", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        Clip: { length: 8 },
      });

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 clip_slots 0 clip") {
          return "audio_clip_0_0";
        }
        return this._id;
      });

      createClip({
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

    it("should not set time signature on audio clips", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        Clip: { length: 8 },
      });

      liveApiId.mockImplementation(function () {
        if (this._path === "live_set tracks 0 clip_slots 0 clip") {
          return "audio_clip_0_0";
        }
        return this._id;
      });

      createClip({
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
