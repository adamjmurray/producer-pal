import { children, liveApiGet } from "#src/test/mocks/mock-live-api.js";

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

  const cueIds = cuePoints.map((c) => c.id);

  // Build property maps for faster lookup
  const cueTimeMap = Object.fromEntries(cuePoints.map((c) => [c.id, c.time]));
  const cueNameMap = Object.fromEntries(cuePoints.map((c) => [c.id, c.name]));

  // Pre-build live_set property map
  const liveSetProps = {
    signature_numerator: [numerator],
    signature_denominator: [denominator],
    loop: [loop],
    loop_start: [loopStart],
    loop_length: [loopLength],
    cue_points: children(...cueIds),
    tracks,
  };

  liveApiGet.mockImplementation(function (prop) {
    if (this._path === "live_set" && prop in liveSetProps) {
      return liveSetProps[prop];
    }

    const idMatch = this._path?.match(/^id (\w+)$/);

    if (idMatch) {
      const cueId = idMatch[1];

      if (prop === "time" && cueId in cueTimeMap) return [cueTimeMap[cueId]];
      if (prop === "name" && cueId in cueNameMap) return [cueNameMap[cueId]];
    }

    return [0];
  });
}
