// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mocks/mock-live-api.ts";

interface MockLiveApiContext {
  _path: string | undefined;
  _id: string | undefined;
  id: string;
  path: string;
  type: string;
}

interface SplittingBaseMockOptions {
  path?: string;
  generatedPrefixes?: string[];
}

/**
 * Setup basic clip mocks for splitting tests
 * @param clipId - The clip ID to mock
 * @param opts - Options
 */
export function setupSplittingClipBaseMocks(
  clipId: string,
  opts: SplittingBaseMockOptions = {},
): void {
  const {
    path = "live_set tracks 0 arrangement_clips 0",
    generatedPrefixes = ["holding_", "moved_", "tile_", "slice_"],
  } = opts;

  liveApiId.mockImplementation(
    /**
     * @this - Mock context
     * @returns Mocked ID
     */
    function (this: MockLiveApiContext): string {
      if (this._path === `id ${clipId}`) {
        return clipId;
      }

      return this._id ?? "";
    },
  );

  liveApiPath.mockImplementation(
    /**
     * @this - Mock context
     * @returns Mocked path
     */
    function (this: MockLiveApiContext): string | undefined {
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
     * @this - Mock context
     * @returns Mocked type
     */
    function (this: MockLiveApiContext): string | undefined {
      if (this._id === clipId) {
        return "Clip";
      }
    },
  );
}

/**
 * Get property value for live_set path
 * @param path - API path
 * @param prop - Property name
 * @returns Property value or null if not applicable
 */
function getLiveSetProp(
  path: string | undefined,
  prop: string,
): number[] | null {
  if (path !== "live_set") return null;
  if (prop === "signature_numerator") return [4];
  if (prop === "signature_denominator") return [4];

  return null;
}

/**
 * Get property value for holding clip
 * @param id - Clip ID
 * @param prop - Property name
 * @param clipLength - Clip length in beats
 * @returns Property value or null if not applicable
 */
function getHoldingClipProp(
  id: string | undefined,
  prop: string,
  clipLength: number,
): number[] | null {
  if (!id?.startsWith("holding_")) return null;
  if (prop === "end_time") return [40000 + clipLength];
  if (prop === "loop_start" || prop === "start_marker") return [0.0];

  return null;
}

/**
 * Get property value for generated clip
 * @param id - Clip ID
 * @param prop - Property name
 * @param prefixes - Generated prefixes
 * @returns Property value or null if not applicable
 */
function getGeneratedClipProp(
  id: string | undefined,
  prop: string,
  prefixes: string[],
): number[] | null {
  if (!prefixes.some((p) => id?.startsWith(p))) return null;
  if (prop === "loop_start" || prop === "start_marker") return [0.0];

  return null;
}

interface SplittingClipProps {
  isMidi?: boolean;
  looping?: boolean;
  startTime?: number;
  endTime?: number;
  loopStart?: number;
  loopEnd?: number;
  endMarker?: number;
}

/**
 * Setup liveApiGet mock for splitting tests with looped clip
 * @param clipId - The clip ID
 * @param clipProps - Clip properties
 * @param generatedPrefixes - Prefixes for generated clips
 */
export function setupSplittingClipGetMock(
  clipId: string,
  clipProps: SplittingClipProps = {},
  generatedPrefixes: string[] = [],
): void {
  const {
    isMidi = true,
    looping = true,
    startTime = 0.0,
    endTime = 16.0,
    loopStart = 0.0,
    loopEnd = 4.0,
    endMarker = loopEnd,
  } = clipProps;

  const mainClipProps: Record<string, number> = {
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
     * @this - Mock context
     * @param prop - Property name
     * @returns Property value
     */
    function (this: MockLiveApiContext, prop: string): number[] {
      const liveSetVal = getLiveSetProp(this._path, prop);

      if (liveSetVal) return liveSetVal;

      if (this._id === clipId && prop in mainClipProps)
        return [mainClipProps[prop] as number];

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

interface SplittingCallMockOptions {
  holdingPrefix?: string;
  movedPrefix?: string;
  tilePrefix?: string;
}

interface DuplicateCall {
  method: string;
  args: unknown[];
  id: string | undefined;
}

interface SplittingCallState {
  callCount: number;
  duplicateCalls: DuplicateCall[];
  setCalls: unknown[];
}

/**
 * Create a liveApiCall mock for splitting operations
 * @param opts - Options
 * @returns State object for tracking mock calls
 */
export function createSplittingCallMock(
  opts: SplittingCallMockOptions = {},
): SplittingCallState {
  const {
    holdingPrefix = "holding_",
    movedPrefix = "moved_",
    tilePrefix = "tile_",
  } = opts;

  const state: SplittingCallState = {
    callCount: 0,
    duplicateCalls: [],
    setCalls: [],
  };

  liveApiCall.mockImplementation(
    /**
     * @this - Mock context
     * @param method - Method name
     * @param _args - Method arguments
     * @returns Result
     */
    function (
      this: MockLiveApiContext,
      method: string,
      ..._args: unknown[]
    ): string[] | undefined {
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
 * Setup all mocks for a standard looped clip splitting test
 * @param clipId - The clip ID
 * @param clipProps - Clip properties (see setupSplittingClipGetMock)
 * @returns State object for tracking calls
 */
export function setupLoopedClipSplittingMocks(
  clipId: string,
  clipProps: SplittingClipProps = {},
): { callState: SplittingCallState } {
  const generatedPrefixes = ["holding_", "moved_", "tile_"];

  setupSplittingClipBaseMocks(clipId, { generatedPrefixes });
  setupSplittingClipGetMock(
    clipId,
    { looping: true, ...clipProps },
    generatedPrefixes,
  );
  const callState = createSplittingCallMock();

  return { callState };
}

/**
 * Setup all mocks for an unlooped clip splitting test
 * @param clipId - The clip ID
 * @param clipProps - Clip properties (see setupSplittingClipGetMock)
 * @returns State object for tracking calls
 */
export function setupUnloopedClipSplittingMocks(
  clipId: string,
  clipProps: SplittingClipProps = {},
): { callState: SplittingCallState } {
  const generatedPrefixes = ["holding_", "moved_", "slice_"];

  setupSplittingClipBaseMocks(clipId, { generatedPrefixes });
  setupSplittingClipGetMock(
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
  const callState = createSplittingCallMock({ tilePrefix: "slice_" });

  return { callState };
}

interface TwoClipBaseMockOptions {
  generatedPrefixes?: string[];
}

/**
 * Setup base mocks for two clips in splitting tests.
 * Used when testing scenarios with a primary clip and a secondary/following clip.
 * @param clip1Id - First clip ID
 * @param clip2Id - Second clip ID
 * @param opts - Options
 */
export function setupTwoClipBaseMocks(
  clip1Id: string,
  clip2Id: string,
  opts: TwoClipBaseMockOptions = {},
): void {
  const { generatedPrefixes = ["holding_", "moved_", "tile_"] } = opts;

  liveApiId.mockImplementation(
    /**
     * @this - Mock context
     * @returns Mocked ID
     */
    function (this: MockLiveApiContext): string {
      if (this._path === `id ${clip1Id}`) return clip1Id;
      if (this._path === `id ${clip2Id}`) return clip2Id;

      return this._id ?? "";
    },
  );
  liveApiPath.mockImplementation(
    /**
     * @this - Mock context
     * @returns Mocked path
     */
    function (this: MockLiveApiContext): string | undefined {
      if (this._id === clip1Id) return "live_set tracks 0 arrangement_clips 0";
      if (this._id === clip2Id) return "live_set tracks 0 arrangement_clips 1";

      if (generatedPrefixes.some((p) => this._id?.startsWith(p))) {
        return "live_set tracks 0 arrangement_clips 2";
      }

      return this._path;
    },
  );
  liveApiType.mockImplementation(
    /**
     * @this - Mock context
     * @returns Mocked type
     */
    function (this: MockLiveApiContext): string | undefined {
      if (this._id === clip1Id || this._id === clip2Id) return "Clip";
    },
  );
}

interface SetCall {
  prop: string;
  value: unknown;
}

/**
 * Filter set calls to find looping-related changes.
 * @param setCalls - Array of set call objects
 * @returns Filtered calls
 */
export function filterLoopingCalls(setCalls: SetCall[]): {
  enable: SetCall[];
  disable: SetCall[];
} {
  return {
    enable: setCalls.filter((c) => c.prop === "looping" && c.value === 1),
    disable: setCalls.filter((c) => c.prop === "looping" && c.value === 0),
  };
}

/**
 * Filter set calls to find marker-related changes.
 * @param setCalls - Array of set call objects
 * @returns Filtered calls
 */
export function filterMarkerCalls(setCalls: SetCall[]): {
  startMarker: SetCall[];
  endMarker: SetCall[];
} {
  return {
    startMarker: setCalls.filter((c) => c.prop === "start_marker"),
    endMarker: setCalls.filter((c) => c.prop === "end_marker"),
  };
}
