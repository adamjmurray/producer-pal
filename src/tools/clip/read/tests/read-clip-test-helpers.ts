/**
 * Test helper functions for read-clip tests
 */
import { liveApiCall, mockLiveApiGet } from "#src/test/mocks/mock-live-api.ts";

interface TestNote {
  note_id?: number;
  pitch: number;
  start_time: number;
  duration: number;
  velocity: number;
  probability: number;
  velocity_deviation: number;
}

interface CreateTestNoteOptions {
  pitch?: number;
  startTime: number;
  duration?: number;
  velocity?: number;
}

interface ClipProperties {
  signature_numerator?: number;
  signature_denominator?: number;
  length?: number;
  start_marker?: number;
  end_marker?: number;
  loop_start?: number;
  loop_end?: number;
  [key: string]: unknown;
}

interface SetupMidiClipMockOptions {
  notes?: TestNote[];
  clipProps: ClipProperties;
}

// Default test notes: C3, D3, E3 at beats 0, 1, 2
export const defaultTestNotes: TestNote[] = [
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
 * @param opts - Options
 * @param opts.pitch - MIDI pitch (default 60 = C3)
 * @param opts.startTime - Start time in Ableton beats
 * @param opts.duration - Duration in beats
 * @param opts.velocity - Velocity
 * @returns Note object
 */
export function createTestNote(opts: CreateTestNoteOptions): TestNote {
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
 * @param opts - Options
 * @param opts.notes - Notes array (defaults to defaultTestNotes)
 * @param opts.clipProps - Clip properties to mock
 */
export function setupMidiClipMock({
  notes = defaultTestNotes,
  clipProps,
}: SetupMidiClipMockOptions): void {
  liveApiCall.mockImplementation(function (method: string) {
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
 * @param notes - Notes array to return
 */
export function setupNotesMock(notes: TestNote[]): void {
  liveApiCall.mockImplementation((method: string) => {
    if (method === "get_notes_extended") {
      return JSON.stringify({ notes });
    }

    return null;
  });
}

/**
 * Creates standard clip properties for 4/4 time
 * @param overrides - Properties to override
 * @returns Clip properties
 */
export function createClipProps44(
  overrides: ClipProperties = {},
): ClipProperties {
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
 * @param overrides - Properties to override
 * @returns Clip properties
 */
export function createClipProps68(
  overrides: ClipProperties = {},
): ClipProperties {
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
