// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
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
  const { path = "live_set tracks 0 arrangement_clips 0" } = opts;
  const generatedPrefixes = ["dup_", "temp_"];

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
 * Setup liveApiGet mock for splitting tests
 * @param clipId - The clip ID
 * @param clipProps - Clip properties
 */
export function setupSplittingClipGetMock(
  clipId: string,
  clipProps: SplittingClipProps = {},
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

      if (this._path === "live_set tracks 0" && prop === "track_index")
        return [0];

      return [0];
    },
  );
}

interface DuplicateCall {
  method: string;
  args: unknown[];
  id: string | undefined;
}

interface SplittingCallState {
  duplicateCount: number;
  duplicateCalls: DuplicateCall[];
}

/**
 * Create a liveApiCall mock for splitting operations.
 * Returns sequential "dup_N" IDs for duplicate_clip_to_arrangement calls.
 * @returns State object for tracking mock calls
 */
export function createSplittingCallMock(): SplittingCallState {
  const state: SplittingCallState = {
    duplicateCount: 0,
    duplicateCalls: [],
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
        state.duplicateCount++;
        state.duplicateCalls.push({ method, args: _args, id: this._id });

        return ["id", `dup_${state.duplicateCount}`];
      }

      if (method === "create_midi_clip") {
        return ["id", "temp_1"];
      }
    },
  );

  return state;
}

/**
 * Setup all mocks for a clip splitting test.
 * Works for all clip types (looped/unlooped, MIDI/audio).
 * @param clipId - The clip ID
 * @param clipProps - Clip properties
 * @returns State object for tracking calls
 */
export function setupClipSplittingMocks(
  clipId: string,
  clipProps: SplittingClipProps = {},
): { callState: SplittingCallState } {
  setupSplittingClipBaseMocks(clipId);
  setupSplittingClipGetMock(clipId, clipProps);
  const callState = createSplittingCallMock();

  return { callState };
}
