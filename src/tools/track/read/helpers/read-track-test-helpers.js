/**
 * Test helper functions for read-track tests
 */
import { children, liveApiId } from "#src/test/mocks/mock-live-api.js";

/**
 * Setup liveApiId mock for device tests with a path-to-ID mapping.
 * Falls back to this._id for unmatched paths.
 * @param {Record<string, string>} pathIdMap - Mapping of paths to IDs
 */
export function setupDevicePathIdMock(pathIdMap) {
  liveApiId.mockImplementation(
    /**
     * @this {{_path: string, _id: string}}
     * @returns {string} The ID for the path
     */
    function () {
      if (this._path && pathIdMap[this._path]) {
        return pathIdMap[this._path];
      }

      return this._id;
    },
  );
}

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
 * @param {Record<string, string>} pathIdMap - Mapping of paths to IDs
 * @param {string} [defaultId="id 0"] - Default ID for unmatched paths
 */
export function setupMixerIdMock(pathIdMap, defaultId = "id 0") {
  liveApiId.mockImplementation(
    /**
     * @this {{path: string}}
     * @returns {string} The ID for the path
     */
    function () {
      // Handle ID-based paths (from getChildren)
      if (this.path?.startsWith("id ")) {
        return this.path.slice(3);
      }

      return pathIdMap[this.path] ?? defaultId;
    },
  );
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

/**
 * Create mock data for split panning mode test
 * @param {object} opts - Options for the mock
 * @param {number} [opts.gainDb=0] - Volume display value in dB
 * @param {number} [opts.leftPan=-1] - Left pan value (-1 to 1)
 * @param {number} [opts.rightPan=1] - Right pan value (-1 to 1)
 * @returns {object} Mock data object for mockLiveApiGet
 */
export function createSplitPanningMock(opts = {}) {
  const { gainDb = 0, leftPan = -1, rightPan = 1 } = opts;

  return {
    Track: {
      has_midi_input: 1,
      name: "Test Track",
      clip_slots: [],
      devices: [],
      mixer_device: children("mixer_1"),
    },
    mixer_1: {
      volume: children("volume_param_1"),
      panning_mode: 1, // Split mode
      left_split_stereo: children("left_split_param_1"),
      right_split_stereo: children("right_split_param_1"),
    },
    volume_param_1: {
      display_value: gainDb,
    },
    left_split_param_1: {
      value: leftPan,
    },
    right_split_param_1: {
      value: rightPan,
    },
  };
}

/**
 * Creates standard routing mock properties for track routing tests.
 * @param {object} [overrides] - Properties to override the defaults
 * @returns {object} Routing properties for mockTrackProperties
 */
export function createRoutingMockProperties(overrides = {}) {
  return {
    available_input_routing_channels: [
      '{"available_input_routing_channels": [{"display_name": "In 1", "identifier": 1}, {"display_name": "In 2", "identifier": 2}]}',
    ],
    available_input_routing_types: [
      '{"available_input_routing_types": [{"display_name": "Ext. In", "identifier": 17}, {"display_name": "Resampling", "identifier": 18}]}',
    ],
    available_output_routing_channels: [
      '{"available_output_routing_channels": [{"display_name": "Master", "identifier": 26}, {"display_name": "A", "identifier": 27}]}',
    ],
    available_output_routing_types: [
      '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}, {"display_name": "Send Only", "identifier": 28}]}',
    ],
    input_routing_channel: [
      '{"input_routing_channel": {"display_name": "In 1", "identifier": 1}}',
    ],
    input_routing_type: [
      '{"input_routing_type": {"display_name": "Ext. In", "identifier": 17}}',
    ],
    output_routing_channel: [
      '{"output_routing_channel": {"display_name": "Master", "identifier": 26}}',
    ],
    output_routing_type: [
      '{"output_routing_type": {"display_name": "Track Out", "identifier": 25}}',
    ],
    ...overrides,
  };
}
