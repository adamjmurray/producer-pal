// Import for use in helper functions below
import {
  liveApiCall,
  liveApiGet,
  liveApiPath,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";

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
} from "#src/test/mocks/mock-live-api.js";

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
 * Setup liveApiPath mock for session clip validation tests.
 * @param {string} clipId - Clip ID (e.g., "clip1")
 * @param {string} [clipPath] - Clip path (default: "live_set tracks 0 clip_slots 0 clip")
 */
export function setupSessionClipPath(
  clipId,
  clipPath = "live_set tracks 0 clip_slots 0 clip",
) {
  liveApiPath.mockImplementation(function () {
    if (this._id === clipId) return clipPath;

    return this._path;
  });
}

/**
 * Setup liveApiCall mock for arrangement clip duplication.
 * Handles duplicate_clip_to_arrangement and get_notes_extended methods.
 * @param {object} [opts] - Options
 * @param {string} [opts.returnClipId] - ID of the created arrangement clip
 * @param {boolean} [opts.includeNotes] - Whether to mock get_notes_extended (default: true)
 */
export function setupArrangementDuplicationMock(opts = {}) {
  const {
    returnClipId = "live_set tracks 0 arrangement_clips 0",
    includeNotes = true,
  } = opts;

  liveApiCall.mockImplementation(function (method) {
    if (method === "duplicate_clip_to_arrangement") {
      return ["id", returnClipId];
    }

    if (includeNotes && method === "get_notes_extended") {
      return JSON.stringify({ notes: [] });
    }

    return null;
  });
}

/**
 * Returns mock data for a standard MIDI clip used in scene duplication tests.
 * @param {object} [opts] - Options
 * @param {number} [opts.length] - Clip length in beats (default: 8)
 * @param {string} [opts.name] - Clip name (default: "Scene Clip")
 * @returns {object} Mock data object for the clip
 */
export function createStandardMidiClipMock(opts = {}) {
  const { length = 8, name = "Scene Clip" } = opts;

  return {
    length,
    name,
    color: 4047616,
    signature_numerator: 4,
    signature_denominator: 4,
    looping: 0,
    loop_start: 0,
    loop_end: length,
    is_midi_clip: 1,
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
