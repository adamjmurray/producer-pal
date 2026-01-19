import { setupCuePointMocksBase } from "#src/test/cue-point-mock-helpers.js";

/**
 * @typedef {object} LiveSetConfig
 * @property {number} [numerator=4] - Time signature numerator
 * @property {number} [denominator=4] - Time signature denominator
 * @property {number} [loop=0] - Loop enabled (0 or 1)
 * @property {number} [loopStart=0] - Loop start in beats
 * @property {number} [loopLength=4] - Loop length in beats
 * @property {unknown[]} [tracks=[]] - Track IDs
 */

/**
 * Setup mocks for playback tests with cue points
 * @param {object} options - Configuration options
 * @param {Array<{id: string, time: number, name: string}>} options.cuePoints - Cue point definitions
 * @param {LiveSetConfig} [options.liveSet] - Live set properties (defaults to 4/4, no loop)
 */
export function setupCuePointMocks({ cuePoints, liveSet = {} }) {
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
