import { describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import { readClip } from "./read-clip.js";

describe("readClip", () => {
  // E2E test with real bar|beat notation
  it("detects drum tracks and uses the drum-specific notation conversion (e2e)", () => {
    mockLiveApiGet({
      Track: { devices: children("drumRack") },
      drumRack: { can_have_drum_pads: 1 },
      Clip: {
        is_midi_clip: 1,
        is_triggered: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        start_marker: 1,
        end_marker: 5,
        loop_start: 1,
        loop_end: 5,
      },
    });

    liveApiCall.mockImplementation((method) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              note_id: 1,
              pitch: 36,
              start_time: 0,
              duration: 0.25,
              velocity: 100,
              probability: 1.0,
              velocity_deviation: 0,
            },
            {
              note_id: 2,
              pitch: 38,
              start_time: 1,
              duration: 0.25,
              velocity: 90,
              probability: 1.0,
              velocity_deviation: 0,
            },
            {
              note_id: 3,
              pitch: 36,
              start_time: 2,
              duration: 0.25,
              velocity: 100,
              probability: 1.0,
              velocity_deviation: 0,
            },
            {
              note_id: 4,
              pitch: 38,
              start_time: 3,
              duration: 0.25,
              velocity: 90,
              probability: 1.0,
              velocity_deviation: 0,
            },
          ],
        });
      }

      return null;
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0 });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0 clip" }),
      "get_notes_extended",
      0,
      128,
      0,
      4,
    );

    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      type: "midi",
      view: "session",
      name: "Test Clip",
      trackIndex: 0,
      sceneIndex: 0,
      timeSignature: "4/4",
      looping: false,
      start: "1|2",
      end: "2|2", // end_marker (5 beats = 2|2)
      length: "1:0",
      triggered: true,
      noteCount: 4,
      notes: "t0.25 C1 1|1 v90 D1 1|2 v100 C1 1|3 v90 D1 1|4",
    });
  });

  it("omits name when empty string", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 1,
        name: "",
        signature_numerator: 4,
        signature_denominator: 4,
        length: 5,
        start_marker: 1,
        loop_start: 1,
        loop_end: 6,
        end_marker: 6,
        looping: 0,
      },
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0, include: [] });

    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      type: "midi",
      // name omitted when empty
      sceneIndex: 0,
      trackIndex: 0,
      view: "session",
      timeSignature: "4/4",
      looping: false,
      start: "1|2",
      end: "2|3",
      length: "1:1",
      noteCount: 0,
    });
  });

  it("omits firstStart when it equals start", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 8,
        start_marker: 4, // "2|1" - same as loop_start
        loop_start: 4, // "2|1"
        loop_end: 12,
        end_marker: 12,
        looping: 1,
      },
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0, include: [] });

    expect(result.start).toBe("2|1");
    expect(result.firstStart).toBeUndefined(); // Omitted when it equals start
  });

  it("includes firstStart when it differs from start", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 16,
        start_marker: 8, // "3|1" - playback offset
        loop_start: 0, // "1|1" - loop start
        loop_end: 16,
        end_marker: 16,
        looping: 1,
      },
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0, include: [] });

    expect(result.start).toBe("1|1"); // loop_start
    expect(result.firstStart).toBe("3|1"); // Included because it differs from start
  });

  it("includes recording, overdubbing, and muted when true", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 1,
        is_recording: 1,
        is_overdubbing: 1,
        muted: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        start_marker: 0,
        loop_start: 0,
      },
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0, include: [] });

    expect(result.recording).toBe(true);
    expect(result.overdubbing).toBe(true);
    expect(result.muted).toBe(true);
  });

  it("omits recording, overdubbing, and muted when false", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 1,
        is_recording: 0,
        is_overdubbing: 0,
        muted: 0,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        start_marker: 0,
        loop_start: 0,
      },
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0, include: [] });

    expect(result.recording).toBeUndefined();
    expect(result.overdubbing).toBeUndefined();
    expect(result.muted).toBeUndefined();
  });

  it("includes all available options when '*' is used", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 1,
        name: "Wildcard Test Clip",
        looping: 1,
        is_playing: 0,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        start_marker: 1,
        end_marker: 5,
        loop_start: 1,
        loop_end: 5,
      },
    });

    liveApiCall.mockImplementation((method) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({
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
              pitch: 64,
              start_time: 2,
              duration: 1,
              velocity: 80,
              probability: 1.0,
              velocity_deviation: 0,
            },
          ],
        });
      }

      return null;
    });

    // Test with '*' - should include everything
    const resultWildcard = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["*"],
    });

    // Test explicit list with color - should produce identical result
    const resultExplicit = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["clip-notes", "color", "warp-markers"],
    });

    // Results should be identical
    expect(resultWildcard).toStrictEqual(resultExplicit);

    // Verify key properties are included
    expect(resultWildcard).toStrictEqual(
      expect.objectContaining({
        id: "live_set/tracks/0/clip_slots/0/clip",
        type: "midi",
        name: "Wildcard Test Clip",
        notes: expect.any(String),
        noteCount: 2,
      }),
    );

    // Verify notes are included
    expect(resultWildcard.notes).toBe("C3 1|1 v80 E3 1|3");
  });

  it("reads G8 (MIDI note 127) correctly by calling Live API with pitch range 0-128", () => {
    liveApiCall.mockImplementation(function (method) {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              note_id: 1,
              pitch: 127, // G8 - highest MIDI note
              start_time: 0,
              duration: 1,
              velocity: 100,
              probability: 1.0,
              velocity_deviation: 0,
            },
          ],
        });
      }

      return null;
    });
    mockLiveApiGet({
      "live_set/tracks/0/clip_slots/0/clip": {
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        start_marker: 0,
        end_marker: 4,
        loop_start: 0,
        loop_end: 4,
      },
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0 });

    // Verify get_notes_extended is called with upper bound of 128 (exclusive), not 127
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0 clip" }),
      "get_notes_extended",
      0,
      128, // Upper bound must be 128 to include note 127 (G8)
      0,
      4,
    );

    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      name: "Test Clip",
      type: "midi",
      sceneIndex: 0,
      trackIndex: 0,
      view: "session",
      timeSignature: "4/4",
      looping: false,
      start: "1|1", // start_marker (0 = 1|1)
      end: "2|1", // end_marker (4 = 2|1)
      length: "1:0",
      notes: "G8 1|1",
      noteCount: 1,
    });
  });
});
