import { expect } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";

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
  });
}

/**
 * Setup liveApiPath mock for arrangement clip tests.
 * @param {number} trackIndex - Track index
 * @param {string[]} clipIds - Array of clip IDs that should return the track's arrangement_clips path
 */
export function setupArrangementClipPath(trackIndex, clipIds) {
  liveApiPath.mockImplementation(function () {
    if (clipIds.includes(this._id)) {
      return `live_set tracks ${trackIndex} arrangement_clips 0`;
    }

    if (this._path === "live_set") {
      return "live_set";
    }

    if (this._path === `live_set tracks ${trackIndex}`) {
      return `live_set tracks ${trackIndex}`;
    }

    return this._path;
  });
}

/**
 * Build standard audio clip mock data for arrangement length tests.
 * @param {object} opts - Options
 * @param {string} opts.clipId - Clip ID
 * @param {number} opts.trackIndex - Track index
 * @param {number} opts.endTime - End time in beats
 * @param {number} [opts.startMarker=0] - Start marker position
 * @param {string} [opts.name="Audio Clip"] - Clip name
 * @returns {object} Clip mock data object keyed by clip ID
 */
export function buildAudioClipMock({
  clipId,
  trackIndex,
  endTime,
  startMarker = 0,
  name = "Audio Clip",
}) {
  return {
    [clipId]: {
      is_arrangement_clip: 1,
      is_midi_clip: 0,
      is_audio_clip: 1,
      looping: 0,
      warping: 1,
      start_time: 0.0,
      end_time: endTime,
      start_marker: startMarker,
      end_marker: endTime,
      loop_start: startMarker,
      loop_end: endTime,
      name,
      trackIndex,
    },
  };
}

/**
 * Build revealed clip mock data for arrangement length tests.
 * @param {object} opts - Options
 * @param {string} opts.clipId - Revealed clip ID
 * @param {number} opts.trackIndex - Track index
 * @param {number} opts.startTime - Start time (where clip begins in arrangement)
 * @param {number} opts.endTime - End time
 * @param {number} opts.startMarker - Start marker position
 * @param {number} opts.endMarker - End marker position
 * @returns {object} Clip mock data object keyed by clip ID
 */
export function buildRevealedClipMock({
  clipId,
  trackIndex,
  startTime,
  endTime,
  startMarker,
  endMarker,
}) {
  return {
    [clipId]: {
      is_arrangement_clip: 1,
      is_midi_clip: 0,
      is_audio_clip: 1,
      looping: 0,
      start_time: startTime,
      end_time: endTime,
      start_marker: startMarker,
      end_marker: endMarker,
      trackIndex,
    },
  };
}

/**
 * Setup liveApiCall mock to return a revealed clip ID on duplicate_clip_to_arrangement.
 * @param {string} revealedClipId - ID to return for duplicated clip
 */
export function setupDuplicateClipMock(revealedClipId) {
  liveApiCall.mockImplementation(function (method, ..._args) {
    if (method === "duplicate_clip_to_arrangement") {
      return ["id", revealedClipId];
    }

    return 1;
  });
}

/**
 * Assert that source clip end_marker was set correctly.
 * @param {string} clipId - Source clip ID
 * @param {number} expectedEndMarker - Expected end marker value
 */
export function assertSourceClipEndMarker(clipId, expectedEndMarker) {
  expect(liveApiSet).toHaveBeenCalledWithThis(
    expect.objectContaining({ id: clipId }),
    "end_marker",
    expectedEndMarker,
  );
}

/**
 * Assert that duplicate_clip_to_arrangement was called correctly.
 * @param {string} clipId - Source clip ID
 * @param {number} position - Position for the duplicated clip
 */
export function assertDuplicateClipCalled(clipId, position) {
  expect(liveApiCall).toHaveBeenCalledWith(
    "duplicate_clip_to_arrangement",
    `id ${clipId}`,
    position,
  );
}

/**
 * Assert that revealed clip markers were set using the looping workaround.
 * @param {string} clipId - Revealed clip ID
 * @param {number} startMarker - Expected start marker
 * @param {number} endMarker - Expected end marker
 */
export function assertRevealedClipMarkers(clipId, startMarker, endMarker) {
  expect(liveApiSet).toHaveBeenCalledWithThis(
    expect.objectContaining({ id: clipId }),
    "looping",
    1,
  );
  expect(liveApiSet).toHaveBeenCalledWithThis(
    expect.objectContaining({ id: clipId }),
    "loop_end",
    endMarker,
  );
  expect(liveApiSet).toHaveBeenCalledWithThis(
    expect.objectContaining({ id: clipId }),
    "loop_start",
    startMarker,
  );
  expect(liveApiSet).toHaveBeenCalledWithThis(
    expect.objectContaining({ id: clipId }),
    "end_marker",
    endMarker,
  );
  expect(liveApiSet).toHaveBeenCalledWithThis(
    expect.objectContaining({ id: clipId }),
    "start_marker",
    startMarker,
  );
  expect(liveApiSet).toHaveBeenCalledWithThis(
    expect.objectContaining({ id: clipId }),
    "looping",
    0,
  );
}

/**
 * Setup a complete audio arrangement length test scenario.
 * @param {object} opts - Options
 * @param {number} opts.trackIndex - Track index
 * @param {string} opts.clipId - Source clip ID
 * @param {string} opts.revealedClipId - Revealed clip ID
 * @param {number} opts.sourceEndTime - Source clip end time
 * @param {number} opts.targetEndMarker - Target end marker (e.g., 14 for "3:2")
 * @param {number} [opts.startMarker=0] - Source clip start marker
 * @param {string} [opts.name="Audio Clip"] - Clip name
 */
export function setupAudioArrangementTest({
  trackIndex,
  clipId,
  revealedClipId,
  sourceEndTime,
  targetEndMarker,
  startMarker = 0,
  name = "Audio Clip",
}) {
  setupArrangementClipPath(trackIndex, [clipId, revealedClipId]);

  const sourceMock = buildAudioClipMock({
    clipId,
    trackIndex,
    endTime: sourceEndTime,
    startMarker,
    name,
  });

  const revealedMock = buildRevealedClipMock({
    clipId: revealedClipId,
    trackIndex,
    startTime: sourceEndTime,
    endTime: targetEndMarker,
    startMarker: startMarker + sourceEndTime,
    endMarker: targetEndMarker,
  });

  mockLiveApiGet({ ...sourceMock, ...revealedMock });
  setupDuplicateClipMock(revealedClipId);
}
