// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { setupLiveSetPathMappedMocks } from "./read-live-set-path-mapped-test-helpers.ts";

interface LocatorLiveSetConfig {
  numerator?: number;
  denominator?: number;
  isPlaying?: number;
  songLength?: number;
}

interface SetupLocatorMocksOptions {
  cuePoints?: Array<{ id: string; time: number; name?: string }>;
  liveSet?: LocatorLiveSetConfig;
}

/**
 * Setup mocks for locator operation tests using the mock registry.
 * Configures the live_set handle's get mock and registers cue point objects.
 * @param liveSetHandle - The live_set mock object handle
 * @param options - Configuration options
 * @param options.cuePoints - Cue point definitions
 * @param options.liveSet - Live set properties
 * @returns Map of cue point ID to mock object handle
 */
export function setupLocatorMocks(
  liveSetHandle: RegisteredMockObject,
  { cuePoints = [], liveSet = {} }: SetupLocatorMocksOptions = {},
): Map<string, RegisteredMockObject> {
  const { numerator = 4, denominator = 4, isPlaying = 0, songLength } = liveSet;

  const cueIds = cuePoints.map((c) => c.id);

  const liveSetProps: Record<string, unknown> = {
    signature_numerator: numerator,
    signature_denominator: denominator,
    is_playing: isPlaying,
    cue_points: children(...cueIds),
  };

  if (songLength !== undefined) {
    liveSetProps.song_length = songLength;
  }

  liveSetHandle.get.mockImplementation((prop: string) => {
    if (prop in liveSetProps) {
      const value = liveSetProps[prop];

      return Array.isArray(value) ? value : [value];
    }

    return [0];
  });

  const handles = new Map<string, RegisteredMockObject>();

  for (const [index, cp] of cuePoints.entries()) {
    const props: Record<string, unknown> = { time: cp.time };

    if (cp.name != null) props.name = cp.name;

    handles.set(
      cp.id,
      registerMockObject(cp.id, {
        path: livePath.cuePoint(index),
        properties: props,
      }),
    );
  }

  return handles;
}

interface LocatorCreationConfig {
  time?: number;
  isPlaying?: number;
  songLength?: number;
}

/**
 * Setup mocks for locator creation tests with tracking.
 * Returns a tracker and the new cue point handle.
 * @param liveSetHandle - The live_set mock object handle
 * @param config - Configuration options
 * @param config.time - Cue point time in beats
 * @param config.isPlaying - Playing state (0 or 1)
 * @param config.songLength - Song length in beats
 * @returns Tracker object and new cue handle
 */
export function setupLocatorCreationMocks(
  liveSetHandle: RegisteredMockObject,
  config: LocatorCreationConfig = {},
): {
  getCreated: () => boolean;
  newCue: RegisteredMockObject;
} {
  const { time = 0, isPlaying = 0, songLength = 1000 } = config;
  let locatorCreated = false;

  const newCue = registerMockObject("new_cue", {
    path: livePath.cuePoint(0),
    properties: { time },
  });

  liveSetHandle.get.mockImplementation((prop: string) => {
    if (prop === "signature_numerator") return [4];
    if (prop === "signature_denominator") return [4];
    if (prop === "is_playing") return [isPlaying];
    if (prop === "song_length") return [songLength];

    if (prop === "cue_points") {
      return locatorCreated ? children("new_cue") : children();
    }

    return [0];
  });

  liveSetHandle.call.mockImplementation((method: string) => {
    if (method === "set_or_delete_cue") {
      locatorCreated = true;
    }
  });

  return { getCreated: () => locatorCreated, newCue };
}

interface SetupRoutingTestOptions {
  trackProps?: Record<string, unknown>;
}

/**
 * Setup common mocks for routing tests with a single track.
 * Configures registry-based live_set and track objects for test data.
 * @param options - Configuration options
 * @param options.trackProps - Additional properties to include on the track
 */
export function setupRoutingTestMocks(
  options: SetupRoutingTestOptions = {},
): void {
  const { trackProps = {} } = options;

  setupLiveSetPathMappedMocks({
    liveSetId: "live_set_id",
    pathIdMap: {
      [String(livePath.track(0))]: "track1",
    },
    objects: {
      LiveSet: {
        name: "Routing Test Set",
        tracks: children("track1"),
        scenes: [],
      },
      [String(livePath.track(0))]: {
        has_midi_input: 1,
        name: "Test Track",
        ...trackProps,
      },
    },
  });
}
