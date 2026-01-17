import { vi } from "vitest";
// Import for use in helper functions below
import {
  liveApiGet,
  liveApiPath,
  liveApiType,
} from "#src/test/mock-live-api.js";

// Re-export mock utilities from mock-live-api for convenience
export {
  children,
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";

/**
 * Setup liveApiPath mock for track duplication tests.
 * @param {string} trackId - Track ID (e.g., "track1")
 * @param {number} trackIndex - Track index (e.g., 0)
 */
export function setupTrackPath(trackId, trackIndex = 0) {
  liveApiPath.mockImplementation(function () {
    if (this._id === trackId) {
      return `live_set tracks ${trackIndex}`;
    }

    return this._path;
  });
}

/**
 * Setup liveApiPath mock for scene duplication tests.
 * @param {string} sceneId - Scene ID (e.g., "scene1")
 * @param {number} sceneIndex - Scene index (e.g., 0)
 */
export function setupScenePath(sceneId, sceneIndex = 0) {
  liveApiPath.mockImplementation(function () {
    if (this._id === sceneId) {
      return `live_set scenes ${sceneIndex}`;
    }

    return this._path;
  });
}

/**
 * Setup arrangement clip mocks for scene-to-arrangement tests.
 * Extends existing liveApiPath and liveApiGet mocks to handle arrangement clips.
 * @param {object} opts - Options
 * @param {function} [opts.getStartTime] - Function to get start time based on path (default: returns 16)
 */
export function setupArrangementClipMocks(opts = {}) {
  const { getStartTime = () => 16 } = opts;

  const originalGet = liveApiGet.getMockImplementation();
  const originalPath = liveApiPath.getMockImplementation();

  liveApiPath.mockImplementation(function () {
    // For arrangement clips created by ID, return a proper path
    if (
      this._path.startsWith("id live_set tracks") &&
      this._path.includes("arrangement_clips")
    ) {
      return this._path.slice(3); // Remove "id " prefix
    }

    return originalPath ? originalPath.call(this) : this._path;
  });

  liveApiGet.mockImplementation(function (prop) {
    // Check if this is an arrangement clip requesting is_arrangement_clip
    if (
      this._path.includes("arrangement_clips") &&
      prop === "is_arrangement_clip"
    ) {
      return [1];
    }

    // Check if this is an arrangement clip requesting start_time
    if (this._path.includes("arrangement_clips") && prop === "start_time") {
      return [getStartTime(this._path)];
    }

    // Otherwise use the original mock implementation
    return originalGet ? originalGet.call(this, prop) : [];
  });
}

// Mock updateClip to avoid complex internal logic
export const updateClipMock = vi.fn(({ ids }) => {
  // Return array format to simulate tiled clips
  return [{ id: ids }];
});

// Mock arrangement-tiling helpers
export const createShortenedClipInHoldingMock = vi.fn(() => ({
  holdingClipId: "holding_clip_id",
}));

export const moveClipFromHoldingMock = vi.fn(
  (_holdingClipId, track, _startBeats) => {
    // Return a mock LiveAPI object with necessary methods
    const clipId = `${track.path} arrangement_clips 0`;

    return {
      id: clipId,
      path: clipId,
      set: vi.fn(),
      getProperty: vi.fn((prop) => {
        if (prop === "is_arrangement_clip") {
          return 1;
        }

        if (prop === "start_time") {
          return _startBeats;
        }

        return null;
      }),
      // Add trackIndex getter for getMinimalClipInfo
      get trackIndex() {
        const match = clipId.match(/tracks (\d+)/);

        return match ? Number.parseInt(match[1]) : null;
      },
    };
  },
);

/**
 * Setup mock for routeToSource track tests.
 * @param {object} opts - Options
 * @param {string} [opts.trackName] - Track name (default: "Source Track")
 * @param {number} [opts.monitoringState] - Current monitoring state (default: 0 = IN)
 * @param {string} [opts.inputRoutingName] - Input routing display name (default: "No Input")
 * @param {number} [opts.arm] - Arm state (default: undefined)
 * @returns {object} Mock data keyed by track path
 */
export function setupRouteToSourceMock(opts = {}) {
  const {
    trackName = "Source Track",
    monitoringState = 0,
    inputRoutingName = "No Input",
    arm,
  } = opts;

  const sourceTrackMock = {
    name: trackName,
    current_monitoring_state: monitoringState,
    input_routing_type: { display_name: inputRoutingName },
    available_input_routing_types: [
      { display_name: "No Input", identifier: "no_input_id" },
      { display_name: "Audio In", identifier: "audio_in_id" },
    ],
  };

  if (arm !== undefined) {
    sourceTrackMock.arm = arm;
  }

  return {
    "live_set tracks 0": sourceTrackMock,
    "live_set tracks 1": {
      available_output_routing_types: [
        { display_name: "Master", identifier: "master_id" },
        { display_name: trackName, identifier: "source_track_id" },
      ],
    },
  };
}

/**
 * Setup mocks for device duplication tests.
 * @param {string} deviceId - Device ID
 * @param {string} devicePath - Device path
 * @param {string} [deviceType="PluginDevice"] - Device type
 */
export function setupDeviceDuplicationMocks(
  deviceId,
  devicePath,
  deviceType = "PluginDevice",
) {
  liveApiPath.mockImplementation(function () {
    if (this._id === deviceId) {
      return devicePath;
    }

    return this._path;
  });

  liveApiType.mockImplementation(function () {
    if (this._id === deviceId) {
      return deviceType;
    }
  });
}
