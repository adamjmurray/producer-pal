// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";
import { createClip } from "./create-clip.ts";
import {
  setupAudioArrangementClipMocks,
  setupSessionAudioClipMocks,
} from "./create-clip-test-helpers.ts";

describe("createClip - audio clips", () => {
  describe("validation", () => {
    it("should throw error when both sampleFile and notes are provided", async () => {
      registerMockObject("live-set", {
        path: "live_set",
        properties: { signature_numerator: 4, signature_denominator: 4 },
      });
      registerMockObject("track-0", { path: "live_set tracks 0" });
      registerMockObject("clip-slot-0-0", {
        path: "live_set tracks 0 clip_slots 0",
        properties: { has_clip: 0 },
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
      const { liveSet, clipSlot, clip } = setupSessionAudioClipMocks({
        clipLength: 16,
      });

      const result = await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        sampleFile: "/path/to/audio.wav",
      });

      // Verify create_audio_clip was called with the file path
      expect(clipSlot.call).toHaveBeenCalledWith(
        "create_audio_clip",
        "/path/to/audio.wav",
      );

      // Verify no add_new_notes call for audio clips
      expect(clip.call).not.toHaveBeenCalledWith(
        "add_new_notes",
        expect.anything(),
      );
      expect(liveSet.call).not.toHaveBeenCalledWith(
        "add_new_notes",
        expect.anything(),
      );

      expect(result).toStrictEqual({
        id: "audio_clip_0_0",
        trackIndex: 0,
        sceneIndex: 0,
        length: "4:0", // 16 beats = 4 bars in 4/4
      });
    });

    it("should create audio clip with name and color", async () => {
      const { clip } = setupSessionAudioClipMocks();

      const result = await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        sampleFile: "/path/to/kick.wav",
        name: "Kick Sample",
        color: "#FF0000",
      });

      // Verify name and color are set
      expect(clip.set).toHaveBeenCalledWith("name", "Kick Sample");
      expect(clip.set).toHaveBeenCalledWith("color", 16711680); // #FF0000 converted to integer

      // Verify no looping/timing properties are set for audio clips
      expect(clip.set).not.toHaveBeenCalledWith(
        "loop_start",
        expect.anything(),
      );
      expect(clip.set).not.toHaveBeenCalledWith("loop_end", expect.anything());
      expect(clip.set).not.toHaveBeenCalledWith(
        "start_marker",
        expect.anything(),
      );

      expect(result).toStrictEqual({
        id: "audio_clip_0_0",
        trackIndex: 0,
        sceneIndex: 0,
        length: "2:0",
      });
    });

    it("should create multiple audio clips in successive scenes", async () => {
      registerMockObject("live-set", {
        path: "live_set",
        properties: {
          signature_numerator: 4,
          signature_denominator: 4,
          scenes: children("scene_0", "scene_1"),
        },
      });

      registerMockObject("track-0", { path: "live_set tracks 0" });

      const clipSlot0 = registerMockObject("clip-slot-0-0", {
        path: "live_set tracks 0 clip_slots 0",
        properties: { has_clip: 0 },
      });

      const clipSlot1 = registerMockObject("clip-slot-0-1", {
        path: "live_set tracks 0 clip_slots 1",
        properties: { has_clip: 0 },
      });

      registerMockObject("audio_clip_0_0", {
        path: "live_set tracks 0 clip_slots 0 clip",
        properties: { length: 4 },
      });

      registerMockObject("audio_clip_0_1", {
        path: "live_set tracks 0 clip_slots 1 clip",
        properties: { length: 4 },
      });

      const result = await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0,1",
        sampleFile: "/path/to/loop.wav",
        name: "Loop",
      });

      // Verify clips were created at specified scenes
      expect(clipSlot0.call).toHaveBeenCalledWith(
        "create_audio_clip",
        "/path/to/loop.wav",
      );
      expect(clipSlot1.call).toHaveBeenCalledWith(
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
      const liveSet = registerMockObject("live-set", {
        path: "live_set",
        properties: {
          signature_numerator: 4,
          signature_denominator: 4,
          scenes: children("scene_0"),
        },
      });

      registerMockObject("track-0", { path: "live_set tracks 0" });

      const clipSlot = registerMockObject("clip-slot-0-1", {
        path: "live_set tracks 0 clip_slots 1",
        properties: { has_clip: 0 },
      });

      registerMockObject("audio_clip_0_1", {
        path: "live_set tracks 0 clip_slots 1 clip",
        properties: { length: 4 },
      });

      await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "1", // Scene doesn't exist yet
        sampleFile: "/path/to/audio.wav",
      });

      // Verify scene was auto-created
      expect(liveSet.call).toHaveBeenCalledWith(
        "create_scene",
        -1, // -1 means append at end
      );

      // Verify clip was created in the new scene
      expect(clipSlot.call).toHaveBeenCalledWith(
        "create_audio_clip",
        "/path/to/audio.wav",
      );
    });

    it("should emit warning and return empty array when scene index exceeds maximum", async () => {
      registerMockObject("live-set", {
        path: "live_set",
        properties: { signature_numerator: 4, signature_denominator: 4 },
      });
      registerMockObject("track-0", { path: "live_set tracks 0" });

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
      setupSessionAudioClipMocks({ hasClip: 1 });

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
      const { track } = setupAudioArrangementClipMocks();

      const result = await createClip({
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "1|1",
        sampleFile: "/path/to/audio.wav",
      });

      // Verify create_audio_clip was called with file path and position
      expect(track.call).toHaveBeenCalledWith(
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
      const { clip } = setupAudioArrangementClipMocks({ clipLength: 16 });

      const result = await createClip({
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "5|1",
        sampleFile: "/path/to/vocals.wav",
        name: "Vocals",
        color: "#00FF00",
      });

      expect(clip.set).toHaveBeenCalledWith("name", "Vocals");
      expect(clip.set).toHaveBeenCalledWith("color", 65280); // #00FF00 converted to integer

      expect(result).toStrictEqual({
        id: "arrangement_audio_clip",
        trackIndex: 0,
        arrangementStart: "5|1",
        length: "4:0",
      });
    });

    it("should create multiple audio clips at specified positions in arrangement", async () => {
      let clipCounter = 0;

      registerMockObject("live-set", {
        path: "live_set",
        properties: { signature_numerator: 4, signature_denominator: 4 },
      });
      const track = registerMockObject("track-0", {
        path: "live_set tracks 0",
        methods: {
          create_audio_clip: () => [
            "id",
            `arrangement_audio_clip_${clipCounter++}`,
          ],
        },
      });

      registerMockObject("arrangement_audio_clip_0", {
        properties: { length: 4 },
      });

      registerMockObject("arrangement_audio_clip_1", {
        properties: { length: 4 },
      });

      registerMockObject("arrangement_audio_clip_2", {
        properties: { length: 4 },
      });

      const result = await createClip({
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "1|1,2|1,3|1",
        sampleFile: "/path/to/loop.wav",
        name: "Loop",
      });

      // Verify clips created at specified positions
      expect(track.call).toHaveBeenCalledWith(
        "create_audio_clip",
        "/path/to/loop.wav",
        0, // First clip at position 0 (1|1)
      );
      expect(track.call).toHaveBeenCalledWith(
        "create_audio_clip",
        "/path/to/loop.wav",
        4, // Second clip at position 4 (2|1)
      );
      expect(track.call).toHaveBeenCalledWith(
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
      registerMockObject("live-set", {
        path: "live_set",
        properties: { signature_numerator: 4, signature_denominator: 4 },
      });
      registerMockObject("track-0", { path: "live_set tracks 0" });

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
      mockNonExistentObjects();

      registerMockObject("live-set", {
        path: "live_set",
        properties: { signature_numerator: 4, signature_denominator: 4 },
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
      registerMockObject("live-set", {
        path: "live_set",
        properties: { signature_numerator: 4, signature_denominator: 4 },
      });
      registerMockObject("track-0", {
        path: "live_set tracks 0",
        methods: {
          create_audio_clip: () => ["id", "0"], // Return invalid clip reference
        },
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
      setupSessionAudioClipMocks({ clipLength: 12.5 });

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
      registerMockObject("live-set", {
        path: "live_set",
        properties: {
          signature_numerator: 4,
          signature_denominator: 4,
          scenes: children("scene_0", "scene_1"),
        },
      });
      registerMockObject("track-0", { path: "live_set tracks 0" });
      registerMockObject("clip-slot-0-0", {
        path: "live_set tracks 0 clip_slots 0",
        properties: { has_clip: 0 },
      });
      registerMockObject("clip-slot-0-1", {
        path: "live_set tracks 0 clip_slots 1",
        properties: { has_clip: 0 },
      });
      registerMockObject("audio_clip_0_0", {
        path: "live_set tracks 0 clip_slots 0 clip",
        properties: { length: 8 },
      });
      registerMockObject("audio_clip_0_1", {
        path: "live_set tracks 0 clip_slots 1 clip",
        properties: { length: 8 },
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
      const { clip } = setupSessionAudioClipMocks();

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
      expect(clip.set).not.toHaveBeenCalledWith(
        "start_marker",
        expect.anything(),
      );
      expect(clip.set).not.toHaveBeenCalledWith(
        "loop_start",
        expect.anything(),
      );
      expect(clip.set).not.toHaveBeenCalledWith("loop_end", expect.anything());
      expect(clip.set).not.toHaveBeenCalledWith(
        "end_marker",
        expect.anything(),
      );
      expect(clip.set).not.toHaveBeenCalledWith(
        "playing_position",
        expect.anything(),
      );
      expect(clip.set).not.toHaveBeenCalledWith("looping", expect.anything());
    });

    it("should not set time signature on audio clips", async () => {
      const { clip } = setupSessionAudioClipMocks();

      await createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        sampleFile: "/path/to/audio.wav",
        timeSignature: "3/4",
      });

      // Verify time signature is NOT set for audio clips
      expect(clip.set).not.toHaveBeenCalledWith(
        "signature_numerator",
        expect.anything(),
      );
      expect(clip.set).not.toHaveBeenCalledWith(
        "signature_denominator",
        expect.anything(),
      );
    });
  });
});
