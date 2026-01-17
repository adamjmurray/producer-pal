import {
  liveApiCall,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";

/**
 * Setup standard mocks for connect tests.
 * @param {object} opts - Configuration options
 * @param {string} [opts.liveSetName="Test Project"] - Live set name
 * @param {number} [opts.tempo=120] - Tempo
 * @param {string} [opts.version="12.2"] - Ableton Live version
 * @param {string} [opts.view="Session"] - Focused document view
 * @param {object} [opts.liveSetOverrides={}] - Additional LiveSet property overrides
 */
export function setupConnectMocks(opts = {}) {
  const {
    liveSetName = "Test Project",
    tempo = 120,
    version = "12.2",
    view = "Session",
    liveSetOverrides = {},
  } = opts;

  liveApiId.mockImplementation(function () {
    return this._id;
  });

  liveApiPath.mockImplementation(function () {
    return this._path;
  });

  liveApiCall.mockImplementation(function (method) {
    if (method === "get_version_string") {
      return version;
    }

    return null;
  });

  mockLiveApiGet({
    LiveSet: {
      name: liveSetName,
      tempo,
      signature_numerator: 4,
      signature_denominator: 4,
      is_playing: 0,
      tracks: [],
      scenes: [],
      ...liveSetOverrides,
    },
    AppView: {
      focused_document_view: view,
    },
  });
}
