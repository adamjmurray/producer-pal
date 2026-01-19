import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiType,
  mockLiveApiGet,
} from "#src/test/mocks/mock-live-api.js";
import { readClip } from "#src/tools/clip/read/read-clip.js";
import {
  createTestNote,
  setupMidiClipMock,
  setupNotesMock,
} from "./read-clip-test-helpers.js";

describe("readClip", () => {
  it("returns clip information when a valid MIDI clip exists (4/4 time)", () => {
    setupMidiClipMock({
      clipProps: {
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

    expect(result).toStrictEqual({
      id: "live_set/tracks/1/clip_slots/1/clip",
      name: "Test Clip",
      type: "midi",
      sceneIndex: 1,
      trackIndex: 1,
      view: "session",
      timeSignature: "4/4",
      looping: false,
      start: "1|2", // 1 Ableton beat = bar 1 beat 2 in 4/4
      end: "2|2", // end_marker (5 beats = 2|2)
      length: "1:0", // 1 bar duration
      notes: "C3 1|1 D3 1|2 E3 1|3", // Real bar|beat output
      noteCount: 3,
    });
  });

  it("returns clip information when a valid MIDI clip exists (6/8 time)", () => {
    setupMidiClipMock({
      clipProps: {
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

    expect(result).toStrictEqual({
      id: "live_set/tracks/1/clip_slots/1/clip",
      name: "Test Clip",
      type: "midi",
      sceneIndex: 1,
      trackIndex: 1,
      view: "session",
      timeSignature: "6/8",
      looping: false,
      start: "1|3", // 1 Ableton beat = 2 musical beats = bar 1 beat 3 in 6/8
      end: "2|5", // end_marker (5 beats = 2|5 in 6/8)
      length: "1:2", // 1 bar + 2 beats (4 Ableton beats in 6/8)
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

    setupNotesMock([
      createTestNote({ pitch: 60, startTime: 0 }),
      createTestNote({ pitch: 62, startTime: 3 }), // Start of bar 2 in 3/4
      createTestNote({ pitch: 64, startTime: 4 }), // bar 2, beat 2
    ]);

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
    expect(result).toHaveLength("1:1"); // 4 Ableton beats = 1 bar + 1 beat in 3/4
  });

  it("should format notes using clip's time signature with Ableton quarter-note conversion", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 1,
        signature_numerator: 6,
        signature_denominator: 8,
        length: 3, // Ableton beats
        start_marker: 0,
        end_marker: 3,
        loop_start: 0,
        loop_end: 3,
        looping: 0,
      },
    });

    setupNotesMock([
      createTestNote({ pitch: 60, startTime: 0 }),
      createTestNote({ pitch: 62, startTime: 3 }), // Start of bar 2 in 6/8 (3 quarter notes)
      createTestNote({ pitch: 64, startTime: 3.5 }), // bar 2, beat 2
    ]);

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
    expect(result).toHaveLength("1:0"); // 3 Ableton beats = 1 bar in 6/8
  });

  it("returns null values when no clip exists", () => {
    liveApiId.mockReturnValue("id 0");
    const result = readClip({ trackIndex: 2, sceneIndex: 3 });

    expect(result).toStrictEqual({
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

    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      name: "Audio Sample",
      type: "audio",
      sceneIndex: 0,
      trackIndex: 0,
      view: "session",
      timeSignature: "4/4",
      looping: true,
      start: "1|2", // loop_start
      end: "2|2", // loop_end (5 beats = 2|2)
      length: "1:0", // 1 bar
      playing: true,
      gainDb: -Infinity, // gain=0 maps to -Infinity dB
      pitchShift: 0,
      sampleLength: 0,
      sampleRate: 0,
      warpMode: "beats",
      warping: false,
    });
  });

  it("includes sampleFile with full path for audio clips with file_path", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 0,
        name: "Audio Sample",
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        file_path: "/Users/username/Music/Samples/kick.wav",
      },
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0 });

    expect(result.sampleFile).toBe("/Users/username/Music/Samples/kick.wav");
    expect(result.type).toBe("audio");
  });

  it("does not include sampleFile for MIDI clips", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 1,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
      },
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0 });

    expect(result.sampleFile).toBeUndefined();
    expect(result.type).toBe("midi");
  });

  it("does not include sampleFile for audio clips without file_path", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 0,
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        // No file_path property
      },
    });

    const result = readClip({ trackIndex: 0, sceneIndex: 0 });

    expect(result.sampleFile).toBeUndefined();
    expect(result.type).toBe("audio");
  });

  it("reads warp mode and warping state when warp-markers included", () => {
    mockLiveApiGet({
      Clip: {
        is_midi_clip: 0,
        name: "Warped Audio",
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        warp_mode: 4, // Complex mode
        warping: 1,
      },
    });
    const result = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["warp-markers"],
    });

    expect(result.warpMode).toBe("complex");
    expect(result.warping).toBe(true);
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
    expect(result).toHaveLength("1:0");
    expect(result.start).toBe("1|2");
  });

  it("reads an Arrangement clip by ID using song time signature for arrangementStart and arrangementLength", () => {
    mockLiveApiGet({
      arrangement_clip_id: {
        is_arrangement_clip: 1,
        start_time: 16.0, // Ableton beats
        end_time: 20.0, // Ableton beats (start_time + length)
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
    // arrangementStart uses song time signature (4/4), so 16 Ableton beats = bar 5 beat 1
    expect(result.arrangementStart).toBe("5|1");
    // arrangementLength also uses song time signature (4/4), so 4 Ableton beats = 1:0
    expect(result.arrangementLength).toBe("1:0");
    // But clip properties use clip time signature (6/8)
    expect(result.timeSignature).toBe("6/8");
    expect(result).toHaveLength("1:2"); // 4 Ableton beats = 1 bar + 2 beats in 6/8
    expect(result.start).toBe("1|3"); // Uses clip time signature and needs to compensate for Ableton using quarter note beats instead of musical beats that respect the time signature
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
});
