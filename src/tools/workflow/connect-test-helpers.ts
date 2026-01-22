import {
  liveApiCall,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "#src/test/mocks/mock-live-api.ts";

interface SetupConnectMocksOptions {
  liveSetName?: string;
  tempo?: number;
  version?: string;
  view?: string;
  liveSetOverrides?: Record<string, unknown>;
}

/**
 * Setup standard mocks for connect tests.
 * @param opts - Configuration options
 * @param opts.liveSetName - Live set name
 * @param opts.tempo - Tempo
 * @param opts.version - Ableton Live version
 * @param opts.view - Focused document view
 * @param opts.liveSetOverrides - Additional LiveSet property overrides
 */
export function setupConnectMocks(opts: SetupConnectMocksOptions = {}): void {
  const {
    liveSetName = "Test Project",
    tempo = 120,
    version = "12.3",
    view = "Session",
    liveSetOverrides = {},
  } = opts;

  liveApiId.mockImplementation(function (this: { _id: string }): string {
    return this._id;
  });

  liveApiPath.mockImplementation(function (this: { _path: string }): string {
    return this._path;
  });

  liveApiCall.mockImplementation(function (
    this: unknown,
    method: string,
  ): string | null {
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
