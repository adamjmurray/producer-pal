import { children, liveApiGet } from "#src/test/mocks/mock-live-api.js";

/**
 * Builds cue point lookup maps from a cue points array.
 * @param {Array<{id: string, time: number, name?: string}>} cuePoints - Cue point definitions
 * @returns {{cueIds: string[], cueTimeMap: Record<string, number>, cueNameMap: Record<string, string>}} Cue point maps
 */
export function buildCuePointMaps(cuePoints) {
  const cueIds = cuePoints.map((c) => c.id);
  /** @type {Record<string, number>} */
  const cueTimeMap = Object.fromEntries(cuePoints.map((c) => [c.id, c.time]));
  /** @type {Record<string, string>} */
  const cueNameMap = Object.fromEntries(
    cuePoints
      .filter((c) => c.name != null)
      .map((c) => [c.id, /** @type {string} */ (c.name)]),
  );

  return { cueIds, cueTimeMap, cueNameMap };
}

/**
 * Creates a liveApiGet mock implementation for cue point lookups.
 * @param {object} params - Parameters
 * @param {Record<string, number>} params.cueTimeMap - Map of cue ID to time
 * @param {Record<string, string>} params.cueNameMap - Map of cue ID to name
 * @param {(this: {_path?: string}, prop: string) => unknown} [params.getOtherProps] - Optional handler for other properties
 * @returns {(this: {_path?: string}, prop: string) => unknown} Mock implementation function
 */
export function createCuePointMockImpl({
  cueTimeMap,
  cueNameMap,
  getOtherProps,
}) {
  /**
   * Mock implementation for liveApiGet
   * @this {{_path?: string}}
   * @param {string} prop - Property to get
   * @returns {unknown} - Mock return value
   */
  return function (prop) {
    // Handle cue point properties via ID path
    const idMatch = this._path?.match(/^id (\w+)$/);

    if (idMatch) {
      const cueId = idMatch[1];

      if (prop === "time" && cueId in cueTimeMap) return [cueTimeMap[cueId]];
      if (prop === "name" && cueId in cueNameMap) return [cueNameMap[cueId]];
    }

    // Delegate to custom handler if provided
    if (getOtherProps) {
      const result = getOtherProps.call(this, prop);

      if (result !== undefined) return result;
    }

    return [0];
  };
}

/**
 * Setup mocks for tests with cue points.
 * @param {object} options - Configuration options
 * @param {Array<{id: string, time: number, name?: string}>} options.cuePoints - Cue point definitions
 * @param {Record<string, unknown>} [options.liveSetProps] - Additional live set properties to mock
 * @returns {{cueIds: string[], cueTimeMap: Record<string, number>, cueNameMap: Record<string, string>}} - Cue point maps
 */
export function setupCuePointMocksBase({ cuePoints, liveSetProps = {} }) {
  const { cueIds, cueTimeMap, cueNameMap } = buildCuePointMaps(cuePoints);

  /** @type {Record<string, unknown>} */
  const allLiveSetProps = {
    cue_points: children(...cueIds),
    ...liveSetProps,
  };

  liveApiGet.mockImplementation(
    createCuePointMockImpl({
      cueTimeMap,
      cueNameMap,
      /**
       * Handle additional properties for live_set
       * @this {{_path?: string}}
       * @param {string} prop - Property to get
       * @returns {unknown[] | undefined} - Mock return value
       */
      getOtherProps(prop) {
        if (this._path === "live_set" && prop in allLiveSetProps) {
          const value = allLiveSetProps[prop];

          return Array.isArray(value) ? value : [value];
        }
      },
    }),
  );

  return { cueIds, cueTimeMap, cueNameMap };
}
