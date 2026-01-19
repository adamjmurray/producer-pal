import {
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";

/**
 * Setup mocks for a single clip in transform-clips tests.
 * @param {string} clipId - The clip ID to mock
 * @param {object} opts - Options
 * @param {string} opts.path - The clip path (default: session clip)
 * @param {boolean} opts.isMidi - Is MIDI clip (default: true)
 * @param {boolean} opts.isArrangement - Is arrangement clip (default: false)
 * @param {number} opts.length - Clip length in beats (default: 4.0)
 */
export function setupClipMocks(clipId, opts = {}) {
  const {
    path = "live_set tracks 0 clip_slots 0 clip",
    isMidi = true,
    isArrangement = false,
    length = 4.0,
  } = opts;

  liveApiId.mockImplementation(function () {
    return this._path === `id ${clipId}` ? clipId : this._id;
  });
  liveApiPath.mockImplementation(function () {
    return this._id === clipId ? path : this._path;
  });
  liveApiType.mockImplementation(function () {
    return this._id === clipId ? "Clip" : undefined;
  });
  liveApiGet.mockImplementation(function (prop) {
    if (this._id !== clipId) return [0];
    const props = {
      is_midi_clip: [isMidi ? 1 : 0],
      is_audio_clip: [isMidi ? 0 : 1],
      is_arrangement_clip: [isArrangement ? 1 : 0],
      length: [length],
    };

    return props[prop] ?? [0];
  });
}
