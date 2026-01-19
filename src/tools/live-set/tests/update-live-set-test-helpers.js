import { setupCuePointMocksBase } from "#src/test/cue-point-mock-helpers.js";

/**
 * @typedef {object} LocatorLiveSetConfig
 * @property {number} [numerator=4] - Time signature numerator
 * @property {number} [denominator=4] - Time signature denominator
 * @property {number} [isPlaying=0] - Playing state (0 or 1)
 * @property {number} [songLength] - Song length in beats
 */

/**
 * Setup mocks for locator operation tests
 * @param {object} [options] - Configuration options
 * @param {Array<{id: string, time: number, name?: string}>} [options.cuePoints] - Cue point definitions
 * @param {LocatorLiveSetConfig} [options.liveSet] - Live set properties
 */
export function setupLocatorMocks({ cuePoints = [], liveSet = {} } = {}) {
  const { numerator = 4, denominator = 4, isPlaying = 0, songLength } = liveSet;

  /** @type {Record<string, unknown>} */
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
