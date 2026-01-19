import {
  liveApiCall,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "#src/test/mocks/mock-live-api.js";

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

  liveApiId.mockImplementation(
    /**
     * @this {{_id: string}}
     * @returns {string} The mock ID
     */
    function () {
      return this._id;
    },
  );

  liveApiPath.mockImplementation(
    /**
     * @this {{_path: string}}
     * @returns {string} The mock path
     */
    function () {
      return this._path;
    },
  );

  liveApiCall.mockImplementation(
    /**
     * @this {unknown}
     * @param {string} method - The method name to call
     * @returns {string | null} The mock result
     */
    function (method) {
      if (method === "get_version_string") {
        return version;
      }

      return null;
    },
  );

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
