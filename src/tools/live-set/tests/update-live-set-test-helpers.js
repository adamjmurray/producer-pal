// @ts-nocheck -- TODO: Add JSDoc type annotations
import { setupCuePointMocksBase } from "#src/test/cue-point-mock-helpers.js";

/**
 * Setup mocks for locator operation tests
 * @param {object} options - Configuration options
 * @param {Array<{id: string, time: number, name?: string}>} options.cuePoints - Cue point definitions
 * @param {object} [options.liveSet] - Live set properties
 */
export function setupLocatorMocks({ cuePoints = [], liveSet = {} } = {}) {
  const { numerator = 4, denominator = 4, isPlaying = 0, songLength } = liveSet;

  const liveSetProps = {
    signature_numerator: numerator,
    signature_denominator: denominator,
    is_playing: isPlaying,
  };

  if (songLength !== undefined) {
    liveSetProps.song_length = songLength;
  }

  setupCuePointMocksBase({ cuePoints, liveSetProps });
}
