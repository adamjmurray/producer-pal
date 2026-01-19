import {
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";

/**
 * @typedef {object} ClipMockConfig
 * @property {string} id - Clip ID
 * @property {string} [path] - Clip path (default: session clip based on index)
 * @property {boolean} [isMidi] - Is MIDI clip (default: true)
 * @property {boolean} [isArrangement] - Is arrangement clip (default: false)
 * @property {number} [length] - Clip length in beats (default: 4.0)
 */

/**
 * Setup mocks for multiple session clips in transform-clips tests.
 * @param {string[]} clipIds - Array of clip IDs to mock
 * @param {object} [opts] - Options
 * @param {boolean} [opts.isMidi] - Are they MIDI clips (default: true)
 * @param {number} [opts.length] - Clip length in beats (default: 4.0)
 */
export function setupSessionClipMocks(clipIds, opts = {}) {
  const { isMidi = true, length = 4.0 } = opts;

  /** @type {Record<string, string>} */
  const idToPath = {};

  for (const [i, id] of clipIds.entries()) {
    idToPath[id] = `live_set tracks 0 clip_slots ${i} clip`;
  }

  liveApiId.mockImplementation(function () {
    for (const id of clipIds) {
      if (this._path === `id ${id}`) return id;
    }

    return this._id;
  });
  liveApiPath.mockImplementation(function () {
    return idToPath[this._id] ?? this._path;
  });
  liveApiType.mockImplementation(function () {
    return clipIds.includes(this._id) ? "Clip" : undefined;
  });
  liveApiGet.mockImplementation(function (prop) {
    if (!clipIds.includes(this._id)) return [0];
    const props = {
      is_midi_clip: [isMidi ? 1 : 0],
      is_audio_clip: [isMidi ? 0 : 1],
      is_arrangement_clip: [0],
      length: [length],
    };

    return props[prop] ?? [0];
  });
}

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
