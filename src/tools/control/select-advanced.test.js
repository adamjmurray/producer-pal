import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LiveAPI,
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
  liveApiType,
} from "../../test/mock-live-api.js";
import { LIVE_API_VIEW_NAMES } from "../constants.js";
import { select } from "./select.js";

// Mock the LiveAPI constructor
vi.mocked(LiveAPI);

// Set up global LiveAPI
global.LiveAPI = vi.fn(function () {
  // Will be overridden by mockImplementation in beforeEach
});

// Mock utility functions
vi.mock(import("../shared/utils.js"), () => ({
  toLiveApiView: vi.fn((view) => {
    const viewMap = { session: 1, arrangement: 2 };
    return viewMap[view] || 1;
  }),
  fromLiveApiView: vi.fn((view) => {
    const viewMap = { 1: "session", 2: "arrangement" };
    return viewMap[view] || "session";
  }),
}));

describe("view", () => {
  let mockAppView;
  let mockSongView;
  let mockTrackAPI;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up reusable mock objects
    mockAppView = {
      call: liveApiCall,
      _id: "app_view_id",
      _path: "live_app view",
    };

    mockSongView = {
      set: liveApiSet,
      call: liveApiCall,
      _id: "song_view_id",
      _path: "live_set view",
    };

    mockTrackAPI = {
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

      return this;
    });

    // Mock static methods
    global.LiveAPI.from = vi.fn((id) => ({
      exists: vi.fn().mockReturnValue(true),
      id: id.toString().startsWith("id ") ? id : `id ${id}`,
      get type() {
        return liveApiType.apply(this);
      },
    }));
  });

  // Helper function to get expected default view state
  const getDefaultViewState = () => ({
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
  });

  // Helper function to merge expected changes with default view state
  const expectViewState = (changes = {}) => ({
    ...getDefaultViewState(),
    ...changes,
  });

  describe("detail view", () => {
    it("shows clip detail view", () => {
      const result = select({ detailView: "clip" });

      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      // Result reflects actual readViewState(), which returns default (no detail view)
      expect(result).toEqual(expectViewState());
    });

    it("shows device detail view", () => {
      const result = select({ detailView: "device" });

      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN,
      );
      // Result reflects actual readViewState(), which returns default (no detail view)
      expect(result).toEqual(expectViewState());
    });

    it("hides detail view using hide_view API", () => {
      const result = select({ detailView: "none" });

      expect(liveApiCall).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.DETAIL,
      );
      // Result reflects actual readViewState(), which returns default (no detail view)
      expect(result).toEqual(expectViewState());
    });

    it("shows loop view by focusing on clip detail", () => {
      liveApiType.mockReturnValue("Clip");
      const result = select({
        clipId: "id clip_123",
        showLoop: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id clip_123");
      // showLoop is not returned - only the action (focus_view) happens
      // Result reflects actual readViewState()
      expect(result).toEqual(expectViewState());
    });
  });

  describe("browser visibility", () => {
    it("shows browser", () => {
      const result = select({ showBrowser: true });

      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.BROWSER,
      );
      // Result reflects actual readViewState(), which returns default (browser not shown)
      expect(result).toEqual(expectViewState());
    });

    it("hides browser using hide_view API", () => {
      const result = select({ showBrowser: false });

      expect(liveApiCall).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.BROWSER,
      );
      // Result reflects actual readViewState(), which returns default (browser not shown)
      expect(result).toEqual(expectViewState());
    });
  });

  describe("validation", () => {
    it("throws error when master track type with index", () => {
      expect(() => {
        select({
          category: "master",
          trackIndex: 0,
        });
      }).toThrow("trackIndex should not be provided when category is 'master'");
    });

    it("throws error when both device ID and instrument", () => {
      expect(() => {
        select({
          deviceId: "id device_123",
          instrument: true,
        });
      }).toThrow("cannot specify both deviceId and instrument");
    });

    it("throws error when track ID and index refer to different tracks", () => {
      liveApiId.mockReturnValue("id different_track");

      expect(() => {
        select({
          trackId: "id track_123",
          trackIndex: 2,
        });
      }).toThrow("trackId and trackIndex refer to different tracks");
    });

    it("throws error when scene ID and index refer to different scenes", () => {
      liveApiId.mockReturnValue("id different_scene");

      expect(() => {
        select({
          sceneId: "id scene_123",
          sceneIndex: 5,
        });
      }).toThrow("sceneId and sceneIndex refer to different scenes");
    });
  });

  describe("complex scenarios", () => {
    it("updates multiple properties at once", () => {
      liveApiType.mockReturnValue("Clip");
      const result = select({
        view: "arrangement",
        category: "regular",
        trackIndex: 1,
        sceneIndex: 3,
        clipId: "id clip_456",
        detailView: "clip",
        showBrowser: false,
      });

      // Verify all operations were called
      expect(liveApiCall).toHaveBeenCalledWith("show_view", 2);
      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      expect(liveApiCall).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.BROWSER,
      );

      // Result reflects actual readViewState(), which returns default
      expect(result).toEqual(expectViewState());
    });

    it("handles return track with device selection", () => {
      const result = select({
        category: "return",
        trackIndex: 2,
        instrument: true,
      });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set return_tracks 2");
      expect(global.LiveAPI).toHaveBeenCalledWith(
        "live_set return_tracks 2 view",
      );
      expect(liveApiCall).toHaveBeenCalledWith("select_instrument");
      // Result reflects actual readViewState(), which returns default (no track selected)
      expect(result).toEqual(expectViewState());
    });

    it("validates matching track ID and index are accepted", () => {
      liveApiId.mockReturnValue("id track_id_123");
      liveApiType.mockReturnValue("Track");

      const result = select({
        trackId: "id track_id_123",
        trackIndex: 2,
      });

      // Result reflects actual readViewState(), which returns default (no track selected)
      expect(result).toEqual(expectViewState());
    });
  });

  describe("read functionality (no arguments)", () => {
    let mockAppView,
      mockSelectedTrack,
      mockSelectedScene,
      mockDetailClip,
      mockHighlightedSlot;

    beforeEach(() => {
      vi.clearAllMocks();

      // Create mock instances for read functionality
      mockAppView = {
        getProperty: vi.fn(),
        call: vi.fn(),
      };
      mockSelectedTrack = {
        exists: vi.fn(),
        trackIndex: 0,
        returnTrackIndex: null,
        category: "regular",
        id: "id 789",
        path: "live_set tracks 0",
      };
      mockSelectedScene = {
        exists: vi.fn(),
        sceneIndex: 2,
        id: "id 012",
      };
      mockDetailClip = {
        exists: vi.fn(),
        id: "id 123",
      };
      mockHighlightedSlot = {
        exists: vi.fn(),
        id: "id 999",
        trackIndex: 1,
        sceneIndex: 3,
      };

      // Mock LiveAPI constructor to return appropriate instances
      global.LiveAPI.mockImplementation(function (path) {
        const instance = (() => {
          if (path === "live_app view") {
            return mockAppView;
          }
          if (path === "live_set view selected_track") {
            return mockSelectedTrack;
          }
          if (path === "live_set view selected_scene") {
            return mockSelectedScene;
          }
          if (path === "live_set view detail_clip") {
            return mockDetailClip;
          }
          if (path === "live_set view highlighted_clip_slot") {
            return mockHighlightedSlot;
          }
          // Handle dynamic track view paths
          if (path.match(/^live_set tracks \d+ view$/)) {
            return {
              exists: vi.fn().mockReturnValue(true),
              get: vi.fn().mockReturnValue(["id", 456]),
            };
          }
          if (path.match(/^live_set return_tracks \d+ view$/)) {
            return {
              exists: vi.fn().mockReturnValue(true),
              get: vi.fn().mockReturnValue(["id", 456]),
            };
          }
          if (path === "live_set master_track view") {
            return {
              exists: vi.fn().mockReturnValue(false),
              get: vi.fn().mockReturnValue(null),
            };
          }
          return {};
        })();
        return instance;
      });
    });

    it("reads basic view state with session view when no arguments", () => {
      // Setup
      mockAppView.getProperty.mockReturnValue(1); // Session view
      mockAppView.call.mockReturnValue(0); // No detail views or browser visible
      mockSelectedTrack.exists.mockReturnValue(true);
      mockSelectedScene.exists.mockReturnValue(true);
      mockDetailClip.exists.mockReturnValue(true);
      mockHighlightedSlot.exists.mockReturnValue(true);

      // Execute
      const result = select();

      // Verify
      expect(result).toEqual({
        view: "session",
        detailView: null,
        showBrowser: false,
        selectedTrack: {
          trackId: "id 789",
          category: "regular",
          trackIndex: 0,
        },
        selectedClipId: "id 123",
        selectedDeviceId: "456",
        selectedScene: {
          sceneId: "id 012",
          sceneIndex: 2,
        },
        selectedClipSlot: {
          trackIndex: 1,
          sceneIndex: 3,
        },
      });
    });

    it("reads view state with arrangement view and detail clip view", () => {
      // Setup
      mockAppView.getProperty.mockReturnValue(2); // Arrangement view
      mockAppView.call.mockImplementation((method, view) => {
        if (
          method === "is_view_visible" &&
          view === LIVE_API_VIEW_NAMES.DETAIL_CLIP
        ) {
          return 1;
        }
        return 0;
      });
      mockSelectedTrack.exists.mockReturnValue(false);
      mockSelectedScene.exists.mockReturnValue(false);
      mockDetailClip.exists.mockReturnValue(false);
      mockHighlightedSlot.exists.mockReturnValue(false);

      // Execute
      const result = select({});

      // Verify
      expect(result).toEqual({
        view: "arrangement",
        detailView: "clip",
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
      });
    });

    it("handles null values when nothing is selected", () => {
      // Setup
      mockAppView.getProperty.mockReturnValue(2); // Arrangement view
      mockAppView.call.mockReturnValue(0); // No detail views or browser visible
      mockSelectedTrack.exists.mockReturnValue(false);
      mockSelectedScene.exists.mockReturnValue(false);
      mockDetailClip.exists.mockReturnValue(false);
      mockHighlightedSlot.exists.mockReturnValue(false);

      // Execute
      const result = select();

      // Verify
      expect(result).toEqual({
        view: "arrangement",
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
      });
    });
  });
});
