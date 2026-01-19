import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";

/**
 * Setup basic clip mocks for slicing tests
 * @param {string} clipId - The clip ID to mock
 * @param {object} opts - Options
 * @param {string} opts.path - The clip path (default: arrangement clip)
 * @param {string[]} opts.generatedPrefixes - Prefixes for generated clip IDs (default: holding_, moved_, tile_)
 */
export function setupSlicingClipBaseMocks(clipId, opts = {}) {
  const {
    path = "live_set tracks 0 arrangement_clips 0",
    generatedPrefixes = ["holding_", "moved_", "tile_", "slice_"],
  } = opts;

  liveApiId.mockImplementation(function () {
    if (this._path === `id ${clipId}`) {
      return clipId;
    }

    return this._id;
  });

  liveApiPath.mockImplementation(function () {
    if (this._id === clipId) {
      return path;
    }

    // Generated clips get valid track paths
    if (generatedPrefixes.some((p) => this._id?.startsWith(p))) {
      return "live_set tracks 0 arrangement_clips 1";
    }

    return this._path;
  });

  liveApiType.mockImplementation(function () {
    if (this._id === clipId) {
      return "Clip";
    }
  });
}

function getLiveSetProp(path, prop) {
  if (path !== "live_set") return null;
  if (prop === "signature_numerator") return [4];
  if (prop === "signature_denominator") return [4];

  return null;
}

function getHoldingClipProp(id, prop, clipLength) {
  if (!id?.startsWith("holding_")) return null;
  if (prop === "end_time") return [40000 + clipLength];
  if (prop === "loop_start" || prop === "start_marker") return [0.0];

  return null;
}

function getGeneratedClipProp(id, prop, prefixes) {
  if (!prefixes.some((p) => id?.startsWith(p))) return null;
  if (prop === "loop_start" || prop === "start_marker") return [0.0];

  return null;
}

/**
 * Setup liveApiGet mock for slicing tests with looped clip
 * @param {string} clipId - The clip ID
 * @param {object} clipProps - Clip properties
 * @param {boolean} clipProps.isMidi - Is MIDI clip (default: true)
 * @param {boolean} clipProps.looping - Is looping (default: true)
 * @param {number} clipProps.startTime - Start time in beats (default: 0)
 * @param {number} clipProps.endTime - End time in beats (default: 16)
 * @param {number} clipProps.loopStart - Loop start in beats (default: 0)
 * @param {number} clipProps.loopEnd - Loop end in beats (default: 4)
 * @param {number} clipProps.endMarker - End marker in beats (default: loopEnd)
 * @param {string[]} generatedPrefixes - Prefixes for generated clips
 */
export function setupSlicingClipGetMock(
  clipId,
  clipProps = {},
  generatedPrefixes = [],
) {
  const {
    isMidi = true,
    looping = true,
    startTime = 0.0,
    endTime = 16.0,
    loopStart = 0.0,
    loopEnd = 4.0,
    endMarker = loopEnd,
  } = clipProps;

  const mainClipProps = {
    is_midi_clip: isMidi ? 1 : 0,
    is_audio_clip: isMidi ? 0 : 1,
    is_arrangement_clip: 1,
    looping: looping ? 1 : 0,
    start_time: startTime,
    end_time: endTime,
    loop_start: loopStart,
    loop_end: loopEnd,
    end_marker: endMarker,
    start_marker: 0.0,
  };
  const clipLength = endTime - startTime;

  liveApiGet.mockImplementation(function (prop) {
    const liveSetVal = getLiveSetProp(this._path, prop);

    if (liveSetVal) return liveSetVal;

    if (this._id === clipId && prop in mainClipProps)
      return [mainClipProps[prop]];

    const holdingVal = getHoldingClipProp(this._id, prop, clipLength);

    if (holdingVal) return holdingVal;

    const generatedVal = getGeneratedClipProp(
      this._id,
      prop,
      generatedPrefixes,
    );

    if (generatedVal) return generatedVal;

    if (this._path === "live_set tracks 0" && prop === "track_index")
      return [0];

    return [0];
  });
}

/**
 * Create a liveApiCall mock for slicing operations
 * @param {object} opts - Options
 * @param {string} opts.holdingPrefix - Prefix for holding clip (default: "holding_")
 * @param {string} opts.movedPrefix - Prefix for moved clip (default: "moved_")
 * @param {string} opts.tilePrefix - Prefix for tiled clips (default: "tile_")
 * @returns {{ callCount: number, duplicateCalls: Array, setCalls: Array }} State object for tracking mock calls
 */
export function createSlicingCallMock(opts = {}) {
  const {
    holdingPrefix = "holding_",
    movedPrefix = "moved_",
    tilePrefix = "tile_",
  } = opts;

  const state = { callCount: 0, duplicateCalls: [], setCalls: [] };

  liveApiCall.mockImplementation(function (method, ..._args) {
    if (method === "duplicate_clip_to_arrangement") {
      state.callCount++;
      state.duplicateCalls.push({ method, args: _args, id: this._id });

      if (state.callCount === 1) {
        return ["id", `${holdingPrefix}1`];
      } else if (state.callCount === 2) {
        return ["id", `${movedPrefix}1`];
      }

      return ["id", `${tilePrefix}${state.callCount}`];
    }

    if (method === "create_midi_clip") {
      return ["id", "temp_1"];
    }
  });

  return state;
}

/**
 * Setup all mocks for a standard looped clip slicing test
 * @param {string} clipId - The clip ID
 * @param {object} clipProps - Clip properties (see setupSlicingClipGetMock)
 * @returns {{ callState: object }} - State object for tracking calls
 */
export function setupLoopedClipSlicingMocks(clipId, clipProps = {}) {
  const generatedPrefixes = ["holding_", "moved_", "tile_"];

  setupSlicingClipBaseMocks(clipId, { generatedPrefixes });
  setupSlicingClipGetMock(
    clipId,
    { looping: true, ...clipProps },
    generatedPrefixes,
  );
  const callState = createSlicingCallMock();

  return { callState };
}

/**
 * Setup all mocks for an unlooped clip slicing test
 * @param {string} clipId - The clip ID
 * @param {object} clipProps - Clip properties (see setupSlicingClipGetMock)
 * @returns {{ callState: object }} - State object for tracking calls
 */
export function setupUnloopedClipSlicingMocks(clipId, clipProps = {}) {
  const generatedPrefixes = ["holding_", "moved_", "slice_"];

  setupSlicingClipBaseMocks(clipId, { generatedPrefixes });
  setupSlicingClipGetMock(
    clipId,
    {
      looping: false,
      endTime: 8.0,
      loopEnd: 8.0,
      endMarker: 8.0,
      ...clipProps,
    },
    generatedPrefixes,
  );
  const callState = createSlicingCallMock({ tilePrefix: "slice_" });

  return { callState };
}

/**
 * Setup base mocks for two clips in slicing tests.
 * Used when testing scenarios with a primary clip and a secondary/following clip.
 * @param {string} clip1Id - First clip ID
 * @param {string} clip2Id - Second clip ID
 * @param {object} opts - Options
 * @param {string[]} opts.generatedPrefixes - Prefixes for generated clips
 */
export function setupTwoClipBaseMocks(clip1Id, clip2Id, opts = {}) {
  const { generatedPrefixes = ["holding_", "moved_", "tile_"] } = opts;

  liveApiId.mockImplementation(function () {
    if (this._path === `id ${clip1Id}`) return clip1Id;
    if (this._path === `id ${clip2Id}`) return clip2Id;

    return this._id;
  });
  liveApiPath.mockImplementation(function () {
    if (this._id === clip1Id) return "live_set tracks 0 arrangement_clips 0";
    if (this._id === clip2Id) return "live_set tracks 0 arrangement_clips 1";

    if (generatedPrefixes.some((p) => this._id?.startsWith(p))) {
      return "live_set tracks 0 arrangement_clips 2";
    }

    return this._path;
  });
  liveApiType.mockImplementation(function () {
    if (this._id === clip1Id || this._id === clip2Id) return "Clip";
  });
}

/**
 * Filter set calls to find looping-related changes.
 * @param {Array} setCalls - Array of set call objects
 * @returns {{ enable: Array, disable: Array }} Filtered calls
 */
export function filterLoopingCalls(setCalls) {
  return {
    enable: setCalls.filter((c) => c.prop === "looping" && c.value === 1),
    disable: setCalls.filter((c) => c.prop === "looping" && c.value === 0),
  };
}

/**
 * Filter set calls to find marker-related changes.
 * @param {Array} setCalls - Array of set call objects
 * @returns {{ startMarker: Array, endMarker: Array }} Filtered calls
 */
export function filterMarkerCalls(setCalls) {
  return {
    startMarker: setCalls.filter((c) => c.prop === "start_marker"),
    endMarker: setCalls.filter((c) => c.prop === "end_marker"),
  };
}
