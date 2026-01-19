/**
 * Test helpers for arrangement-operations-helpers tests.
 * These helpers reduce code duplication in test setups.
 */
import { vi } from "vitest";
import { liveApiPath, mockLiveApiGet } from "#src/test/mocks/mock-live-api.js";

/**
 * Setup liveApiPath mock for arrangement clip tests with a given clip ID.
 * @param {string} clipId - The clip ID to match (e.g., "789")
 * @param {number} [trackIndex=0] - Track index for the returned path
 */
export function setupArrangementClipPath(clipId, trackIndex = 0) {
  liveApiPath.mockImplementation(function () {
    if (this._id === clipId) {
      return `live_set tracks ${trackIndex} arrangement_clips 0`;
    }

    return this._path;
  });
}

/**
 * Create mock clip properties for arrangement tests.
 * @param {object} [overrides] - Property overrides
 * @param {number} [overrides.looping=1] - Looping state
 * @param {number} [overrides.loop_start=0] - Loop start position
 * @param {number} [overrides.loop_end=8] - Loop end position
 * @param {number} [overrides.start_marker=0] - Start marker position
 * @param {number} [overrides.end_marker=8] - End marker position
 * @returns {object} Mock clip properties
 */
export function createClipProps(overrides = {}) {
  return {
    looping: 1,
    loop_start: 0,
    loop_end: 8,
    start_marker: 0,
    end_marker: 8,
    ...overrides,
  };
}

/**
 * Create a mock clip object for arrangement tests.
 * @param {object} options - Options for creating the mock clip
 * @param {string} [options.id="789"] - Clip ID
 * @param {number|null} [options.trackIndex=0] - Track index (null for error tests)
 * @param {object} [options.props] - Clip properties (passed to createClipProps)
 * @returns {object} Mock clip object with id, getProperty, and trackIndex
 */
export function createMockClip(options = {}) {
  const { id = "789", trackIndex = 0, props = {} } = options;
  const clipProps = createClipProps(props);

  return {
    id,
    getProperty: vi.fn((prop) => clipProps[prop]),
    trackIndex,
  };
}

/**
 * Setup common mocks for arrangement clip tests.
 * Combines path mock and mockLiveApiGet in one call.
 * @param {object} options - Options
 * @param {string} [options.clipId="789"] - Clip ID
 * @param {number} [options.trackIndex=0] - Track index
 * @param {object} [options.clipProps] - Clip properties (passed to createClipProps)
 * @param {Record<string, object>} [options.extraMocks={}] - Additional mocks for mockLiveApiGet
 */
export function setupArrangementMocks(options = {}) {
  const {
    clipId = "789",
    trackIndex = 0,
    clipProps = {},
    extraMocks = {},
  } = options;

  setupArrangementClipPath(clipId, trackIndex);
  mockLiveApiGet({
    [clipId]: createClipProps(clipProps),
    ...extraMocks,
  });
}
