import { setupCuePointMocksBase } from "#src/test/cue-point-mock-helpers.js";
import {
  children,
  liveApiCall,
  liveApiGet,
} from "#src/test/mocks/mock-live-api.js";

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

/**
 * @typedef {object} LocatorCreationConfig
 * @property {number} [time=0] - Cue point time in beats
 * @property {number} [isPlaying=0] - Playing state (0 or 1)
 * @property {number} [songLength=1000] - Song length in beats
 */

/**
 * Setup mocks for locator creation tests with tracking.
 * Returns a tracker object to check if locator was created.
 * @param {LocatorCreationConfig} [config] - Configuration options
 * @returns {{getCreated: () => boolean}} Tracker object
 */
export function setupLocatorCreationMocks(config = {}) {
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
