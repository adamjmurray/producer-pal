import { setupCuePointMocksBase } from "#src/test/cue-point-mock-helpers.js";
import {
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";

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
