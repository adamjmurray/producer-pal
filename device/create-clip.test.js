// device/create-clip.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

// Setup and teardown for tests
beforeEach(() => {
  // Default behavior for has_clip check
  mockLiveApiGet.mockImplementation((prop) => {
    if (prop === "has_clip") return [0];
    return [0];
  });

  // Stub global
  vi.stubGlobal("LiveAPI", MockLiveAPI);
});

afterEach(() => {
  vi.clearAllMocks();
});

// Import module under test (after stubbing global)
const { createClip } = require("./create-clip");

describe("createClip", () => {
  it("should create an empty clip when no notes are provided", () => {
    // Arrange
    const args = { track: 0, clipSlot: 0 };

    // Act
    const result = createClip(args);

    // Assert
    expect(result).toContain("Created empty clip");
    // TODO: assert correct clip slot was used by asserting on the LiveAPI constructor calls
    expect(mockLiveApiCall).toHaveBeenCalledWith("create_clip", expect.any(Number));
  });

  it("should create a clip with notes when a valid notation string is provided", () => {
    // Arrange
    const args = {
      track: 1,
      clipSlot: 2,
      notes: "C3 E3 G3",
      duration: 0.5,
    };

    // Act
    const result = createClip(args);

    // Assert
    expect(result).toContain("Created clip with");
    expect(mockLiveApiCall).toHaveBeenCalledWith("create_clip", expect.any(Number));

    // Second call should be add_new_notes with notes
    const addNotesCall = mockLiveApiCall.mock.calls[1];
    expect(addNotesCall[0]).toBe("add_new_notes");
    expect(addNotesCall[1].notes.length).toBe(3);

    // Verify note properties
    const firstNote = addNotesCall[1].notes[0];
    expect(firstNote.pitch).toBe(60); // C3 is MIDI pitch 60
    expect(firstNote.duration).toBe(0.5);
  });

  it("should create a clip with chord notes when brackets are used", () => {
    // Arrange
    const args = {
      track: 0,
      clipSlot: 0,
      notes: "[C3 E3 G3] [F3 A3 C4]",
      duration: 1.0,
    };

    // Act
    const result = createClip(args);

    // Assert
    expect(result).toContain("Created clip with");

    // Should have created 6 notes (3 per chord)
    const addNotesCall = mockLiveApiCall.mock.calls[1];
    expect(addNotesCall[1].notes.length).toBe(6);

    // First chord notes should start at the same time
    const firstChordNotes = addNotesCall[1].notes.slice(0, 3);
    expect(firstChordNotes.every((n) => n.start_time === 0)).toBe(true);

    // Second chord notes should start at duration 1.0
    const secondChordNotes = addNotesCall[1].notes.slice(3, 6);
    expect(secondChordNotes.every((n) => n.start_time === 1.0)).toBe(true);
  });

  it("should throw an error if clip slot already has a clip", () => {
    // Override for this test only
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "has_clip") return [1];
      return [0];
    });

    // Act & Assert
    expect(() => createClip({ track: 0, clipSlot: 0 })).toThrow(/Clip slot already has a clip/);
  });
});

describe("note parsing helpers", () => {
  it("should correctly parse note names to MIDI pitches", () => {
    // Reset has_clip for this test
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "has_clip") return [0];
      return [0];
    });

    const args = {
      track: 0,
      clipSlot: 0,
      notes: "C3 D#3 Eb3 G#3 Ab3 B3",
    };

    const result = createClip(args);

    // Get the added notes from the call
    const addNotesCall = mockLiveApiCall.mock.calls[1];
    const notes = addNotesCall[1].notes;

    // Verify pitch values
    expect(notes[0].pitch).toBe(60); // C3
    expect(notes[1].pitch).toBe(63); // D#3
    expect(notes[2].pitch).toBe(63); // Eb3 (same as D#3)
    expect(notes[3].pitch).toBe(68); // G#3
    expect(notes[4].pitch).toBe(68); // Ab3 (same as G#3)
    expect(notes[5].pitch).toBe(71); // B3
  });
});
