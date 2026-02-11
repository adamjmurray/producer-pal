// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import { setupCuePointMocksBase } from "#src/test/helpers/cue-point-mock-helpers.ts";
import { liveApiSet } from "#src/test/mocks/mock-live-api.ts";
import {
  type MockObjectHandle,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

interface LiveSetConfig {
  numerator?: number;
  denominator?: number;
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
  liveSet: MockObjectHandle;
  clipSlots: MockObjectHandle[];
}

/**
 * Setup default time signature mock (4/4) for playback tests.
 * Registers live_set and default tracks. Use in beforeEach to initialize standard test state.
 * @returns MockObjectHandle for the live_set object
 */
export function setupDefaultTimeSignature(): MockObjectHandle {
  const liveSet = registerMockObject("live_set", {
    path: "live_set",
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
    },
  });

  // Register default tracks (fallback getLiveSetProperty returns children("track1", "track2"))
  registerMockObject("track1", { path: "id track1", type: "Track" });
  registerMockObject("track2", { path: "id track2", type: "Track" });

  return liveSet;
}

/**
 * Setup mock for a clip that exists but has no track/scene info in its path
 * @param clipId - The clip ID to mock
 * @returns MockObjectHandle for the clip
 */
export function setupClipWithNoTrackPath(clipId: string): MockObjectHandle {
  return registerMockObject(clipId, {
    path: "some_invalid_path",
    type: "Clip",
  });
}

/**
 * Setup mocks for playback tests with cue points.
 * Uses global liveApiGet mock for backward compatibility with locator tests.
 * @param options - Configuration options
 * @param options.cuePoints - Cue point definitions
 * @param options.liveSet - Live set properties
 */
export function setupCuePointMocks({
  cuePoints,
  liveSet = {},
}: SetupCuePointMocksOptions): void {
  const {
    numerator = 4,
    denominator = 4,
    loop = 0,
    loopStart = 0,
    loopLength = 4,
    tracks = [],
  } = liveSet;

  setupCuePointMocksBase({
    cuePoints,
    liveSetProps: {
      signature_numerator: numerator,
      signature_denominator: denominator,
      loop,
      loop_start: loopStart,
      loop_length: loopLength,
      tracks,
    },
  });
}

/**
 * Assert that a Live set property was set.
 * When called with (property, value): uses shared liveApiSet mock (backward compat).
 * When called with (handle, property, value): uses instance-level handle.set mock.
 * @param handleOrProperty - MockObjectHandle or property name
 * @param propertyOrValue - Property name or expected value
 * @param value - Expected value (only when handle is provided)
 */
export function expectLiveSetProperty(
  handleOrProperty: MockObjectHandle | string,
  propertyOrValue: unknown,
  value?: unknown,
): void {
  if (typeof handleOrProperty === "string") {
    // Old signature for backward compatibility (locator tests)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      handleOrProperty,
      propertyOrValue,
    );
  } else {
    expect(handleOrProperty.set).toHaveBeenCalledWith(propertyOrValue, value);
  }
}

/**
 * Setup mocks for multiple clip path resolutions in playback tests.
 * Registers live_set, clips, and clip slots via mock registry.
 * @param clipMappings - Array of clip ID to path mappings (defaults to 3 clips)
 * @returns Handles for live_set and clip slots
 */
export function setupMultiClipMocks(
  clipMappings: ClipPathMapping[] = [
    { clipId: "clip1", path: "live_set tracks 0 clip_slots 0 clip" },
    { clipId: "clip2", path: "live_set tracks 1 clip_slots 1 clip" },
    { clipId: "clip3", path: "live_set tracks 2 clip_slots 2 clip" },
  ],
): MultiClipMockResult {
  const liveSet = registerMockObject("live_set", {
    path: "live_set",
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
      current_song_time: 5,
      loop: 0,
      loop_start: 0,
      loop_length: 4,
    },
  });

  // Register default tracks
  registerMockObject("track1", { path: "id track1", type: "Track" });
  registerMockObject("track2", { path: "id track2", type: "Track" });

  const clipSlots: MockObjectHandle[] = [];

  for (const mapping of clipMappings) {
    registerMockObject(mapping.clipId, { path: mapping.path });

    const clipSlotPath = mapping.path.replace(/ clip$/, "");

    clipSlots.push(registerMockObject(clipSlotPath, { path: clipSlotPath }));
  }

  return { liveSet, clipSlots };
}
