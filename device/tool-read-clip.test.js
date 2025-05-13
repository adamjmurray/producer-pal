// device/tool-read-clip.test.js
import { describe, expect, it } from "vitest";
import { children, liveApiCall, liveApiId, mockLiveApiGet } from "./mock-live-api";
import {
  convertClipNotesToToneLang,
  convertDrumClipNotesToToneLang,
  midiPitchToNoteName,
  readClip,
} from "./tool-read-clip";

describe("readClip", () => {
  it("returns clip information when a valid MIDI clip exists", () => {
    liveApiCall.mockImplementation((method) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            { note_id: 1, pitch: 60, start_time: 0, duration: 1, velocity: 70 },
            { note_id: 2, pitch: 62, start_time: 1, duration: 1, velocity: 70 },
            { note_id: 3, pitch: 64, start_time: 2, duration: 1, velocity: 70 },
          ],
        });
      }
      return null;
    });

    const result = readClip({ trackIndex: 1, clipSlotIndex: 1 });
    expect(result).toEqual({
      id: "1",
      name: "Test Clip",
      type: "midi",
      clipSlotIndex: 1,
      trackIndex: 1,
      location: "session",
      color: "#3DC300",
      length: 4,
      loop: false,
      start_marker: 1,
      end_marker: 5,
      loop_start: 1,
      loop_end: 5,
      is_playing: false,
      notes: "C3 D3 E3",
      noteCount: 3,
    });
  });

  it("returns null values when no clip exists", () => {
    liveApiId.mockReturnValue("id 0");
    const result = readClip({ trackIndex: 2, clipSlotIndex: 3 });
    expect(result).toEqual({
      id: null,
      type: null,
      name: null,
      trackIndex: 2,
      clipSlotIndex: 3,
    });
  });

  it("handles audio clips correctly", () => {
    mockLiveApiGet({
      Clip: { is_midi_clip: 0, name: "Audio Sample", looping: 1 },
    });
    const result = readClip({ trackIndex: 0, clipSlotIndex: 0 });
    expect(result).toEqual({
      id: "1",
      name: "Audio Sample",
      type: "audio",
      clipSlotIndex: 0,
      trackIndex: 0,
      location: "session",
      color: "#3DC300",
      length: 4,
      loop: true,
      start_marker: 1,
      end_marker: 5,
      loop_start: 1,
      loop_end: 5,
      is_playing: false,
    });
  });

  it("detects drum tracks and uses the drum-specific ToneLang conversion", () => {
    mockLiveApiGet({
      Track: { devices: children("drumRack") },
      drumRack: { can_have_drum_pads: 1 },
      Clip: { is_midi_clip: 1 },
    });

    liveApiCall.mockImplementation((method) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            { note_id: 1, pitch: 36, start_time: 0, duration: 0.25, velocity: 100 },
            { note_id: 2, pitch: 38, start_time: 1, duration: 0.25, velocity: 90 },
            { note_id: 3, pitch: 36, start_time: 2, duration: 0.25, velocity: 100 },
            { note_id: 4, pitch: 38, start_time: 3, duration: 0.25, velocity: 90 },
          ],
        });
      }
      return null;
    });

    const result = readClip({ trackIndex: 0, clipSlotIndex: 0 });

    expect(result).toEqual({
      id: "1",
      type: "midi",
      location: "session",
      name: "Test Clip",
      trackIndex: 0,
      clipSlotIndex: 0,
      color: "#3DC300",
      length: 4,
      start_marker: 1,
      end_marker: 5,
      loop: false,
      loop_end: 5,
      loop_start: 1,
      is_playing: false,
      noteCount: 4,
      notes: "C1v100n0.25t2 C1v100n0.25; D1v90n0.25t2 D1v90n0.25",
    });
  });
});

describe("convertClipNotesToToneLang", () => {
  it("formats overlapping notes as multiple voices", () => {
    const clipNotes = [
      { pitch: 60, start_time: 0, duration: 2, velocity: 70 }, // C3 long note
      { pitch: 64, start_time: 1, duration: 1, velocity: 70 }, // E3 overlaps with C3
      { pitch: 67, start_time: 2, duration: 1, velocity: 70 }, // G3 after C3
    ];

    const result = convertClipNotesToToneLang(clipNotes);

    expect(result).toBe("C3n2t1 E3 G3");
  });

  it("prefers to keep notes in the same voice when possible", () => {
    const clipNotes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 }, // C3
      { pitch: 62, start_time: 1, duration: 1, velocity: 70 }, // D3
      { pitch: 64, start_time: 0, duration: 1, velocity: 70 }, // E3 (same time as C3)
      { pitch: 65, start_time: 1, duration: 1, velocity: 70 }, // F3 (same time as D3)
      { pitch: 67, start_time: 2, duration: 1, velocity: 70 }, // G3
    ];

    const result = convertClipNotesToToneLang(clipNotes);

    expect(result).toBe("[C3 E3] [D3 F3] G3");
  });

  it("formats overlapping notes using t syntax", () => {
    const clipNotes = [
      { pitch: 60, start_time: 0, duration: 2, velocity: 70 }, // C3 long note
      { pitch: 64, start_time: 1, duration: 1, velocity: 70 }, // E3 overlaps with C3
      { pitch: 67, start_time: 2, duration: 1, velocity: 70 }, // G3 after C3
    ];

    const result = convertClipNotesToToneLang(clipNotes);
    expect(result).toBe("C3n2t1 E3 G3");
  });

  it("forms chords for notes with the same start time", () => {
    const clipNotes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 70 }, // C3
      { pitch: 64, start_time: 0, duration: 1, velocity: 70 }, // E3
      { pitch: 67, start_time: 1, duration: 1, velocity: 70 }, // G3
    ];

    const result = convertClipNotesToToneLang(clipNotes);
    expect(result).toBe("[C3 E3] G3");
  });

  it("handles complex timing with multiple overlapping notes", () => {
    const clipNotes = [
      { pitch: 60, start_time: 0, duration: 4, velocity: 70 }, // C3 long note
      { pitch: 64, start_time: 1, duration: 2, velocity: 70 }, // E3 starts during C3
      { pitch: 67, start_time: 3, duration: 2, velocity: 70 }, // G3 starts during C3 and E3
      { pitch: 71, start_time: 6, duration: 1, velocity: 70 }, // B3 after all previous notes
    ];

    const result = convertClipNotesToToneLang(clipNotes);
    expect(result).toBe("C3n4t1 E3n2 G3n2t3 B3");
  });
});

describe("convertDrumClipNotesToToneLang", () => {
  it("returns empty string for empty or null input", () => {
    expect(convertDrumClipNotesToToneLang([])).toBe("");
    expect(convertDrumClipNotesToToneLang(null)).toBe("");
    expect(convertDrumClipNotesToToneLang(undefined)).toBe("");
  });

  it("formats a single drum pad with single hit", () => {
    const clipNotes = [{ pitch: 36, start_time: 0, duration: 0.25, velocity: 100 }];

    const result = convertDrumClipNotesToToneLang(clipNotes);
    expect(result).toBe("C1v100n0.25");
  });

  it("formats a single drum pad with multiple hits", () => {
    const clipNotes = [
      { pitch: 36, start_time: 0, duration: 0.25, velocity: 100 },
      { pitch: 36, start_time: 1, duration: 0.25, velocity: 80 },
      { pitch: 36, start_time: 2, duration: 0.25, velocity: 120 },
    ];

    const result = convertDrumClipNotesToToneLang(clipNotes);
    expect(result).toBe("C1v100n0.25t1 C1v80n0.25t1 C1v120n0.25");
  });

  it("formats multiple drum pads as separate voices", () => {
    const clipNotes = [
      // Kick (36)
      { pitch: 36, start_time: 0, duration: 0.25, velocity: 100 },
      { pitch: 36, start_time: 2, duration: 0.25, velocity: 100 },
      // Snare (38)
      { pitch: 38, start_time: 1, duration: 0.25, velocity: 90 },
      { pitch: 38, start_time: 3, duration: 0.25, velocity: 90 },
      // Hi-hat (42)
      { pitch: 42, start_time: 0.5, duration: 0.25, velocity: 70 },
      { pitch: 42, start_time: 1.5, duration: 0.25, velocity: 70 },
      { pitch: 42, start_time: 2.5, duration: 0.25, velocity: 70 },
      { pitch: 42, start_time: 3.5, duration: 0.25, velocity: 70 },
    ];

    const result = convertDrumClipNotesToToneLang(clipNotes);
    // Expect three voices separated by semicolons (kick, snare, hi-hat) in pitch order
    expect(result).toBe(
      "C1v100n0.25t2 C1v100n0.25; D1v90n0.25t2 D1v90n0.25; F#1n0.25t1 F#1n0.25t1 F#1n0.25t1 F#1n0.25"
    );
  });

  it("handles varying durations and timings correctly", () => {
    const clipNotes = [
      // Kick with varying durations
      { pitch: 36, start_time: 0, duration: 0.5, velocity: 100 },
      { pitch: 36, start_time: 2, duration: 0.25, velocity: 100 },
      // Snare with varying timings (not on standard beats)
      { pitch: 38, start_time: 1.25, duration: 0.25, velocity: 90 },
      { pitch: 38, start_time: 3.75, duration: 0.25, velocity: 90 },
    ];

    const result = convertDrumClipNotesToToneLang(clipNotes);
    expect(result).toBe("C1v100n0.5t2 C1v100n0.25; D1v90n0.25t2.5 D1v90n0.25");
  });

  it("groups notes by pitch even when interleaved in time", () => {
    const clipNotes = [
      // Totally mixed up order
      { pitch: 36, start_time: 0, duration: 0.25, velocity: 100 },
      { pitch: 38, start_time: 1, duration: 0.25, velocity: 90 },
      { pitch: 36, start_time: 2, duration: 0.25, velocity: 100 },
      { pitch: 38, start_time: 3, duration: 0.25, velocity: 90 },
    ];

    const result = convertDrumClipNotesToToneLang(clipNotes);
    expect(result).toBe("C1v100n0.25t2 C1v100n0.25; D1v90n0.25t2 D1v90n0.25");
  });
});

describe("midiPitchToNoteName", () => {
  it("converts MIDI pitches to note names", () => {
    expect(midiPitchToNoteName(60)).toBe("C3"); // Middle C
    expect(midiPitchToNoteName(61)).toBe("C#3");
    expect(midiPitchToNoteName(72)).toBe("C4");
  });
});
