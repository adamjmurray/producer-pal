import { vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
  liveApiType,
} from "#src/test/mock-live-api.js";

/**
 * Sets up the common mock implementations for select tests.
 * @returns {{ mockAppView: object, mockSongView: object, mockTrackAPI: object }} Mock objects
 */
export function setupSelectMocks() {
  const mockAppView = {
    call: liveApiCall,
    _id: "app_view_id",
    _path: "live_app view",
  };

  const mockSongView = {
    set: liveApiSet,
    call: liveApiCall,
    _id: "song_view_id",
    _path: "live_set view",
  };

  const mockTrackAPI = {
    exists: vi.fn().mockReturnValue(true),
    category: "regular",
    trackIndex: 1,
    _id: "id track_id_123",
    _path: "live_set view selected_track",
  };

  // Set up mock implementations
  liveApiId.mockImplementation(function () {
    return this._id || "id default";
  });

  // Set up liveApiGet for devices
  liveApiGet.mockReturnValue(["id", "device_123", "id", "device_456"]);

  // Default LiveAPI constructor mock
  global.LiveAPI.mockImplementation(function (path) {
    this.path = path;
    this._path = path;

    // Basic methods that all instances need
    this.exists = vi.fn().mockReturnValue(true);
    this.set = liveApiSet;
    this.call = liveApiCall;
    this.get = liveApiGet;
    this.getProperty = vi.fn();
    this.setProperty = vi.fn((property, value) => this.set(property, value));

    // Mock some specific properties based on path
    if (path === "live_app view") {
      Object.assign(this, mockAppView);
      this.getProperty.mockReturnValue(1); // Default to session view
      this.call.mockReturnValue(0); // Default to no special views visible
    } else if (path === "live_set view") {
      Object.assign(this, mockSongView);
    } else if (path === "live_set view selected_track") {
      Object.assign(this, mockTrackAPI);
      this.exists.mockReturnValue(false); // Default to no track selected
      this.trackIndex = null;
      this.returnTrackIndex = null;
      this.category = null;
      this.id = null;
      this.path = null;
    } else if (path === "live_set view selected_scene") {
      this.exists.mockReturnValue(false);
      this.sceneIndex = null;
      this.id = null;
    } else if (path === "live_set view detail_clip") {
      this.exists.mockReturnValue(false);
      this.id = null;
    } else if (path === "live_set view highlighted_clip_slot") {
      this.exists.mockReturnValue(false);
      this.trackIndex = null;
      this.sceneIndex = null;
    } else if (path.includes("clip_slots")) {
      this._id = "id clipslot_id_789";
    } else if (
      path.startsWith("live_set tracks") ||
      path.startsWith("live_set return_tracks") ||
      path.startsWith("live_set master_track")
    ) {
      this._id = "id track_id_123";
    } else if (path.startsWith("live_set scenes")) {
      this._id = "id scene_id_456";
    } else if (path.includes(" view") && path.includes("tracks")) {
      // Track view paths for device selection
      this.get.mockReturnValue(null);
    }

    // Add id getter that executes the mock function
    Object.defineProperty(this, "id", {
      get: function () {
        return liveApiId.apply(this);
      },
    });

    // Add type getter that executes the mock function
    Object.defineProperty(this, "type", {
      get: function () {
        return liveApiType.apply(this);
      },
    });

    return this;
  });

  // Mock static methods - from() should behave like the constructor
  global.LiveAPI.from = vi.fn((idOrPath) => {
    // Normalize ID format like the real LiveAPI.from does
    let path = idOrPath;

    if (
      typeof idOrPath === "number" ||
      (typeof idOrPath === "string" && /^\d+$/.test(idOrPath))
    ) {
      path = `id ${idOrPath}`;
    }

    const instance = new global.LiveAPI(path);

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
 * @returns {object} Default view state object
 */
export function getDefaultViewState() {
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
 * @param {object} changes - Properties to override in the default state
 * @returns {object} Merged view state object
 */
export function expectViewState(changes = {}) {
  return {
    ...getDefaultViewState(),
    ...changes,
  };
}
