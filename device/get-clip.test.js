// device/get-clip.test.js
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

  // Default behavior for has_clip
  mockLiveApiGet.mockImplementation((prop) => {
    if (prop === "has_clip") return [1];
    if (prop === "is_midi_clip") return [1];
    if (prop === "name") return ["Test Clip"];
    if (prop === "length") return [4];
    return [0];
  });

  // Stub global
  vi.stubGlobal("LiveAPI", MockLiveAPI);
});

// Import module under test (after stubbing global)
const { getClip, convertClipNotesToToneLang, midiPitchToNoteName } = require("./get-clip");

describe("midiPitchToNoteName", () => {
  it("converts MIDI pitches to note names", () => {
    expect(midiPitchToNoteName(60)).toBe("C3"); // Middle C
    expect(midiPitchToNoteName(61)).toBe("C#3");
    expect(midiPitchToNoteName(62)).toBe("D3");
    expect(midiPitchToNoteName(72)).toBe("C4");
    expect(midiPitchToNoteName(48)).toBe("C2");
  });
});

describe("convertClipNotesToToneLang", () => {
  it("converts single notes to ToneLang format", () => {
    const notes = [{ pitch: 60, start_time: 0, duration: 1, velocity: 100 }];

    expect(convertClipNotesToToneLang(notes)).toBe("C3");
  });

  it("converts multiple notes to ToneLang format", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 1, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 2, duration: 1, velocity: 100 },
    ];

    expect(convertClipNotesToToneLang(notes)).toBe("C3 D3 E3");
  });

  it("converts notes with velocity to ToneLang format", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 80 },
      { pitch: 62, start_time: 1, duration: 1, velocity: 120 },
    ];

    expect(convertClipNotesToToneLang(notes)).toBe("C3:v80 D3:v120");
  });

  it("converts notes with duration to ToneLang format", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 2, velocity: 100 },
      { pitch: 62, start_time: 2, duration: 0.5, velocity: 100 },
    ];

    expect(convertClipNotesToToneLang(notes)).toBe("C3*2 D3/2");
  });

  it("identifies chords and formats them correctly", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 67, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 1, duration: 1, velocity: 100 },
    ];

    expect(convertClipNotesToToneLang(notes)).toBe("[C3 E3 G3] D3");
  });

  it("identifies and adds rests between notes", () => {
    const notes = [
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 2, duration: 1, velocity: 100 },
    ];

    expect(convertClipNotesToToneLang(notes)).toBe("C3 R D3");
  });

  it("handles the example C major scale with eighth notes", () => {
    const notes = [
      {
        note_id: 1,
        pitch: 60,
        start_time: 0,
        duration: 0.5,
        velocity: 100,
        mute: 0,
        probability: 1,
        velocity_deviation: 0,
        release_velocity: 64,
      },
      {
        note_id: 2,
        pitch: 62,
        start_time: 0.5,
        duration: 0.5,
        velocity: 100,
        mute: 0,
        probability: 1,
        velocity_deviation: 0,
        release_velocity: 64,
      },
      {
        note_id: 3,
        pitch: 64,
        start_time: 1,
        duration: 0.5,
        velocity: 100,
        mute: 0,
        probability: 1,
        velocity_deviation: 0,
        release_velocity: 64,
      },
      {
        note_id: 4,
        pitch: 65,
        start_time: 1.5,
        duration: 0.5,
        velocity: 100,
        mute: 0,
        probability: 1,
        velocity_deviation: 0,
        release_velocity: 64,
      },
      {
        note_id: 5,
        pitch: 67,
        start_time: 2,
        duration: 0.5,
        velocity: 100,
        mute: 0,
        probability: 1,
        velocity_deviation: 0,
        release_velocity: 64,
      },
      {
        note_id: 6,
        pitch: 69,
        start_time: 2.5,
        duration: 0.5,
        velocity: 100,
        mute: 0,
        probability: 1,
        velocity_deviation: 0,
        release_velocity: 64,
      },
      {
        note_id: 7,
        pitch: 71,
        start_time: 3,
        duration: 0.5,
        velocity: 100,
        mute: 0,
        probability: 1,
        velocity_deviation: 0,
        release_velocity: 64,
      },
      {
        note_id: 8,
        pitch: 72,
        start_time: 3.5,
        duration: 0.5,
        velocity: 100,
        mute: 0,
        probability: 1,
        velocity_deviation: 0,
        release_velocity: 64,
      },
    ];

    expect(convertClipNotesToToneLang(notes)).toBe("C3/2 D3/2 E3/2 F3/2 G3/2 A3/2 B3/2 C4/2");
  });

  it("handles empty or null input", () => {
    expect(convertClipNotesToToneLang([])).toBe("");
    expect(convertClipNotesToToneLang(null)).toBe("");
  });
});

describe("getClip", () => {
  it("returns clip information when a valid MIDI clip exists", () => {
    // Mock the get_notes_extended call
    mockLiveApiCall.mockImplementation((method, ...args) => {
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

    const result = getClip({ track: 0, clipSlot: 0 });

    expect(result.name).toBe("Test Clip");
    expect(result.length).toBe(4);
    expect(result.notes).toBe("C3 D3 E3");
    expect(result.noteCount).toBe(3);
  });

  it("returns null values when no clip exists", () => {
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "has_clip") return [0];
      return [0];
    });

    const result = getClip({ track: 0, clipSlot: 0 });
    expect(result).toEqual({
      type: null,
      name: null,
      length: null,
      notes: null,
      noteCount: null,
    });
  });

  it("handles audio clips correctly", () => {
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "has_clip") return [1];
      if (prop === "is_midi_clip") return [0]; // Not a MIDI clip
      if (prop === "name") return ["Audio Sample"];
      if (prop === "length") return [8];
      return [0];
    });

    const result = getClip({ track: 0, clipSlot: 0 });

    expect(result).toEqual({
      type: "audio",
      name: "Audio Sample",
      length: 8,
      notes: null,
      noteCount: null,
    });
  });

  // Also update the MIDI clip test to check for the type property
  it("returns clip information when a valid MIDI clip exists", () => {
    // Mock the get_notes_extended call
    mockLiveApiCall.mockImplementation((method, ...args) => {
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

    const result = getClip({ track: 0, clipSlot: 0 });

    expect(result.type).toBe("midi");
    expect(result.name).toBe("Test Clip");
    expect(result.length).toBe(4);
    expect(result.notes).toBe("C3 D3 E3");
    expect(result.noteCount).toBe(3);
  });
});
