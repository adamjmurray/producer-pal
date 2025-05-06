// device/read-clip.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";

// Setup mock implementation
const mockLiveApiCall = vi.fn();
const mockLiveApiGet = vi.fn();

// Mock LiveAPI class
class MockLiveAPI {
  constructor(path) {
    this.path = path;
    this.unquotedpath = path;
    this.call = mockLiveApiCall;
    this.get = mockLiveApiGet;
  }
}

// Setup for tests
beforeEach(() => {
  // Reset mocks
  mockLiveApiCall.mockReset();
  mockLiveApiGet.mockReset();

  // Default behavior
  mockLiveApiGet.mockImplementation((prop) => {
    if (prop === "has_clip") return [1];
    if (prop === "is_midi_clip") return [1];
    if (prop === "name") return ["Test Clip"];
    if (prop === "length") return [4];
    if (prop === "looping") return [0];
    return [0];
  });

  // Stub global
  vi.stubGlobal("LiveAPI", MockLiveAPI);
});

// Import module under test
const { readClip, convertClipNotesToToneLang, midiPitchToNoteName } = require("./read-clip");

describe("readClip", () => {
  it("returns clip information when a valid MIDI clip exists", () => {
    // Mock the get_notes_extended call
    mockLiveApiCall.mockImplementation((method) => {
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

    const result = readClip({ trackIndex: 0, clipSlotIndex: 0 });

    expect(result.success).toBe(true);
    expect(result.trackIndex).toBe(0);
    expect(result.clipSlotIndex).toBe(0);
    expect(result.type).toBe("midi");
    expect(result.name).toBe("Test Clip");
    expect(result.length).toBe(4);
    expect(result.loop).toBe(false);
    expect(result.notes).toBe("C3 D3 E3");
    expect(result.noteCount).toBe(3);
  });

  it("returns null values when no clip exists", () => {
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "has_clip") return [0];
      return [0];
    });

    const result = readClip({ trackIndex: 0, clipSlotIndex: 0 });
    expect(result.success).toBe(true);
    expect(result.type).toBeNull();
    expect(result.name).toBeNull();
    expect(result.notes).toBeNull();
  });

  it("handles audio clips correctly", () => {
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "has_clip") return [1];
      if (prop === "is_midi_clip") return [0]; // Not a MIDI clip
      if (prop === "name") return ["Audio Sample"];
      if (prop === "length") return [8];
      if (prop === "looping") return [1];
      return [0];
    });

    const result = readClip({ trackIndex: 0, clipSlotIndex: 0 });

    expect(result.success).toBe(true);
    expect(result.type).toBe("audio");
    expect(result.name).toBe("Audio Sample");
    expect(result.loop).toBe(true);
    expect(result.notes).toBeNull();
    expect(result.noteCount).toBeNull();
  });

  it("returns error information when an exception occurs", () => {
    // Force an error
    mockLiveApiGet.mockImplementation(() => {
      throw new Error("Test error");
    });

    const result = readClip({ trackIndex: 0, clipSlotIndex: 0 });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Test error");
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
