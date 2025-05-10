// device/read-clip.test.js
import { describe, it, expect } from "vitest";
import { liveApiCall, mockLiveApiGet } from "./mock-live-api";
import { readClip, convertClipNotesToToneLang, midiPitchToNoteName } from "./read-clip";

describe("readClip", () => {
  it("returns clip information when a valid MIDI clip exists", () => {
    liveApiCall.mockImplementation((method) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({
          notes: [
            { note_id: 1, pitch: 60, start_time: 0, duration: 1, velocity: 100 },
            { note_id: 2, pitch: 62, start_time: 1, duration: 1, velocity: 100 },
            { note_id: 3, pitch: 64, start_time: 2, duration: 1, velocity: 100 },
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
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
    });
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
});

describe("convertClipNotesToToneLang", () => {
  it("formats overlapping notes as multiple voices", () => {
    const clipNotes = [
      { pitch: 60, start_time: 0, duration: 2, velocity: 100 }, // C3 long note
      { pitch: 64, start_time: 1, duration: 1, velocity: 100 }, // E3 overlaps with C3
      { pitch: 67, start_time: 2, duration: 1, velocity: 100 }, // G3 after C3
    ];

    const result = convertClipNotesToToneLang(clipNotes);

    expect(result).toContain(";");

    const voices = result.split(";");
    expect(voices[0].trim()).toContain("C3*2");
    expect(voices[0].trim()).toContain("G3");
    expect(voices[1].trim()).toBe("E3");
  });

  it("prefers to keep notes in the same voice when possible", () => {
    const clipNotes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 }, // C3
      { pitch: 62, start_time: 1, duration: 1, velocity: 100 }, // D3
      { pitch: 64, start_time: 0, duration: 1, velocity: 100 }, // E3 (same time as C3)
      { pitch: 65, start_time: 1, duration: 1, velocity: 100 }, // F3 (same time as D3)
      { pitch: 67, start_time: 2, duration: 1, velocity: 100 }, // G3
    ];

    const result = convertClipNotesToToneLang(clipNotes);

    const voices = result.split(";");
    expect(voices.length).toBe(2);

    expect(voices[0].trim()).toMatch(/C3.*D3.*G3/);
    expect(voices[1].trim()).toMatch(/E3.*F3/);
  });
});

describe("midiPitchToNoteName", () => {
  it("converts MIDI pitches to note names", () => {
    expect(midiPitchToNoteName(60)).toBe("C3"); // Middle C
    expect(midiPitchToNoteName(61)).toBe("C#3");
    expect(midiPitchToNoteName(72)).toBe("C4");
  });
});
