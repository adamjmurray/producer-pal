/**
 * Test helper functions for read-track tests
 */
import { children, liveApiId } from "#src/test/mocks/mock-live-api.js";

/**
 * Creates a mock track object with default properties
 * @param {object} overrides - Properties to override the defaults
 * @returns {object} Mock track properties
 */
export const mockTrackProperties = (overrides = {}) => ({
  name: "Test Track",
  has_midi_input: 1,
  color: 0,
  mute: 0,
  solo: 0,
  arm: 0,
  can_be_armed: 1,
  is_foldable: 0,
  is_grouped: 0,
  group_track: ["id", 0],
  playing_slot_index: -1,
  fired_slot_index: -1,
  muted_via_solo: 0,
  clip_slots: [],
  arrangement_clips: [],
  devices: [],
  back_to_arranger: 0,
  mixer_device: children("mixer_1"),
  ...overrides,
});

/**
 * Setup liveApiId mock with a path-to-ID mapping
 * @param {object} pathIdMap - Mapping of paths to IDs
 * @param {string} [defaultId="id 0"] - Default ID for unmatched paths
 */
export function setupMixerIdMock(pathIdMap, defaultId = "id 0") {
  liveApiId.mockImplementation(function () {
    // Handle ID-based paths (from getChildren)
    if (this.path?.startsWith("id ")) {
      return this.path.slice(3);
    }

    return pathIdMap[this.path] ?? defaultId;
  });
}

/**
 * Create standard mixer path-to-ID mapping for a track
 * @param {object} opts - Options for the mapping
 * @param {string} [opts.trackPath="live_set tracks 0"] - Track path
 * @param {string} [opts.trackId="track1"] - Track ID
 * @param {string} [opts.mixerId="mixer_1"] - Mixer device ID
 * @param {string} [opts.volumeId="volume_param_1"] - Volume parameter ID
 * @param {string} [opts.panningId="panning_param_1"] - Panning parameter ID
 * @param {string} [opts.leftSplitId] - Left split parameter ID (for split panning)
 * @param {string} [opts.rightSplitId] - Right split parameter ID (for split panning)
 * @returns {object} Path-to-ID mapping
 */
export function createMixerPathIdMap(opts = {}) {
  const {
    trackPath = "live_set tracks 0",
    trackId = "track1",
    mixerId = "mixer_1",
    volumeId = "volume_param_1",
    panningId = "panning_param_1",
    leftSplitId,
    rightSplitId,
  } = opts;

  const map = {
    [trackPath]: trackId,
    [`${trackPath} mixer_device`]: mixerId,
    [`${trackPath} mixer_device volume`]: volumeId,
    [`${trackPath} mixer_device panning`]: panningId,
  };

  if (leftSplitId) {
    map[`${trackPath} mixer_device left_split_stereo`] = leftSplitId;
  }

  if (rightSplitId) {
    map[`${trackPath} mixer_device right_split_stereo`] = rightSplitId;
  }

  return map;
}
