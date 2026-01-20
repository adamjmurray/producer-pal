import { children, liveApiGet } from "#src/test/mocks/mock-live-api.ts";

interface CuePoint {
  id: string;
  time: number;
  name?: string;
}

interface CuePointMaps {
  cueIds: string[];
  cueTimeMap: Record<string, number>;
  cueNameMap: Record<string, string>;
}

/**
 * Builds cue point lookup maps from a cue points array.
 * @param cuePoints - Cue point definitions
 * @returns Cue point maps
 */
export function buildCuePointMaps(cuePoints: CuePoint[]): CuePointMaps {
  const cueIds = cuePoints.map((c) => c.id);
  const cueTimeMap: Record<string, number> = Object.fromEntries(
    cuePoints.map((c) => [c.id, c.time]),
  );
  const cueNameMap: Record<string, string> = Object.fromEntries(
    cuePoints
      .filter((c) => c.name != null)
      .map((c) => [c.id, c.name as string]),
  );

  return { cueIds, cueTimeMap, cueNameMap };
}

interface CuePointMockImplParams {
  cueTimeMap: Record<string, number>;
  cueNameMap: Record<string, string>;
  getOtherProps?: (this: { _path?: string }, prop: string) => unknown;
}

/**
 * Creates a liveApiGet mock implementation for cue point lookups.
 * @param params - Parameters
 * @param params.cueTimeMap - Map of cue ID to time
 * @param params.cueNameMap - Map of cue ID to name
 * @param params.getOtherProps - Optional handler for other properties
 * @returns Mock implementation function
 */
export function createCuePointMockImpl({
  cueTimeMap,
  cueNameMap,
  getOtherProps,
}: CuePointMockImplParams): (
  this: { _path?: string },
  prop: string,
) => unknown {
  return function (this: { _path?: string }, prop: string): unknown {
    // Handle cue point properties via ID path
    const idMatch = this._path?.match(/^id (\w+)$/);

    if (idMatch?.[1]) {
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

interface SetupCuePointMocksOptions {
  cuePoints: CuePoint[];
  liveSetProps?: Record<string, unknown>;
}

/**
 * Setup mocks for tests with cue points.
 * @param options - Configuration options
 * @param options.cuePoints - Cue point definitions
 * @param options.liveSetProps - Additional live set properties to mock
 * @returns Cue point maps
 */
export function setupCuePointMocksBase({
  cuePoints,
  liveSetProps = {},
}: SetupCuePointMocksOptions): CuePointMaps {
  const { cueIds, cueTimeMap, cueNameMap } = buildCuePointMaps(cuePoints);

  const allLiveSetProps: Record<string, unknown> = {
    cue_points: children(...cueIds),
    ...liveSetProps,
  };

  liveApiGet.mockImplementation(
    createCuePointMockImpl({
      cueTimeMap,
      cueNameMap,
      getOtherProps(
        this: { _path?: string },
        prop: string,
      ): unknown[] | undefined {
        if (this._path === "live_set" && prop in allLiveSetProps) {
          const value = allLiveSetProps[prop];

          return Array.isArray(value) ? value : [value];
        }
      },
    }),
  );

  return { cueIds, cueTimeMap, cueNameMap };
}
