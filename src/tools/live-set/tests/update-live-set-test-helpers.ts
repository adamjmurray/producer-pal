import { setupCuePointMocksBase } from "#src/test/cue-point-mock-helpers.js";

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
