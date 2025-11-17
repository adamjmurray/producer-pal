import { describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiSet,
  mockLiveApiGet,
  MockSequence,
} from "../../test/mock-live-api";
import { MAX_AUTO_CREATED_SCENES } from "../constants";
import { createClip } from "./create-clip";

describe("createClip - basic validation and time signatures", () => {
  it("should throw error when required parameters are missing", () => {
    expect(() => createClip({})).toThrow(
      "createClip failed: view parameter is required",
    );
    expect(() => createClip({ view: "session" })).toThrow(
      "createClip failed: trackIndex is required",
    );
    expect(() => createClip({ view: "session", trackIndex: 0 })).toThrow(
      "createClip failed: sceneIndex is required when view is 'Session'",
    );
    expect(() => createClip({ view: "arrangement", trackIndex: 0 })).toThrow(
      "createClip failed: arrangementStart is required when view is 'Arrangement'",
    );
  });

  it("should throw error when count is less than 1", () => {
    expect(() =>
      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        count: 0,
      }),
    ).toThrow("createClip failed: count must be at least 1");
  });

  it("should validate time signature early when provided", () => {
    expect(() =>
      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        timeSignature: "invalid",
      }),
    ).toThrow("Time signature must be in format");
  });

  it("should read time signature from song when not provided", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 3, signature_denominator: 4 },
    });

    const result = createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "C3 1|1 D3 2|1", // Should parse with 3 beats per bar from song
    });

    expect(result).toEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      trackIndex: 0,
      sceneIndex: 0,
      noteCount: 2,
      length: "2:0",
    });

    // Verify the parsed notes were correctly added to the clip
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0 clip" }),
      "add_new_notes",
      {
        notes: [
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          {
            pitch: 62,
            start_time: 3,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          }, // 3 beats per bar in 3/4
        ],
      },
    );
  });

  it("should parse notes using provided time signature", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      timeSignature: "3/4",
      notes: "C3 1|1 D3 2|1", // Should parse with 3 beats per bar
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0 clip" }),
      "add_new_notes",
      {
        notes: [
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          {
            pitch: 62,
            start_time: 3,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ],
      },
    );
  });

  it("should correctly handle 6/8 time signature with Ableton's quarter-note beats", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      timeSignature: "6/8",
      notes: "C3 1|1 D3 2|1",
    });

    // In 6/8, beat 2|1 should be 3 Ableton beats (6 musical beats * 4/8 = 3 Ableton beats)
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0 clip" }),
      "add_new_notes",
      {
        notes: [
          {
            pitch: 60,
            start_time: 0,
            duration: 0.5,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          {
            pitch: 62,
            start_time: 3,
            duration: 0.5,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ],
      },
    );
  });

  it("should create clip with specified length", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      length: "1:3",
      looping: false,
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      7,
    );
  });

  it("should create clip with specified length for looping clips", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      length: "2:0",
      looping: true,
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      8,
    );
  });

  it("should calculate clip length from notes when markers not provided", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "t2 C3 1|1 t1.5 D3 1|4", // Last note starts at beat 3 (0-based), rounds up to 1 bar = 4 beats
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      4,
    );
  });

  it("should handle time signatures with denominators other than 4", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 6, signature_denominator: 8 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "t2 C3 1|1 t1.5 D3 1|2", // Last note starts at beat 1 (0.5 Ableton beats), rounds up to 1 bar
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      3,
    ); // 1 bar in 6/8 = 3 Ableton beats
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0 clip" }),
      "add_new_notes",
      {
        notes: [
          {
            duration: 1, // LiveAPI durations are in quarter notes, so this should be half the value from the notation string
            pitch: 60,
            probability: 1,
            start_time: 0,
            velocity: 100,
            velocity_deviation: 0,
          },
          {
            duration: 0.75, // LiveAPI durations are in quarter notes, so this should be half the value from the notation string
            pitch: 62,
            probability: 1,
            start_time: 0.5,
            velocity: 100,
            velocity_deviation: 0,
          },
        ],
      },
    );
  });

  it("should create 1-bar clip when empty in 4/4 time", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      4, // 1 bar in 4/4 = 4 Ableton beats
    );
  });

  it("should create 1-bar clip when empty in 6/8 time", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 6, signature_denominator: 8 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      3, // 1 bar in 6/8 = 3 Ableton beats (6 eighth notes = 3 quarter notes)
    );
  });

  it("should use 1-bar clip length when notes are empty in 4/4", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      4, // 1 bar in 4/4 = 4 Ableton beats
    );
  });

  it("should round up to next bar based on latest note start in 4/4", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "C4 1|4.5", // Note starts at beat 3.5 (0-based), which is in bar 1, rounds up to 1 bar
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      4, // Rounds up to 1 bar = 4 Ableton beats
    );
  });

  it("should round up to next bar based on latest note start in 6/8", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 6, signature_denominator: 8 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "C4 1|5.5", // Note starts at beat 4.5 in musical beats (2.25 Ableton beats), rounds up to 1 bar
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      3, // Rounds up to 1 bar in 6/8 = 3 Ableton beats
    );
  });

  it("should round up to next bar when note start is in next bar", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "C4 2|1", // Note starts at bar 2, beat 1 (beat 4 in 0-based), rounds up to 2 bars
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      8, // Rounds up to 2 bars = 8 Ableton beats
    );
  });
});
