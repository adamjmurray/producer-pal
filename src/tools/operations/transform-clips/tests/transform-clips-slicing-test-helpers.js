import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";

/**
 * @typedef {object} MockLiveApiContext
 * @property {string | undefined} _path
 * @property {string | undefined} _id
 * @property {string} id
 * @property {string} path
 * @property {string} type
 */

/**
 * @typedef {object} SlicingBaseMockOptions
 * @property {string} [path] - The clip path (default: arrangement clip)
 * @property {string[]} [generatedPrefixes] - Prefixes for generated clip IDs
 */

/**
 * Setup basic clip mocks for slicing tests
 * @param {string} clipId - The clip ID to mock
 * @param {SlicingBaseMockOptions} [opts] - Options
 */
export function setupSlicingClipBaseMocks(clipId, opts = {}) {
  const {
    path = "live_set tracks 0 arrangement_clips 0",
    generatedPrefixes = ["holding_", "moved_", "tile_", "slice_"],
  } = opts;

  liveApiId.mockImplementation(
    /**
     * @this {MockLiveApiContext}
     * @returns {string | undefined} Mocked ID
     */
    function () {
      if (this._path === `id ${clipId}`) {
        return clipId;
      }

      return this._id;
    },
  );

  liveApiPath.mockImplementation(
    /**
     * @this {MockLiveApiContext}
     * @returns {string | undefined} Mocked path
     */
    function () {
      if (this._id === clipId) {
        return path;
      }

      // Generated clips get valid track paths
      if (generatedPrefixes.some((p) => this._id?.startsWith(p))) {
        return "live_set tracks 0 arrangement_clips 1";
      }

      return this._path;
    },
  );

  liveApiType.mockImplementation(
    /**
     * @this {MockLiveApiContext}
     * @returns {string | undefined} Mocked type
     */
    function () {
      if (this._id === clipId) {
        return "Clip";
      }
    },
  );
}

/**
 * Get property value for live_set path
 * @param {string | undefined} path - API path
 * @param {string} prop - Property name
 * @returns {number[] | null} Property value or null if not applicable
 */
function getLiveSetProp(path, prop) {
  if (path !== "live_set") return null;
  if (prop === "signature_numerator") return [4];
  if (prop === "signature_denominator") return [4];

  return null;
}

/**
 * Get property value for holding clip
 * @param {string | undefined} id - Clip ID
 * @param {string} prop - Property name
 * @param {number} clipLength - Clip length in beats
 * @returns {number[] | null} Property value or null if not applicable
 */
function getHoldingClipProp(id, prop, clipLength) {
  if (!id?.startsWith("holding_")) return null;
  if (prop === "end_time") return [40000 + clipLength];
  if (prop === "loop_start" || prop === "start_marker") return [0.0];

  return null;
}

/**
 * Get property value for generated clip
 * @param {string | undefined} id - Clip ID
 * @param {string} prop - Property name
 * @param {string[]} prefixes - Generated prefixes
 * @returns {number[] | null} Property value or null if not applicable
 */
function getGeneratedClipProp(id, prop, prefixes) {
  if (!prefixes.some((p) => id?.startsWith(p))) return null;
  if (prop === "loop_start" || prop === "start_marker") return [0.0];

  return null;
}

/**
 * @typedef {object} SlicingClipProps
 * @property {boolean} [isMidi] - Is MIDI clip (default: true)
 * @property {boolean} [looping] - Is looping (default: true)
 * @property {number} [startTime] - Start time in beats (default: 0)
 * @property {number} [endTime] - End time in beats (default: 16)
 * @property {number} [loopStart] - Loop start in beats (default: 0)
 * @property {number} [loopEnd] - Loop end in beats (default: 4)
 * @property {number} [endMarker] - End marker in beats (default: loopEnd)
 */

/**
 * Setup liveApiGet mock for slicing tests with looped clip
 * @param {string} clipId - The clip ID
 * @param {SlicingClipProps} [clipProps] - Clip properties
 * @param {string[]} [generatedPrefixes] - Prefixes for generated clips
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

  /** @type {Record<string, number>} */
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

  liveApiGet.mockImplementation(
    /**
     * @this {MockLiveApiContext}
     * @param {string} prop - Property name
     * @returns {number[]} Property value
     */
    function (prop) {
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
    },
  );
}

/**
 * @typedef {object} SlicingCallMockOptions
 * @property {string} [holdingPrefix] - Prefix for holding clip (default: "holding_")
 * @property {string} [movedPrefix] - Prefix for moved clip (default: "moved_")
 * @property {string} [tilePrefix] - Prefix for tiled clips (default: "tile_")
 */

/**
 * @typedef {object} DuplicateCall
 * @property {string} method - Method name
 * @property {unknown[]} args - Method arguments
 * @property {string | undefined} id - Clip ID
 */

/**
 * @typedef {object} SlicingCallState
 * @property {number} callCount - Number of calls
 * @property {DuplicateCall[]} duplicateCalls - Duplicate calls
 * @property {unknown[]} setCalls - Set calls
 */

/**
 * Create a liveApiCall mock for slicing operations
 * @param {SlicingCallMockOptions} [opts] - Options
 * @returns {SlicingCallState} State object for tracking mock calls
 */
export function createSlicingCallMock(opts = {}) {
  const {
    holdingPrefix = "holding_",
    movedPrefix = "moved_",
    tilePrefix = "tile_",
  } = opts;

  /** @type {SlicingCallState} */
  const state = { callCount: 0, duplicateCalls: [], setCalls: [] };

  liveApiCall.mockImplementation(
    /**
     * @this {MockLiveApiContext}
     * @param {string} method - Method name
     * @param {...unknown} _args - Method arguments
     * @returns {string[] | undefined} Result
     */
    function (method, ..._args) {
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
    },
  );

  return state;
}

/**
 * Setup all mocks for a standard looped clip slicing test
 * @param {string} clipId - The clip ID
 * @param {SlicingClipProps} [clipProps] - Clip properties (see setupSlicingClipGetMock)
 * @returns {{ callState: SlicingCallState }} - State object for tracking calls
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
 * @param {SlicingClipProps} [clipProps] - Clip properties (see setupSlicingClipGetMock)
 * @returns {{ callState: SlicingCallState }} - State object for tracking calls
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
 * @typedef {object} SetCall
 * @property {string} prop - Property name
 * @property {unknown} value - Property value
 */

/**
 * Filter set calls to find looping-related changes.
 * @param {SetCall[]} setCalls - Array of set call objects
 * @returns {{ enable: SetCall[], disable: SetCall[] }} Filtered calls
 */
export function filterLoopingCalls(setCalls) {
  return {
    enable: setCalls.filter((c) => c.prop === "looping" && c.value === 1),
    disable: setCalls.filter((c) => c.prop === "looping" && c.value === 0),
  };
}

/**
 * Filter set calls to find marker-related changes.
 * @param {SetCall[]} setCalls - Array of set call objects
 * @returns {{ startMarker: SetCall[], endMarker: SetCall[] }} Filtered calls
 */
export function filterMarkerCalls(setCalls) {
  return {
    startMarker: setCalls.filter((c) => c.prop === "start_marker"),
    endMarker: setCalls.filter((c) => c.prop === "end_marker"),
  };
}
