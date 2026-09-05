// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { setupCuePointMocksRegistry } from "#src/test/helpers/cue-point-test-helpers.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

interface LiveSetConfig {
  numerator?: number;
  denominator?: number;
  startTime?: number;
  loop?: number;
  loopStart?: number;
  loopLength?: number;
  tracks?: unknown[];
}

interface CuePoint {
  id: string;
  time: number;
  name: string;
}

interface SetupCuePointMocksOptions {
  cuePoints: CuePoint[];
  liveSet?: LiveSetConfig;
}

interface ClipPathMapping {
  clipId: string;
  path: string;
}

interface MultiClipMockResult {
  liveSet: RegisteredMockObject;
  clipSlots: RegisteredMockObject[];
}

/**
 * Setup a live_set mock with standard transport properties (4/4, loop off).
 * Override any property via the overrides parameter.
 * @param overrides - Properties to override on the live_set mock
 * @returns RegisteredMockObject for the live_set object
 */
export function setupPlaybackLiveSet(
  overrides: Record<string, unknown> = {},
): RegisteredMockObject {
  return registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
      loop: 0,
      loop_start: 0,
      loop_length: 4,
      ...overrides,
    },
  });
}

/**
 * Setup default time signature mock (4/4) for playback tests.
 * Registers live_set and default tracks. Use in beforeEach to initialize standard test state.
 * @returns RegisteredMockObject for the live_set object
 */
export function setupDefaultTimeSignature(): RegisteredMockObject {
  const liveSet = registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
    },
  });

  // Register default tracks (fallback getLiveSetProperty returns children("track1", "track2"))
  registerMockObject("track1", { path: livePath.track(0), type: "Track" });
  registerMockObject("track2", { path: livePath.track(1), type: "Track" });

  return liveSet;
}

/**
 * Setup mock for a clip that exists but has no track/scene info in its path
 * @param clipId - The clip ID to mock
 * @returns RegisteredMockObject for the clip
 */
export function setupClipWithNoTrackPath(clipId: string): RegisteredMockObject {
  return registerMockObject(clipId, {
    path: "some_invalid_path",
    type: "Clip",
  });
}

/**
 * Setup registry-based mocks for playback tests with cue points.
 * @param options - Configuration options
 * @param options.cuePoints - Cue point definitions
 * @param options.liveSet - Live set properties
 * @returns RegisteredMockObject for the live_set object
 */
export function setupCuePointMocks({
  cuePoints,
  liveSet = {},
}: SetupCuePointMocksOptions): RegisteredMockObject {
  const {
    numerator = 4,
    denominator = 4,
    startTime = 0,
    loop = 0,
    loopStart = 0,
    loopLength = 4,
    tracks = [],
  } = liveSet;

  const { liveSet: liveSetHandle } = setupCuePointMocksRegistry({
    cuePoints,
    liveSetProps: {
      signature_numerator: numerator,
      signature_denominator: denominator,
      start_time: startTime,
      loop,
      loop_start: loopStart,
      loop_length: loopLength,
      tracks,
    },
  });

  return liveSetHandle;
}

/**
 * Assert that a Live set property was set via a handle's instance mock.
 * @param handle - RegisteredMockObject for the live_set object
 * @param property - Property name
 * @param value - Expected value
 */
export function expectLiveSetProperty(
  handle: RegisteredMockObject,
  property: string,
  value: unknown,
): void {
  expect(handle.set).toHaveBeenCalledWith(property, value);
}

/**
 * Assert the loop was left untouched, all three writes of it. A loop that
 * can't be had is refused whole: writing the start and then refusing the
 * length would leave a loop the caller never asked for.
 * @param handle - RegisteredMockObject for the live_set object
 */
export function expectLoopNotWritten(handle: RegisteredMockObject): void {
  for (const property of ["loop", "loop_start", "loop_length"]) {
    expect(handle.set).not.toHaveBeenCalledWith(property, expect.anything());
  }
}

/**
 * Assert the loop a playback result reports: on or off, and the bounds when it
 * names them.
 * @param result - The playback result
 * @param expected - The loop state the result should report
 * @param expected.loop - Whether the result says the loop is on
 * @param expected.start - Expected loopStart, omitted when none is reported
 * @param expected.end - Expected loopEnd, omitted when none is reported
 */
export function expectReportedLoop(
  result: { loop?: boolean; loopStart?: string; loopEnd?: string },
  expected: { loop?: boolean; start?: string; end?: string },
): void {
  expect(result.loop).toBe(expected.loop);
  expect(result.loopStart).toBe(expected.start);
  expect(result.loopEnd).toBe(expected.end);
}

/**
 * Assert the loop-ordering warning reached the model.
 */
export function expectLoopOrderWarning(): void {
  expect(capturedWarnings()).toContainEqual(
    expect.stringContaining("is not after loopStart"),
  );
}

/**
 * Assert every given clip slot was fired.
 * @param clipSlots - RegisteredMockObjects for the clip slots
 */
export function expectAllClipSlotsFired(
  clipSlots: RegisteredMockObject[],
): void {
  for (const clipSlot of clipSlots) {
    expect(clipSlot.call).toHaveBeenCalledWith("fire");
  }
}

/**
 * Assert the multi-clip quantization fix ran: the transport is stopped and
 * restarted around the fire calls so the clips launch together.
 * @param handle - RegisteredMockObject for the live_set object
 */
export function expectQuantizationFixApplied(
  handle: RegisteredMockObject,
): void {
  expect(handle.call).toHaveBeenCalledWith("stop_playing");
  expect(handle.call).toHaveBeenCalledWith("start_playing");
}

/**
 * Setup mocks for multiple clip path resolutions in playback tests.
 * Registers live_set, clips, and clip slots via mock registry.
 * @param clipMappings - Array of clip ID to path mappings (defaults to 3 clips)
 * @returns Handles for live_set and clip slots
 */
export function setupMultiClipMocks(
  clipMappings: ClipPathMapping[] = [
    { clipId: "clip1", path: livePath.track(0).clipSlot(0).clip() },
    { clipId: "clip2", path: livePath.track(1).clipSlot(1).clip() },
    { clipId: "clip3", path: livePath.track(2).clipSlot(2).clip() },
  ],
): MultiClipMockResult {
  const liveSet = registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
      loop: 0,
      loop_start: 0,
      loop_length: 4,
    },
  });

  // Register default tracks
  registerMockObject("track1", { path: livePath.track(0), type: "Track" });
  registerMockObject("track2", { path: livePath.track(1), type: "Track" });

  const clipSlots: RegisteredMockObject[] = [];

  for (const mapping of clipMappings) {
    registerMockObject(mapping.clipId, { path: mapping.path });

    const clipSlotPath = mapping.path.replace(/ clip$/, "");

    clipSlots.push(registerMockObject(clipSlotPath, { path: clipSlotPath }));
  }

  return { liveSet, clipSlots };
}
