/// <reference path="../../../types/max-globals.d.ts" />
import { vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";

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
  liveApiId.mockImplementation(
    /**
     * @this {{_id?: string}}
     * @returns {string} The mock ID
     */
    function () {
      return this._id || "id default";
    },
  );

  // Set up liveApiGet for devices
  liveApiGet.mockReturnValue(["id", "device_123", "id", "device_456"]);

  // Default LiveAPI constructor mock
  // eslint-disable-next-line complexity -- mock handles many path variations
  globalThis.LiveAPI.mockImplementation(function (path) {
    /** @type {Record<string, unknown>} */
    // @ts-expect-error - this context is provided by vitest mock at runtime
    const self = this;

    self.path = path;
    self._path = path;

    // Basic methods that all instances need
    self.exists = vi.fn().mockReturnValue(true);
    self.set = liveApiSet;
    self.call = liveApiCall;
    self.get = liveApiGet;
    self.getProperty = vi.fn();
    self.setProperty = vi.fn(
      /**
       * @param {string} property - Property name
       * @param {unknown} value - Property value
       * @returns {void}
       */
      (property, value) => liveApiSet(property, value),
    );

    // Mock some specific properties based on path
    if (path === "live_app view") {
      Object.assign(self, mockAppView);
      /** @type {import("vitest").Mock} */ (self.getProperty).mockReturnValue(
        1,
      ); // Default to session view
      /** @type {import("vitest").Mock} */ (self.call).mockReturnValue(0); // Default to no special views visible
    } else if (path === "live_set view") {
      Object.assign(self, mockSongView);
    } else if (path === "live_set view selected_track") {
      Object.assign(self, mockTrackAPI);
      /** @type {import("vitest").Mock} */ (self.exists).mockReturnValue(false); // Default to no track selected
      self.trackIndex = null;
      self.returnTrackIndex = null;
      self.category = null;
      self.id = null;
      self.path = null;
    } else if (path === "live_set view selected_scene") {
      /** @type {import("vitest").Mock} */ (self.exists).mockReturnValue(false);
      self.sceneIndex = null;
      self.id = null;
    } else if (path === "live_set view detail_clip") {
      /** @type {import("vitest").Mock} */ (self.exists).mockReturnValue(false);
      self.id = null;
    } else if (path === "live_set view highlighted_clip_slot") {
      /** @type {import("vitest").Mock} */ (self.exists).mockReturnValue(false);
      self.trackIndex = null;
      self.sceneIndex = null;
    } else if (path?.includes("clip_slots")) {
      self._id = "id clipslot_id_789";
    } else if (
      path?.startsWith("live_set tracks") ||
      path?.startsWith("live_set return_tracks") ||
      path?.startsWith("live_set master_track")
    ) {
      self._id = "id track_id_123";
    } else if (path?.startsWith("live_set scenes")) {
      self._id = "id scene_id_456";
    } else if (path?.includes(" view") && path.includes("tracks")) {
      // Track view paths for device selection
      /** @type {import("vitest").Mock} */ (self.get).mockReturnValue(null);
    }

    // Add id getter that executes the mock function
    Object.defineProperty(self, "id", {
      get: function () {
        return liveApiId.apply(this);
      },
    });

    // Add type getter that executes the mock function
    Object.defineProperty(self, "type", {
      get: function () {
        return liveApiType.apply(this);
      },
    });

    return self;
  });

  // Mock static methods - from() should behave like the constructor
  globalThis.LiveAPI.from = vi.fn((idOrPath) => {
    // Normalize ID format like the real LiveAPI.from does
    let path = idOrPath;

    if (
      typeof idOrPath === "number" ||
      (typeof idOrPath === "string" && /^\d+$/.test(idOrPath))
    ) {
      path = `id ${idOrPath}`;
    }

    const instance = new globalThis.LiveAPI(path);

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
