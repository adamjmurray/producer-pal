// device/write-clip.test.js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Setup mock implementation
const mockLiveApiCall = vi.fn();
const mockLiveApiGet = vi.fn();
const mockLiveApiSet = vi.fn();

// Mock LiveAPI class
class MockLiveAPI {
  constructor(path) {
    this.path = path;
    this.unquotedpath = path;
    this.call = mockLiveApiCall;
    this.get = mockLiveApiGet;
    this.set = mockLiveApiSet;
  }
}

// Setup and teardown for tests
beforeEach(() => {
  // Default behavior for has_clip check (no clip)
  mockLiveApiGet.mockImplementation((prop) => {
    if (prop === "has_clip") return [0];
    if (prop === "name") return ["Test Clip"];
    if (prop === "length") return [4];
    return [0];
  });

  // Reset mocks
  mockLiveApiCall.mockReset();
  mockLiveApiSet.mockReset();

  // Stub global
  vi.stubGlobal("LiveAPI", MockLiveAPI);
});

afterEach(() => {
  vi.clearAllMocks();
});

// Import module under test (after stubbing global)
const { writeClip } = require("./write-clip");

describe("writeClip", () => {
  it("should create an empty clip when no notes are provided", () => {
    const args = { trackIndex: 0, clipSlotIndex: 0 };
    const result = writeClip(args);

    expect(result.success).toBe(true);
    expect(result.message).toContain("Created empty clip");
    expect(result.trackIndex).toBe(0);
    expect(result.clipSlotIndex).toBe(0);
    expect(result.noteCount).toBe(0);

    expect(mockLiveApiCall).toHaveBeenCalledWith("create_clip", expect.any(Number));
  });

  it("should set marker and loop positions when provided", () => {
    const args = {
      trackIndex: 0,
      clipSlotIndex: 0,
      start_marker: 0.5,
      end_marker: 4.5,
      loop_start: 1.0,
      loop_end: 3.0,
    };

    writeClip(args);
    expect(mockLiveApiSet).toHaveBeenCalledWith("start_marker", 0.5);
    expect(mockLiveApiSet).toHaveBeenCalledWith("end_marker", 4.5);
    expect(mockLiveApiSet).toHaveBeenCalledWith("loop_start", 1.0);
    expect(mockLiveApiSet).toHaveBeenCalledWith("loop_end", 3.0);
  });

  it("should return all clip properties including marker positions", () => {
    // Setup mock to return expected values for get()
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "has_clip") return [0];
      if (prop === "name") return ["Test Clip"];
      if (prop === "length") return [4];
      if (prop === "looping") return [1];
      if (prop === "start_marker") return [0.5];
      if (prop === "end_marker") return [4.5];
      if (prop === "loop_start") return [1.0];
      if (prop === "loop_end") return [3.0];
      return [0];
    });

    const args = {
      trackIndex: 0,
      clipSlotIndex: 0,
      name: "Test Clip",
      loop: true,
      start_marker: 0.5,
      end_marker: 4.5,
      loop_start: 1.0,
      loop_end: 3.0,
    };

    const result = writeClip(args);

    expect(result.success).toBe(true);
    expect(result.name).toBe("Test Clip");
    expect(result.loop).toBe(true);
    expect(result.start_marker).toBe(0.5);
    expect(result.end_marker).toBe(4.5);
    expect(result.loop_start).toBe(1.0);
    expect(result.loop_end).toBe(3.0);
    expect(result.type).toBe("midi");
    expect(result.notes).toBeNull();
  });

  it("should create a clip with notes when a valid notation string is provided", () => {
    const args = {
      trackIndex: 1,
      clipSlotIndex: 2,
      notes: "C3 E3 G3",
    };

    const result = writeClip(args);

    expect(result.success).toBe(true);
    expect(result.message).toContain("Created clip with");
    expect(result.noteCount).toBe(3);

    const addNotesCall = mockLiveApiCall.mock.calls[1];
    expect(addNotesCall[0]).toBe("add_new_notes");
    expect(addNotesCall[1].notes.length).toBe(3);
    expect(addNotesCall[1].notes[0].pitch).toBe(60); // C3 is MIDI pitch 60
  });

  describe("When clip already exists", () => {
    beforeEach(() => {
      // Override for tests with existing clip
      mockLiveApiGet.mockImplementation((prop) => {
        if (prop === "has_clip") return [1];
        if (prop === "name") return ["Existing Clip"];
        if (prop === "length") return [8];
        return [0];
      });
    });

    it("should update existing clip properties without deleteExistingNotes", () => {
      const args = {
        trackIndex: 0,
        clipSlotIndex: 0,
        name: "Updated Clip",
        color: "#FF0000",
        loop: true,
      };

      const result = writeClip(args);

      expect(result.success).toBe(true);
      expect(result.message).toContain("Updated clip properties");

      // Should not call delete_clip or create_clip
      expect(mockLiveApiCall).not.toHaveBeenCalledWith("delete_clip");
      expect(mockLiveApiCall).not.toHaveBeenCalledWith("create_clip", expect.anything());

      // Should set properties
      expect(mockLiveApiSet).toHaveBeenCalledWith("name", "Updated Clip");
      expect(mockLiveApiSet).toHaveBeenCalledWith("color", expect.any(Number));
      expect(mockLiveApiSet).toHaveBeenCalledWith("looping", true);
    });

    it("should replace existing clip when deleteExistingNotes is true", () => {
      const args = {
        trackIndex: 0,
        clipSlotIndex: 0,
        notes: "C3 D3",
        deleteExistingNotes: true,
      };

      const result = writeClip(args);

      expect(result.success).toBe(true);
      expect(result.message).toContain("Replaced with new clip");
      expect(result.noteCount).toBe(2);

      // Verify delete_clip and create_clip were called
      expect(mockLiveApiCall.mock.calls[0][0]).toBe("delete_clip");
      expect(mockLiveApiCall.mock.calls[1][0]).toBe("create_clip");
    });
  });

  // Tests for loop and autoplay parameters
  it("should set looping to true when loop=true", () => {
    const args = { trackIndex: 0, clipSlotIndex: 0, loop: true };
    writeClip(args);
    expect(mockLiveApiSet).toHaveBeenCalledWith("looping", true);
  });

  it("should fire clip when autoplay=true", () => {
    const args = { trackIndex: 0, clipSlotIndex: 0, autoplay: true };
    writeClip(args);
    expect(mockLiveApiCall).toHaveBeenCalledWith("fire");
  });

  it("handles multi-voice input and adds all notes to the clip", () => {
    const multiVoiceInput = "C3 D3; G2 A2";

    const args = {
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: multiVoiceInput,
    };

    const result = writeClip(args);

    expect(result.success).toBe(true);
    expect(result.noteCount).toBe(4); // 2 notes from each voice

    const addNotesCall = mockLiveApiCall.mock.calls.find((call) => call[0] === "add_new_notes");
    expect(addNotesCall).toBeDefined();

    const addedNotes = addNotesCall[1].notes;
    expect(addedNotes.length).toBe(4);

    // First voice notes (C3, D3)
    expect(addedNotes).toContainEqual(
      expect.objectContaining({
        pitch: 60, // C3
        start_time: 0,
      })
    );
    expect(addedNotes).toContainEqual(
      expect.objectContaining({
        pitch: 62, // D3
        start_time: 1,
      })
    );

    // Second voice notes (G2, A2)
    expect(addedNotes).toContainEqual(
      expect.objectContaining({
        pitch: 55, // G2
        start_time: 0,
      })
    );
    expect(addedNotes).toContainEqual(
      expect.objectContaining({
        pitch: 57, // A2
        start_time: 1,
      })
    );
  });

  it("handles complex multi-voice patterns with different rhythms", () => {
    const complexMultiVoiceInput = "C3*2 D3/2 E3/2; G2*3 A2";

    const args = {
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: complexMultiVoiceInput,
    };

    const result = writeClip(args);

    expect(result.success).toBe(true);
    expect(result.noteCount).toBe(5); // 3 notes from first voice, 2 from second

    const addNotesCall = mockLiveApiCall.mock.calls.find((call) => call[0] === "add_new_notes");
    const addedNotes = addNotesCall[1].notes;

    // Check that notes from both voices are present
    expect(addedNotes).toContainEqual(
      expect.objectContaining({
        pitch: 60, // C3
        duration: 2,
      })
    );

    expect(addedNotes).toContainEqual(
      expect.objectContaining({
        pitch: 55, // G2
        duration: 3,
      })
    );
  });

  it("handles notes with velocity modifiers", () => {
    const args = {
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: "C3v80 D3v60 E3v40",
    };

    const result = writeClip(args);
    expect(result.success).toBe(true);
    expect(result.noteCount).toBe(3);

    const addNotesCall = mockLiveApiCall.mock.calls.find((call) => call[0] === "add_new_notes");
    const addedNotes = addNotesCall[1].notes;

    // Verify velocities were parsed correctly
    expect(addedNotes).toContainEqual(expect.objectContaining({ pitch: 60, velocity: 80 }));
    expect(addedNotes).toContainEqual(expect.objectContaining({ pitch: 62, velocity: 60 }));
    expect(addedNotes).toContainEqual(expect.objectContaining({ pitch: 64, velocity: 40 }));
  });

  it("handles chord with velocity and duration modifiers", () => {
    const args = {
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: "[C3 E3 G3]v90*2",
    };

    const result = writeClip(args);
    expect(result.success).toBe(true);
    expect(result.noteCount).toBe(3);

    const addNotesCall = mockLiveApiCall.mock.calls.find((call) => call[0] === "add_new_notes");
    const addedNotes = addNotesCall[1].notes;

    // All notes in chord should have the same velocity and duration
    addedNotes.forEach((note) => {
      expect(note.velocity).toBe(90);
      expect(note.duration).toBe(2);
    });
  });
});
