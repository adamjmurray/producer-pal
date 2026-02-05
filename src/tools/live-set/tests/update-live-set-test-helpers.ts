// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { setupCuePointMocksBase } from "#src/test/helpers/cue-point-mock-helpers.ts";
import {
  children,
  liveApiCall,
  liveApiGet,
  liveApiId,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";

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
 * Setup mocks for locator operation tests
 * @param options - Configuration options
 * @param options.cuePoints - Cue point definitions
 * @param options.liveSet - Live set properties
 */
export function setupLocatorMocks({
  cuePoints = [],
  liveSet = {},
}: SetupLocatorMocksOptions = {}): void {
  const { numerator = 4, denominator = 4, isPlaying = 0, songLength } = liveSet;

  const liveSetProps: Record<string, unknown> = {
    signature_numerator: numerator,
    signature_denominator: denominator,
    is_playing: isPlaying,
  };

  if (songLength !== undefined) {
    liveSetProps.song_length = songLength;
  }

  setupCuePointMocksBase({ cuePoints, liveSetProps });
}

interface LocatorCreationConfig {
  time?: number;
  isPlaying?: number;
  songLength?: number;
}

/**
 * Setup mocks for locator creation tests with tracking.
 * Returns a tracker object to check if locator was created.
 * @param config - Configuration options
 * @param config.time - Cue point time in beats
 * @param config.isPlaying - Playing state (0 or 1)
 * @param config.songLength - Song length in beats
 * @returns Tracker object
 */
export function setupLocatorCreationMocks(config: LocatorCreationConfig = {}): {
  getCreated: () => boolean;
} {
  const { time = 0, isPlaying = 0, songLength = 1000 } = config;
  let locatorCreated = false;

  liveApiGet.mockImplementation(function (prop) {
    if (prop === "signature_numerator") return [4];
    if (prop === "signature_denominator") return [4];
    if (prop === "is_playing") return [isPlaying];
    if (prop === "song_length") return [songLength];

    if (prop === "cue_points") {
      return locatorCreated ? children("new_cue") : children();
    }

    if (prop === "time") return [time];

    return [0];
  });

  liveApiCall.mockImplementation(function (method) {
    if (method === "set_or_delete_cue") {
      locatorCreated = true;
    }
  });

  return { getCreated: () => locatorCreated };
}

interface SetupRoutingTestOptions {
  trackProps?: Record<string, unknown>;
}

/**
 * Setup common mocks for routing tests with a single track.
 * Configures liveApiId for live_set and track, and mockLiveApiGet for test data.
 * @param options - Configuration options
 * @param options.trackProps - Additional properties to include on the track
 */
export function setupRoutingTestMocks(
  options: SetupRoutingTestOptions = {},
): void {
  const { trackProps = {} } = options;

  liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
    if (this._path === "live_set") {
      return "live_set_id";
    }

    if (this._path === "live_set tracks 0") {
      return "track1";
    }

    return this._id;
  });

  mockLiveApiGet({
    LiveSet: {
      name: "Routing Test Set",
      tracks: children("track1"),
      scenes: [],
    },
    "live_set tracks 0": {
      has_midi_input: 1,
      name: "Test Track",
      ...trackProps,
    },
  });
}
