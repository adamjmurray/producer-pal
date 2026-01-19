/**
 * Test helper functions for read-clip tests
 */
import { liveApiCall, mockLiveApiGet } from "#src/test/mocks/mock-live-api.js";

// Default test notes: C3, D3, E3 at beats 0, 1, 2
export const defaultTestNotes = [
  {
    note_id: 1,
    pitch: 60,
    start_time: 0,
    duration: 1,
    velocity: 100,
    probability: 1.0,
    velocity_deviation: 0,
  },
  {
    note_id: 2,
    pitch: 62,
    start_time: 1,
    duration: 1,
    velocity: 100,
    probability: 1.0,
    velocity_deviation: 0,
  },
  {
    note_id: 3,
    pitch: 64,
    start_time: 2,
    duration: 1,
    velocity: 100,
    probability: 1.0,
    velocity_deviation: 0,
  },
];

/**
 * Creates a test note object
 * @param {object} opts - Options
 * @param {number} opts.pitch - MIDI pitch (default 60 = C3)
 * @param {number} opts.startTime - Start time in Ableton beats
 * @param {number} [opts.duration=1] - Duration in beats
 * @param {number} [opts.velocity=100] - Velocity
 * @returns {object} Note object
 */
export function createTestNote(opts) {
  const { pitch = 60, startTime, duration = 1, velocity = 100 } = opts;

  return {
    pitch,
    start_time: startTime,
    duration,
    velocity,
    probability: 1.0,
    velocity_deviation: 0,
  };
}

/**
 * Helper to set up mocks for a MIDI clip with notes
 * @param {object} opts - Options
 * @param {Array} [opts.notes] - Notes array (defaults to defaultTestNotes)
 * @param {object} opts.clipProps - Clip properties to mock
 */
export function setupMidiClipMock({ notes = defaultTestNotes, clipProps }) {
  liveApiCall.mockImplementation(function (method) {
    if (method === "get_notes_extended") {
      return JSON.stringify({ notes });
    }

    return null;
  });
  mockLiveApiGet({
    "live_set/tracks/1/clip_slots/1/clip": clipProps,
  });
}

/**
 * Helper to set up liveApiCall mock for get_notes_extended
 * @param {Array} notes - Notes array to return
 */
export function setupNotesMock(notes) {
  liveApiCall.mockImplementation((method) => {
    if (method === "get_notes_extended") {
      return JSON.stringify({ notes });
    }

    return null;
  });
}

/**
 * Creates standard clip properties for 4/4 time
 * @param {object} [overrides] - Properties to override
 * @returns {object} Clip properties
 */
export function createClipProps44(overrides = {}) {
  return {
    signature_numerator: 4,
    signature_denominator: 4,
    length: 4,
    start_marker: 0,
    end_marker: 4,
    loop_start: 0,
    loop_end: 4,
    ...overrides,
  };
}

/**
 * Creates standard clip properties for 6/8 time
 * @param {object} [overrides] - Properties to override
 * @returns {object} Clip properties
 */
export function createClipProps68(overrides = {}) {
  return {
    signature_numerator: 6,
    signature_denominator: 8,
    length: 3, // One bar in 6/8 = 3 Ableton beats
    start_marker: 0,
    end_marker: 3,
    loop_start: 0,
    loop_end: 3,
    ...overrides,
  };
}
