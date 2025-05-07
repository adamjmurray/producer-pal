// device/delete-clip.test.js
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

// Setup for tests
beforeEach(() => {
  // Reset mocks
  mockLiveApiCall.mockReset();
  mockLiveApiGet.mockReset();

  // Stub global
  vi.stubGlobal("LiveAPI", MockLiveAPI);
});

afterEach(() => {
  vi.clearAllMocks();
});

// Import module under test
const { deleteClip } = require("./delete-clip");

describe("deleteClip", () => {
  it("should delete a clip when it exists", () => {
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "has_clip") return [1];
      return [0];
    });

    const result = deleteClip({ trackIndex: 0, clipSlotIndex: 0 });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Deleted clip");
    expect(mockLiveApiCall).toHaveBeenCalledWith("delete_clip");
  });

  it("should return an error when no clip exists", () => {
    mockLiveApiGet.mockImplementation((prop) => {
      if (prop === "has_clip") return [0];
      return [0];
    });

    const result = deleteClip({ trackIndex: 0, clipSlotIndex: 0 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No clip exists");
    expect(mockLiveApiCall).not.toHaveBeenCalled();
  });
});
