import { setupCuePointMocksBase } from "#src/test/cue-point-mock-helpers.js";

/**
 * Setup mocks for playback tests with cue points
 * @param {object} options - Configuration options
 * @param {Array<{id: string, time: number, name: string}>} options.cuePoints - Cue point definitions
 * @param {object} [options.liveSet] - Live set properties (defaults to 4/4, no loop)
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
