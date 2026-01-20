import { setupCuePointMocksBase } from "#src/test/cue-point-mock-helpers.ts";
import {
  liveApiId,
  liveApiPath,
  liveApiType,
  mockLiveApiGet,
} from "#src/test/mocks/mock-live-api.ts";

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

interface MockContext {
  _id?: string;
  _path?: string;
}

interface ClipPathMapping {
  clipId: string;
  path: string;
}

/**
 * Setup default time signature mock (4/4) for playback tests.
 * Use in beforeEach to initialize standard test state.
 */
export function setupDefaultTimeSignature(): void {
  mockLiveApiGet({
    LiveSet: {
      signature_numerator: 4,
      signature_denominator: 4,
    },
  });
}

/**
 * Setup mock for a clip that exists but has no track/scene info in its path
 * @param clipId - The clip ID to mock
 */
export function setupClipWithNoTrackPath(clipId: string): void {
  liveApiPath.mockImplementation(function (this: MockContext) {
    if (this._id === clipId) {
      return "some_invalid_path"; // No track info in path
    }

    return this._path;
  });

  liveApiId.mockImplementation(function (this: MockContext) {
    if (this._id === clipId) {
      return `id ${clipId}`;
    }

    return "id 1";
  });

  liveApiType.mockImplementation(function (this: MockContext) {
    if (this._id === clipId) {
      return "Clip";
    }

    return "LiveSet";
  });
}

/**
 * Setup mocks for playback tests with cue points
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
 * Setup mocks for multiple clip path resolutions in playback tests.
 * Configures both the LiveSet state and clip path mappings.
 * @param clipMappings - Array of clip ID to path mappings (defaults to 3 clips)
 */
export function setupMultiClipMocks(
  clipMappings: ClipPathMapping[] = [
    { clipId: "clip1", path: "live_set tracks 0 clip_slots 0 clip" },
    { clipId: "clip2", path: "live_set tracks 1 clip_slots 1 clip" },
    { clipId: "clip3", path: "live_set tracks 2 clip_slots 2 clip" },
  ],
): void {
  mockLiveApiGet({
    ClipSlot: { has_clip: 1 },
    LiveSet: {
      signature_numerator: 4,
      signature_denominator: 4,
      current_song_time: 5,
      loop: 0,
      loop_start: 0,
      loop_length: 4,
    },
  });

  liveApiPath.mockImplementation(function (this: MockContext) {
    for (const mapping of clipMappings) {
      if (this._path === mapping.clipId) {
        return mapping.path;
      }
    }

    return this._path;
  });
}
