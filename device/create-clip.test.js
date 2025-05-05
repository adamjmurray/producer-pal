// device/create-clip.test.js
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
const { createClip } = require("./create-clip");

describe("createClip", () => {
  // Existing tests
  it("should create an empty clip when no notes are provided", () => {
    const args = { track: 0, clipSlot: 0 };
    const result = createClip(args);
    expect(result).toContain("Created empty clip");
    expect(mockLiveApiCall).toHaveBeenCalledWith("create_clip", expect.any(Number));
  });

  it("should create a clip with notes when a valid notation string is provided", () => {
    const args = {
      track: 1,
      clipSlot: 2,
      notes: "C3 E3 G3",
    };

    const result = createClip(args);
    expect(result).toContain("Created clip with");
    expect(mockLiveApiCall).toHaveBeenCalledWith("create_clip", expect.any(Number));

    // Second call should be add_new_notes
    const addNotesCall = mockLiveApiCall.mock.calls[1];
    expect(addNotesCall[0]).toBe("add_new_notes");
    expect(addNotesCall[1].notes.length).toBe(3);
  });

  // Tests for onExistingClip parameter
  describe("onExistingClip parameter", () => {
    beforeEach(() => {
      // Mock has_clip to return true for these tests
      mockLiveApiGet.mockImplementation((prop) => {
        if (prop === "has_clip") return [1];
        return [0];
      });
    });

    it("should throw error by default when clip already exists", () => {
      const args = { track: 0, clipSlot: 0 };
      expect(() => createClip(args)).toThrow(/Clip slot already has a clip/);
    });

    it("should explicitly throw error with 'error' option when clip already exists", () => {
      const args = { track: 0, clipSlot: 0, onExistingClip: "error" };
      expect(() => createClip(args)).toThrow(/Clip slot already has a clip/);
    });

    it("should replace existing clip when 'replace' option is used", () => {
      const args = {
        track: 0,
        clipSlot: 0,
        onExistingClip: "replace",
        notes: "C3 D3",
        name: "New Clip",
      };

      const result = createClip(args);

      // Verify delete_clip was called first
      expect(mockLiveApiCall.mock.calls[0][0]).toBe("delete_clip");

      // Verify create_clip was called next
      expect(mockLiveApiCall.mock.calls[1][0]).toBe("create_clip");

      // Verify name and looping were set
      expect(mockLiveApiSet).toHaveBeenCalledWith("name", "New Clip");
      expect(mockLiveApiSet).toHaveBeenCalledWith("looping", false);

      // Verify add_new_notes was called
      expect(mockLiveApiCall.mock.calls[2][0]).toBe("add_new_notes");

      // Verify message
      expect(result).toContain("Replaced with clip");
      expect(result).toContain("New Clip");
      expect(result).toContain("with 2 notes");
    });

    it("should replace and create empty clip when 'replace' option is used with no notes", () => {
      const args = {
        track: 0,
        clipSlot: 0,
        onExistingClip: "replace",
        name: "Empty Clip",
      };

      const result = createClip(args);

      // Verify delete_clip and create_clip were called
      expect(mockLiveApiCall.mock.calls[0][0]).toBe("delete_clip");
      expect(mockLiveApiCall.mock.calls[1][0]).toBe("create_clip");

      // Verify message
      expect(result).toContain("Replaced with empty clip");
      expect(result).toContain("Empty Clip");
    });

    it("should merge notes into existing clip when 'merge' option is used", () => {
      const args = {
        track: 0,
        clipSlot: 0,
        onExistingClip: "merge",
        notes: "C3 D3 E3",
      };

      const result = createClip(args);

      // Verify delete_clip was NOT called
      expect(mockLiveApiCall).not.toHaveBeenCalledWith("delete_clip");

      // Verify add_new_notes was called directly
      expect(mockLiveApiCall.mock.calls[0][0]).toBe("add_new_notes");

      // Verify name was NOT set
      expect(mockLiveApiSet).not.toHaveBeenCalledWith("name", expect.anything());

      // Verify message
      expect(result).toContain("Merged 3 notes into existing clip");
    });

    it("should return appropriate message when no notes to merge", () => {
      const args = {
        track: 0,
        clipSlot: 0,
        onExistingClip: "merge",
      };

      const result = createClip(args);

      // Verify no calls to add_new_notes
      expect(mockLiveApiCall).not.toHaveBeenCalledWith("add_new_notes", expect.anything());

      // Verify message
      expect(result).toContain("No notes to merge into existing clip");
    });
  });

  // Tests for loop parameter
  describe("loop parameter", () => {
    it("should set looping to false by default", () => {
      const args = { track: 0, clipSlot: 0 };
      createClip(args);
      expect(mockLiveApiSet).toHaveBeenCalledWith("looping", false);
    });

    it("should set looping to true when loop=true", () => {
      const args = { track: 0, clipSlot: 0, loop: true };
      createClip(args);
      expect(mockLiveApiSet).toHaveBeenCalledWith("looping", true);
    });

    it("should set looping to false when loop=false", () => {
      const args = { track: 0, clipSlot: 0, loop: false };
      createClip(args);
      expect(mockLiveApiSet).toHaveBeenCalledWith("looping", false);
    });
  });

  // Tests for autoplay parameter
  describe("autoplay parameter", () => {
    it("should not fire clip by default", () => {
      const args = { track: 0, clipSlot: 0 };
      createClip(args);
      expect(mockLiveApiCall).not.toHaveBeenCalledWith("fire");
    });

    it("should fire clip when autoplay=true", () => {
      const args = { track: 0, clipSlot: 0, autoplay: true };
      createClip(args);
      expect(mockLiveApiCall).toHaveBeenCalledWith("fire");
    });

    it("should not fire clip when autoplay=false", () => {
      const args = { track: 0, clipSlot: 0, autoplay: false };
      createClip(args);
      expect(mockLiveApiCall).not.toHaveBeenCalledWith("fire");
    });
  });
});
