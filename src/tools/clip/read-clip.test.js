import { describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiType,
  mockLiveApiGet,
} from "../../test/mock-live-api";
import { readClip } from "./read-clip";

describe("readClip", () => {
  it("returns clip information when a valid MIDI clip exists (4/4 time)", () => {
    liveApiCall.mockImplementation(function (method) {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              note_id: 1,
              pitch: 60,
              start_time: 0,
              duration: 1,
              velocity: 100,
              probability: 1.0,
              velocity_deviation: 0,
            },
            {
              note_id: 2,
              pitch: 62,
              start_time: 1,
              duration: 1,
              velocity: 100,
              probability: 1.0,
              velocity_deviation: 0,
            },
            {
              note_id: 3,
              pitch: 64,
              start_time: 2,
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
      "live_set/tracks/1/clip_slots/1/clip": {
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4, // Ableton beats
        start_marker: 1,
        end_marker: 5,
        loop_start: 1,
        loop_end: 5,
      },
    });

    const result = readClip({ trackIndex: 1, sceneIndex: 1 });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 1 clip_slots 1 clip" }),
      "get_notes_extended",
      0,
      128,
      0,
      4,
    );

    expect(result).toEqual({
      id: "live_set/tracks/1/clip_slots/1/clip",
      name: "Test Clip",
      type: "midi",
      sceneIndex: 1,
      trackIndex: 1,
      view: "session",
      length: "1:0", // 1 bar duration (from Live API)
      loop: false,
      startMarker: "1|2", // 1 Ableton beat = bar 1 beat 2 in 4/4
      // loopStart omitted when it equals startMarker
      timeSignature: "4/4",
      notes: "C3 1|1 D3 1|2 E3 1|3", // Real bar|beat output
      noteCount: 3,
    });
  });

  it("returns clip information when a valid MIDI clip exists (6/8 time)", () => {
    liveApiCall.mockImplementation(function (method) {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            {
              note_id: 1,
              pitch: 60,
              start_time: 0,
              duration: 1,
              velocity: 100,
              probability: 1.0,
              velocity_deviation: 0,
            },
            {
              note_id: 2,
              pitch: 62,
              start_time: 1,
              duration: 1,
              velocity: 100,
              probability: 1.0,
              velocity_deviation: 0,
            },
            {
              note_id: 3,
              pitch: 64,
              start_time: 2,
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
      "live_set/tracks/1/clip_slots/1/clip": {
        signature_numerator: 6,
        signature_denominator: 8,
        length: 4, // Ableton beats
        start_marker: 1,
        end_marker: 5,
        loop_start: 1,
        loop_end: 5,
      },
    });

    const result = readClip({ trackIndex: 1, sceneIndex: 1 });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 1 clip_slots 1 clip" }),
      "get_notes_extended",
      0,
      128,
      0,
      4,
    );

    expect(result).toEqual({
      id: "live_set/tracks/1/clip_slots/1/clip",
      name: "Test Clip",
      type: "midi",
      sceneIndex: 1,
      trackIndex: 1,
      view: "session",
      length: "1:2", // 1 bar + 2 beats (4 Ableton beats in 6/8)
      loop: false,
      startMarker: "1|3", // 1 Ableton beat = 2 musical beats = bar 1 beat 3 in 6/8
      // loopStart omitted when it equals startMarker
      timeSignature: "6/8",
      notes: "C3 1|1 D3 1|3 E3 1|5", // Real bar|beat output in 6/8
      noteCount: 3,
    });
  });

  it("should format notes using clip's time signature", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 1,
        signature_numerator: 3,
        signature_denominator: 4,
        length: 4, // Ableton beats
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
              pitch: 62,
              start_time: 3,
              duration: 1,
              velocity: 100,
              probability: 1.0,
              velocity_deviation: 0,
            }, // Start of bar 2 in 3/4
            {
              pitch: 64,
              start_time: 4,
              duration: 1,
              velocity: 100,
              probability: 1.0,
              velocity_deviation: 0,
            }, // bar 2, beat 2
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

    // In 3/4 time, beat 3 should be bar 2 beat 1
    expect(result.notes).toBe("C3 1|1 D3 2|1 E3 2|2");
    expect(result.timeSignature).toBe("3/4");
    expect(result.length).toBe("1:1"); // 4 Ableton beats = 1 bar + 1 beat in 3/4
  });

  it("should format notes using clip's time signature with Ableton quarter-note conversion", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 1,
        signature_numerator: 6,
        signature_denominator: 8,
        length: 3, // Ableton beats
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
              pitch: 62,
              start_time: 3,
              duration: 1,
              velocity: 100,
              probability: 1.0,
              velocity_deviation: 0,
            }, // Start of bar 2 in 6/8 (3 quarter notes)
            {
              pitch: 64,
              start_time: 3.5,
              duration: 1,
              velocity: 100,
              probability: 1.0,
              velocity_deviation: 0,
            }, // bar 2, beat 2
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
      3,
    );

    // In 6/8 time with Ableton's quarter-note beats, beat 3 should be bar 2 beat 1
    expect(result.notes).toBe("C3 1|1 D3 2|1 E3 2|2");
    expect(result.timeSignature).toBe("6/8");
    expect(result.length).toBe("1:0"); // 3 Ableton beats = 1 bar in 6/8
  });

  it("returns null values when no clip exists", () => {
    liveApiId.mockReturnValue("id 0");
    const result = readClip({ trackIndex: 2, sceneIndex: 3 });
    expect(result).toEqual({
      id: null,
      type: null,
      name: null,
      trackIndex: 2,
      sceneIndex: 3,
    });
  });

  it("handles audio clips correctly", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 0,
        name: "Audio Sample",
        looping: 1,
        is_playing: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4, // Ableton beats
        start_marker: 1,
        end_marker: 5,
        loop_start: 1,
        loop_end: 5,
      },
    });
    const result = readClip({ trackIndex: 0, sceneIndex: 0 });
    expect(result).toEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      name: "Audio Sample",
      type: "audio",
      sceneIndex: 0,
      trackIndex: 0,
      view: "session",
      length: "1:0", // 1 bar (from Live API)
      loop: true,
      startMarker: "1|2",
      // loopStart omitted when it equals startMarker
      playing: true,
      timeSignature: "4/4",
      gain: 0,
      gainDisplay: 0,
      pitchShift: 0,
      sampleLength: 0,
      sampleRate: 0,
    });
  });

  it("reads a session clip by ID", () => {
    mockLiveApiGet({
      session_clip_id: {
        is_arrangement_clip: 0,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        start_marker: 1,
        end_marker: 5,
        loop_start: 1,
        loop_end: 5,
      },
    });

    liveApiPath.mockImplementation(function () {
      if (this._id === "session_clip_id") {
        return "live_set tracks 2 clip_slots 4 clip";
      }
      return this._path;
    });

    const result = readClip({ clipId: "id session_clip_id" });
    expect(result.id).toBe("session_clip_id");
    expect(result.trackIndex).toBe(2);
    expect(result.sceneIndex).toBe(4);
    expect(result.view).toBe("session");
    expect(result.length).toBe("1:0");
    expect(result.startMarker).toBe("1|2");
  });

  it("reads an Arrangement clip by ID using song time signature for arrangementStartTime", () => {
    mockLiveApiGet({
      arrangement_clip_id: {
        is_arrangement_clip: 1,
        start_time: 16.0, // Ableton beats
        signature_numerator: 6, // Clip is in 6/8
        signature_denominator: 8,
        length: 4,
        start_marker: 1,
        end_marker: 5,
        loop_start: 1,
        loop_end: 5,
      },
      LiveSet: {
        signature_numerator: 4, // Song is in 4/4
        signature_denominator: 4,
      },
    });

    liveApiPath.mockImplementation(function () {
      if (this._id === "arrangement_clip_id") {
        return "live_set tracks 3 arrangement_clips 2";
      }
      return this._path;
    });

    liveApiType.mockImplementation(function () {
      if (this._id === "arrangement_clip_id") {
        return "Clip";
      }
      return this._type;
    });

    const result = readClip({ clipId: "id arrangement_clip_id" });
    expect(result.id).toBe("arrangement_clip_id");
    expect(result.view).toBe("arrangement");
    expect(result.trackIndex).toBe(3);
    expect(result.sceneIndex).toBeUndefined();
    // arrangementStartTime uses song time signature (4/4), so 16 Ableton beats = bar 5 beat 1
    expect(result.arrangementStartTime).toBe("5|1");
    // But clip properties use clip time signature (6/8)
    expect(result.timeSignature).toBe("6/8");
    expect(result.length).toBe("1:2"); // 4 Ableton beats = 1 bar + 2 beats in 6/8
    expect(result.startMarker).toBe("1|3"); // Uses clip time signature and needs to compensate for Ableton using quarter note beats instead of musical beats that respect the time signature
  });

  it("throws an error when neither clipId nor trackIndex+sceneIndex are provided", () => {
    expect(() => readClip({})).toThrow(
      "Either clipId or both trackIndex and sceneIndex must be provided",
    );
    expect(() => readClip({ trackIndex: 1 })).toThrow(
      "Either clipId or both trackIndex and sceneIndex must be provided",
    );
    expect(() => readClip({ sceneIndex: 1 })).toThrow(
      "Either clipId or both trackIndex and sceneIndex must be provided",
    );
  });

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

    expect(result).toEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      type: "midi",
      view: "session",
      name: "Test Clip",
      trackIndex: 0,
      sceneIndex: 0,
      length: "1:0",
      startMarker: "1|2",
      loop: false,
      // loopStart omitted when it equals startMarker
      triggered: true,
      timeSignature: "4/4",
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
        length: 4,
        start_marker: 0,
        loop_start: 0,
      },
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0, include: [] });

    expect(result).toEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      type: "midi",
      // name omitted when empty
      sceneIndex: 0,
      trackIndex: 0,
      view: "session",
      length: "1:0",
      // startMarker omitted when "1|1"
      // loopStart omitted when it equals startMarker
      loop: false,
      timeSignature: "4/4",
      noteCount: 0,
    });
  });

  it("omits startMarker when 1|1", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 8,
        start_marker: 0, // "1|1"
        loop_start: 4,
      },
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0, include: [] });

    expect(result.startMarker).toBeUndefined(); // Omitted when "1|1"
    expect(result.loopStart).toBe("2|1"); // Included because it differs from startMarker
  });

  it("includes startMarker when not 1|1", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 8,
        start_marker: 4, // "2|1" - not the default
        loop_start: 4,
      },
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0, include: [] });

    expect(result.startMarker).toBe("2|1"); // Included because it's not "1|1"
    expect(result.loopStart).toBeUndefined(); // Omitted because it equals startMarker
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
      include: ["clip-notes", "color"],
    });

    // Results should be identical
    expect(resultWildcard).toEqual(resultExplicit);

    // Verify key properties are included
    expect(resultWildcard).toEqual(
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

    expect(result).toEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      name: "Test Clip",
      type: "midi",
      sceneIndex: 0,
      trackIndex: 0,
      view: "session",
      length: "1:0",
      loop: false,
      timeSignature: "4/4",
      notes: "G8 1|1",
      noteCount: 1,
    });
  });
});
