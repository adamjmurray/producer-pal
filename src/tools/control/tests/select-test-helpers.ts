import type { Mock } from "vitest";
import { vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
  liveApiType,
} from "#src/test/mocks/mock-live-api.ts";

// Type for the mock LiveAPI constructor (used in tests)
type MockLiveAPIInstance = {
  _path?: string;
  _id?: string;
  path?: string | null;
  id?: string | null;
  exists: Mock;
  set: Mock;
  call: Mock;
  get: Mock;
  getProperty: Mock;
  setProperty: Mock;
  trackIndex?: number | null;
  returnTrackIndex?: number | null;
  category?: string | null;
  sceneIndex?: number | null;
  type?: string;
};

type MockLiveAPIConstructor = Mock<(path?: string) => MockLiveAPIInstance> & {
  from: Mock;
  mockImplementation: Mock["mockImplementation"];
};

// Access globalThis.LiveAPI with proper typing for tests
const getGlobalLiveAPI = (): MockLiveAPIConstructor =>
  (globalThis as unknown as { LiveAPI: MockLiveAPIConstructor }).LiveAPI;

// Common path constants for mock implementations
const PATH_LIVE_APP_VIEW = "live_app view";
const PATH_LIVE_SET_VIEW = "live_set view";
const PATH_SELECTED_TRACK = "live_set view selected_track";

interface MockAppView {
  call: Mock;
  _id: string;
  _path: string;
}

interface MockSongView {
  set: Mock;
  call: Mock;
  _id: string;
  _path: string;
}

interface MockTrackAPI {
  exists: Mock;
  category: string;
  trackIndex: number;
  _id: string;
  _path: string;
}

export interface SelectMocks {
  mockAppView: MockAppView;
  mockSongView: MockSongView;
  mockTrackAPI: MockTrackAPI;
}

interface ViewState {
  view: string;
  detailView: string | null;
  showBrowser: boolean;
  selectedTrack: {
    trackId: string | null;
    category: string | null;
    trackIndex?: number | null;
    returnTrackIndex?: number | null;
  };
  selectedClipId: string | null;
  selectedDeviceId: string | null;
  selectedScene: {
    sceneId: string | null;
    sceneIndex: number | null;
  };
  selectedClipSlot: { trackIndex: number; sceneIndex: number } | null;
}

/**
 * Sets up the common mock implementations for select tests.
 * @returns Mock objects
 */
export function setupSelectMocks(): SelectMocks {
  const mockAppView: MockAppView = {
    call: liveApiCall,
    _id: "app_view_id",
    _path: PATH_LIVE_APP_VIEW,
  };

  const mockSongView: MockSongView = {
    set: liveApiSet,
    call: liveApiCall,
    _id: "song_view_id",
    _path: PATH_LIVE_SET_VIEW,
  };

  const mockTrackAPI: MockTrackAPI = {
    exists: vi.fn().mockReturnValue(true),
    category: "regular",
    trackIndex: 1,
    _id: "id track_id_123",
    _path: PATH_SELECTED_TRACK,
  };

  // Set up mock implementations
  liveApiId.mockImplementation(function (this: { _id?: string }) {
    return this._id ?? "id default";
  });

  // Set up liveApiGet for devices
  liveApiGet.mockReturnValue(["id", "device_123", "id", "device_456"]);

  // Default LiveAPI constructor mock
  const MockLiveAPI = getGlobalLiveAPI();

  MockLiveAPI.mockImplementation(function (
    this: Record<string, unknown>,
    path: string,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- needed for mock context
    const self = this;

    self.path = path;
    self._path = path;

    // Basic methods that all instances need
    self.exists = vi.fn().mockReturnValue(true);
    self.set = liveApiSet;
    self.call = liveApiCall;
    self.get = liveApiGet;
    self.getProperty = vi.fn();
    self.setProperty = vi.fn((property: string, value: unknown) =>
      liveApiSet(property, value),
    );

    // Mock some specific properties based on path
    if (path === PATH_LIVE_APP_VIEW) {
      Object.assign(self, mockAppView);
      (self.getProperty as Mock).mockReturnValue(1); // Default to session view
      (self.call as Mock).mockReturnValue(0); // Default to no special views visible
    } else if (path === PATH_LIVE_SET_VIEW) {
      Object.assign(self, mockSongView);
    } else if (path === PATH_SELECTED_TRACK) {
      Object.assign(self, mockTrackAPI);
      (self.exists as Mock).mockReturnValue(false); // Default to no track selected
      self.trackIndex = null;
      self.returnTrackIndex = null;
      self.category = null;
      self.id = null;
      self.path = null;
    } else if (path === "live_set view selected_scene") {
      (self.exists as Mock).mockReturnValue(false);
      self.sceneIndex = null;
      self.id = null;
    } else if (path === "live_set view detail_clip") {
      (self.exists as Mock).mockReturnValue(false);
      self.id = null;
    } else if (path === "live_set view highlighted_clip_slot") {
      (self.exists as Mock).mockReturnValue(false);
      self.trackIndex = null;
      self.sceneIndex = null;
    } else if (path.includes("clip_slots")) {
      self._id = "id clipslot_id_789";
    } else if (
      path.startsWith("live_set tracks") ||
      path.startsWith("live_set return_tracks") ||
      path.startsWith("live_set master_track")
    ) {
      self._id = "id track_id_123";
    } else if (path.startsWith("live_set scenes")) {
      self._id = "id scene_id_456";
    } else if (path.includes(" view") && path.includes("tracks")) {
      // Track view paths for device selection
      (self.get as Mock).mockReturnValue(null);
    }

    // Add id getter that executes the mock function
    Object.defineProperty(self, "id", {
      get: function (this: { _id?: string }) {
        return liveApiId.apply(this);
      },
    });

    // Add type getter that executes the mock function
    Object.defineProperty(self, "type", {
      get: function (this: { _path?: string }) {
        return liveApiType.apply(this);
      },
    });

    return self;
  });

  // Mock static methods - from() should behave like the constructor
  MockLiveAPI.from = vi.fn((idOrPath: string | number) => {
    // Normalize ID format like the real LiveAPI.from does
    let path = idOrPath;

    if (
      typeof idOrPath === "number" ||
      (typeof idOrPath === "string" && /^\d+$/.test(idOrPath))
    ) {
      path = `id ${idOrPath}`;
    }

    const instance = new (MockLiveAPI as unknown as new (
      p: string,
    ) => Record<string, unknown>)(path as string);

    // For ID-based lookups, ensure the ID is preserved correctly
    if (typeof path === "string" && path.startsWith("id ")) {
      instance._id = path;
    }

    return instance;
  });

  return { mockAppView, mockSongView, mockTrackAPI };
}

/**
 * Returns the expected default view state for select() results.
 * @returns Default view state object
 */
export function getDefaultViewState(): ViewState {
  return {
    view: "session",
    detailView: null,
    showBrowser: false,
    selectedTrack: {
      trackId: null,
      category: null,
    },
    selectedClipId: null,
    selectedDeviceId: null,
    selectedScene: {
      sceneId: null,
      sceneIndex: null,
    },
    selectedClipSlot: null,
  };
}

/**
 * Helper function to merge expected changes with default view state.
 * @param changes - Properties to override in the default state
 * @returns Merged view state object
 */
export function expectViewState(changes: Partial<ViewState> = {}): ViewState {
  return {
    ...getDefaultViewState(),
    ...changes,
  };
}

interface SessionClipMockOptions {
  appViewCall?: Mock;
}

/**
 * Create mocked session clip and clip slot objects for testing
 * @param liveApiSetMock - Mock function for liveApiSet
 * @param options - Optional configuration
 * @returns Function to use as LiveAPI mock implementation
 */
export function createSessionClipMockImpl(
  liveApiSetMock: Mock,
  options: SessionClipMockOptions = {},
): (path: string) => Record<string, unknown> {
  const mockSessionClip = {
    exists: vi.fn().mockReturnValue(true),
    _id: "id session_clip_123",
    trackIndex: 2,
    clipSlotIndex: 3,
  };

  Object.defineProperty(mockSessionClip, "id", {
    get() {
      return this._id;
    },
  });

  Object.defineProperty(mockSessionClip, "type", {
    get() {
      return "Clip";
    },
  });

  const mockClipSlot = {
    exists: vi.fn().mockReturnValue(true),
    _id: "id clipslot_456",
  };

  Object.defineProperty(mockClipSlot, "id", {
    get() {
      return this._id;
    },
  });

  return function (path: string) {
    if (path === PATH_LIVE_APP_VIEW) {
      return {
        getProperty: vi.fn().mockReturnValue(1),
        call: options.appViewCall ?? vi.fn().mockReturnValue(0),
      };
    }

    if (path === PATH_LIVE_SET_VIEW) {
      return {
        set: liveApiSetMock,
        setProperty: vi.fn((property: string, value: unknown) =>
          liveApiSetMock(property, value),
        ),
      };
    }

    if (path === "id session_clip_123") {
      return mockSessionClip;
    }

    if (path === "live_set tracks 2 clip_slots 3") {
      return mockClipSlot;
    }

    if (
      path === PATH_SELECTED_TRACK ||
      path === "live_set view selected_scene" ||
      path === "live_set view detail_clip" ||
      path === "live_set view highlighted_clip_slot"
    ) {
      return { exists: vi.fn().mockReturnValue(false) };
    }

    return { exists: vi.fn().mockReturnValue(false) };
  };
}
