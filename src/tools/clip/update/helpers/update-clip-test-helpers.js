import { liveApiCall, liveApiId, liveApiPath } from "#~/test/mock-live-api.js";

/**
 * Shared mock context for update-clip tests
 */
export const mockContext = {
  holdingAreaStartBeats: 40000,
};

/**
 * Setup function for mock Live API implementations used across update-clip tests.
 * Should be called in a beforeEach hook in each test file.
 */
export function setupMocks() {
  // Track added notes per clip ID for get_notes_extended mocking
  const addedNotesByClipId = {};

  liveApiId.mockImplementation(function () {
    switch (this._path) {
      case "id 123":
        return "123";
      case "id 456":
        return "456";
      case "id 789":
        return "789";
      case "id 999":
        return "999";
      default:
        return this._id;
    }
  });

  liveApiPath.mockImplementation(function () {
    switch (this._id) {
      case "123":
        return "live_set tracks 0 clip_slots 0 clip";
      case "456":
        return "live_set tracks 1 clip_slots 1 clip";
      case "789":
        return "live_set tracks 2 arrangement_clips 0";
      case "999":
        return "live_set tracks 3 arrangement_clips 1";
      default:
        return this._path;
    }
  });

  // Mock liveApiCall to track added notes and return them for get_notes_extended
  liveApiCall.mockImplementation(function (method, ...args) {
    if (method === "add_new_notes") {
      // Store the notes for this clip ID
      addedNotesByClipId[this.id] = args[0]?.notes || [];
    } else if (method === "get_notes_extended") {
      // Return the notes that were previously added for this clip
      const notes = addedNotesByClipId[this.id] || [];
      return JSON.stringify({ notes });
    }
    return undefined;
  });
}
