import { children, liveApiGet } from "#src/test/mocks/mock-live-api.js";

/**
 * Setup mocks for locator operation tests
 * @param {object} options - Configuration options
 * @param {Array<{id: string, time: number, name?: string}>} options.cuePoints - Cue point definitions
 * @param {object} [options.liveSet] - Live set properties
 */
export function setupLocatorMocks({ cuePoints = [], liveSet = {} } = {}) {
  const { numerator = 4, denominator = 4, isPlaying = 0, songLength } = liveSet;

  const cueIds = cuePoints.map((c) => c.id);

  // Build property maps for faster lookup
  const cueTimeMap = Object.fromEntries(cuePoints.map((c) => [c.id, c.time]));
  const cueNameMap = Object.fromEntries(
    cuePoints.filter((c) => c.name).map((c) => [c.id, c.name]),
  );

  liveApiGet.mockImplementation(function (prop) {
    if (prop === "signature_numerator") return [numerator];
    if (prop === "signature_denominator") return [denominator];
    if (prop === "is_playing") return [isPlaying];
    if (prop === "cue_points") return children(...cueIds);
    if (songLength !== undefined && prop === "song_length") return [songLength];

    const idMatch = this._path?.match(/^id (\w+)$/);

    if (idMatch) {
      const cueId = idMatch[1];

      if (prop === "time" && cueId in cueTimeMap) return [cueTimeMap[cueId]];
      if (prop === "name" && cueId in cueNameMap) return [cueNameMap[cueId]];
    }

    return [0];
  });
}
