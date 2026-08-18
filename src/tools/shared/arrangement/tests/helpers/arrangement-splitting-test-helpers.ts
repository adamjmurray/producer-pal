// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  lookupMockObject,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";

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
  const { path = livePath.track(0).arrangementClip(0) } = opts;

  // Register the main clip with trackIndex property
  registerMockObject(clipId, {
    path,
    type: "Clip",
    properties: {
      track_index: 0,
    },
  });

  // Register the track
  registerMockObject("track_0", {
    path: livePath.track(0),
    type: "Track",
    properties: {
      track_index: 0,
    },
  });

  // Register live_set for time signature
  registerMockObject("live_set", {
    path: "live_set",
    type: "Song",
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
    },
  });
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
 * Setup clip properties for splitting tests
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

  // Look up the existing clip mock (registered by setupSplittingClipBaseMocks)
  const clip = lookupMockObject(clipId);

  if (!clip) {
    throw new Error(
      "Clip mock not found - ensure setupSplittingClipBaseMocks was called first",
    );
  }

  // Add clip properties to the existing mock
  Object.assign(clip.properties, {
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
  });

  // Override the get mock to return proper values
  clip.get.mockImplementation((prop: string) => {
    const props = clip.properties as Record<string, number>;

    if (prop in props) {
      return [props[prop] as number];
    }

    return [0];
  });
}

interface DuplicateCall {
  method: string;
  args: unknown[];
  id: string | undefined;
}

interface SplittingCallState {
  duplicateCount: number;
  duplicateCalls: DuplicateCall[];
  trackMock: RegisteredMockObject;
}

/**
 * Create instance-level call mock for splitting operations.
 * Returns sequential "dup_N" IDs for duplicate_clip_to_arrangement calls.
 * @returns State object for tracking mock calls (includes trackMock for assertions)
 */
export function createSplittingCallMock(): SplittingCallState {
  // Look up the existing track mock (should be registered by setupSplittingClipBaseMocks)
  const trackMock = lookupMockObject("track_0", livePath.track(0));

  if (!trackMock) {
    throw new Error(
      "Track mock not found - ensure setupSplittingClipBaseMocks was called first",
    );
  }

  const state: SplittingCallState = {
    duplicateCount: 0,
    duplicateCalls: [],
    trackMock,
  };

  // Set up the call mock with stateful implementation
  trackMock.call.mockImplementation((method: string, ..._args: unknown[]) => {
    if (method === "duplicate_clip_to_arrangement") {
      state.duplicateCount++;
      const dupId = `dup_${state.duplicateCount}`;

      state.duplicateCalls.push({
        method,
        args: _args,
        id: dupId,
      });

      // Register the new duplicate clip dynamically
      registerMockObject(dupId, {
        path: livePath.track(0).arrangementClip(1),
        type: "Clip",
      });

      return ["id", dupId];
    }

    if (method === "create_midi_clip") {
      // Register temp clip
      registerMockObject("temp_1", {
        path: livePath.track(0).arrangementClip(1),
        type: "Clip",
      });

      return ["id", "temp_1"];
    }

    return undefined;
  });

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
  clearMockRegistry();
  setupSplittingClipBaseMocks(clipId);
  setupSplittingClipGetMock(clipId, clipProps);
  const callState = createSplittingCallMock();

  return { callState };
}

export const SPLIT_CLIP_ID = "clip_1";

interface SplitTestFixture {
  clipId: string;
  callState: SplittingCallState;
  mockClip: LiveAPI;
  clips: LiveAPI[];
}

/**
 * Setup mocks and the performSplitting arguments for a single-clip split test.
 * @param clipProps - Clip properties
 * @returns The clip id, call-tracking state, and the clip/clips arguments
 */
export function setupSplitTest(
  clipProps: SplittingClipProps = {},
): SplitTestFixture {
  const { callState } = setupClipSplittingMocks(SPLIT_CLIP_ID, clipProps);
  const mockClip = LiveAPI.from(`id ${SPLIT_CLIP_ID}`);

  return { clipId: SPLIT_CLIP_ID, callState, mockClip, clips: [mockClip] };
}

interface DuplicateCounter {
  count: number;
}

/**
 * Replace the track's call mock with a bare duplicate counter that returns
 * sequential "dup_N" ids without registering the duplicates.
 * @param trackMock - The track mock to override
 * @param opts - Options
 * @param opts.failOnDuplicate - 1-based duplicate call that returns the
 *   non-existent id "0" (Live's silent-failure signal) instead of a clip
 * @param opts.throwOnDuplicate - 1-based duplicate call that throws, the way a
 *   Live API error surfaces in V8
 * @returns Counter whose `count` tracks duplicate_clip_to_arrangement calls
 */
export function overrideWithDuplicateCounter(
  trackMock: RegisteredMockObject,
  opts: { failOnDuplicate?: number; throwOnDuplicate?: number } = {},
): DuplicateCounter {
  const counter: DuplicateCounter = { count: 0 };

  trackMock.call.mockImplementation((method: string) => {
    if (method === "duplicate_clip_to_arrangement") {
      counter.count++;

      if (counter.count === opts.throwOnDuplicate) {
        throw new Error("Live API error");
      }

      if (counter.count === opts.failOnDuplicate) return ["id", "0"];

      return ["id", `dup_${counter.count}`];
    }

    if (method === "create_midi_clip") return ["id", "temp_1"];

    return undefined;
  });

  return counter;
}

/**
 * Register fresh arrangement clips and make the track's rescan return them.
 * @param trackMock - The track mock whose arrangement_clips are rescanned
 * @param freshClips - [id, start_time] pairs, in arrangement-clip index order
 */
export function mockArrangementClipsRescan(
  trackMock: RegisteredMockObject,
  freshClips: Array<[string, number]>,
): void {
  for (const [index, [id, startTime]] of freshClips.entries()) {
    registerMockObject(id, {
      path: livePath.track(0).arrangementClip(index),
      type: "Clip",
      properties: { start_time: startTime },
    });
  }

  trackMock.get.mockImplementation((prop: string) =>
    prop === "arrangement_clips"
      ? freshClips.flatMap(([id]) => ["id", id])
      : [0],
  );
}
