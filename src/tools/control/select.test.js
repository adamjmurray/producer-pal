import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LiveAPI,
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
} from "../../test/mock-live-api.js";
import { LIVE_API_VIEW_NAMES } from "../constants.js";
import { select } from "./select.js";

// Mock the LiveAPI constructor
vi.mocked(LiveAPI);

// Set up global LiveAPI
global.LiveAPI = vi.fn();

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
      trackType: "regular",
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
        this.trackType = null;
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
    }));
  });

  // Helper function to get expected default view state
  const getDefaultViewState = () => ({
    view: "session",
    detailView: null,
    browserVisible: false,
    selectedTrack: {
      trackId: null,
      trackType: null,
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

  describe("basic functionality", () => {
    it("updates view to session", () => {
      const result = select({ view: "session" });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", 1);
      expect(result).toEqual(expectViewState({ view: "session" }));
    });

    it("updates view to arrangement", () => {
      const result = select({ view: "arrangement" });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", 2);
      expect(result).toEqual(expectViewState({ view: "arrangement" }));
    });

    it("returns full view state when no parameters provided", () => {
      const result = select();

      expect(result).toEqual(getDefaultViewState());
      // Read API calls are expected for reading current view state
      expect(liveApiSet).not.toHaveBeenCalled();
    });
  });

  describe("track selection", () => {
    it("selects track by ID", () => {
      const result = select({ selectedTrackId: "id track_123" });

      expect(liveApiSet).toHaveBeenCalledWith("selected_track", "id track_123");
      expect(result).toEqual(
        expectViewState({ selectedTrackId: "id track_123" }),
      );
    });

    it("selects regular track by index", () => {
      const result = select({
        selectedTrackType: "regular",
        selectedTrackIndex: 2,
      });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set tracks 2");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_track",
        "id track_id_123",
      );
      expect(result).toEqual(
        expectViewState({
          selectedTrackId: "id track_id_123",
          selectedTrackType: "regular",
          selectedTrackIndex: 2,
        }),
      );
    });

    it("selects return track by index", () => {
      const result = select({
        selectedTrackType: "return",
        selectedTrackIndex: 1,
      });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set return_tracks 1");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_track",
        "id track_id_123",
      );
      expect(result).toEqual(
        expectViewState({
          selectedTrackId: "id track_id_123",
          selectedTrackType: "return",
          selectedTrackIndex: 1,
        }),
      );
    });

    it("selects master track", () => {
      const result = select({ selectedTrackType: "master" });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set master_track");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_track",
        "id track_id_123",
      );
      expect(result).toEqual(
        expectViewState({
          selectedTrackId: "id track_id_123",
          selectedTrackType: "master",
        }),
      );
    });

    it("defaults to regular track type when only index provided", () => {
      const result = select({ selectedTrackIndex: 2 });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set tracks 2");
      expect(result).toEqual(
        expectViewState({
          selectedTrackId: "id track_id_123",
          selectedTrackType: "regular",
          selectedTrackIndex: 2,
        }),
      );
    });

    it("skips track selection when track does not exist", () => {
      // Mock the exists method to return false for this test
      global.LiveAPI.mockImplementation(function (path) {
        this.path = path;
        this._path = path;
        this.exists = vi.fn().mockReturnValue(false);
        this.set = liveApiSet;
        this.call = liveApiCall;
        this.get = liveApiGet;
        this.getProperty = vi.fn();
        this.setProperty = vi.fn((property, value) =>
          this.set(property, value),
        );
        if (
          path.startsWith("live_set tracks") ||
          path.startsWith("live_set return_tracks") ||
          path.startsWith("live_set master_track")
        ) {
          this._id = "id track_id_123";
        } else {
          this._id = "id track_id_123";
        }
        Object.defineProperty(this, "id", {
          get: function () {
            return liveApiId.apply(this);
          },
        });
        return this;
      });

      const result = select({ selectedTrackIndex: 99 });

      expect(liveApiSet).not.toHaveBeenCalledWith(
        "selected_track",
        expect.anything(),
      );
      expect(result).toEqual(expectViewState());
    });
  });

  describe("scene selection", () => {
    it("selects scene by ID", () => {
      const result = select({ selectedSceneId: "id scene_123" });

      expect(liveApiSet).toHaveBeenCalledWith("selected_scene", "id scene_123");
      expect(result).toEqual(
        expectViewState({ selectedSceneId: "id scene_123" }),
      );
    });

    it("selects scene by index", () => {
      const result = select({ selectedSceneIndex: 5 });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set scenes 5");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_scene",
        "id scene_id_456",
      );
      expect(result).toEqual(
        expectViewState({
          selectedSceneId: "id scene_id_456",
          selectedSceneIndex: 5,
        }),
      );
    });

    it("skips scene selection when scene does not exist", () => {
      // Mock the exists method to return false for this test
      global.LiveAPI.mockImplementation(function (path) {
        this.path = path;
        this._path = path;
        this.exists = vi.fn().mockReturnValue(false);
        this.set = liveApiSet;
        this.call = liveApiCall;
        this.get = liveApiGet;
        this.getProperty = vi.fn();
        this.setProperty = vi.fn((property, value) =>
          this.set(property, value),
        );
        if (path.startsWith("live_set scenes")) {
          this._id = "id scene_id_456";
        } else {
          this._id = "id scene_id_456";
        }
        Object.defineProperty(this, "id", {
          get: function () {
            return liveApiId.apply(this);
          },
        });
        return this;
      });

      const result = select({ selectedSceneIndex: 99 });

      expect(liveApiSet).not.toHaveBeenCalledWith(
        "selected_scene",
        expect.anything(),
      );
      expect(result).toEqual(expectViewState());
    });
  });

  describe("clip selection", () => {
    it("selects clip by ID", () => {
      const result = select({ selectedClipId: "id clip_123" });

      expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id clip_123");
      expect(result).toEqual(
        expectViewState({ selectedClipId: "id clip_123" }),
      );
    });

    it("deselects all clips when selectedClipId is null", () => {
      const result = select({ selectedClipId: null });

      expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id 0");
      expect(result).toEqual(expectViewState({ selectedClipId: null }));
    });
  });

  describe("device selection", () => {
    it("selects device by ID", () => {
      // Mock device with specific path
      const mockDeviceWithPath = {
        exists: vi.fn().mockReturnValue(true),
        _id: "id device_123",
        _path: "live_set tracks 0 devices 0",
      };
      Object.defineProperty(mockDeviceWithPath, "path", {
        get: function () {
          return this._path;
        },
      });

      // Mock track view
      const mockTrackView = {
        set: liveApiSet,
        _id: "track_view_id",
        _path: "live_set tracks 0 view",
      };

      // Update LiveAPI mock to handle specific device and track view paths
      global.LiveAPI.mockImplementation(function (path) {
        if (path === "live_app view")
          return {
            ...mockAppView,
            getProperty: vi.fn().mockReturnValue(1), // session view
            call: vi.fn().mockReturnValue(0), // no special views visible
          };
        if (path === "live_set view") return mockSongView;
        if (path === "live_set view selected_track")
          return { exists: vi.fn().mockReturnValue(false) };
        if (path === "live_set view selected_scene")
          return { exists: vi.fn().mockReturnValue(false) };
        if (path === "live_set view detail_clip")
          return { exists: vi.fn().mockReturnValue(false) };
        if (path === "live_set view highlighted_clip_slot")
          return { exists: vi.fn().mockReturnValue(false) };
        if (path === "id device_123") return mockDeviceWithPath;
        if (path === "live_set tracks 0") return mockTrackAPI;
        if (path === "live_set tracks 0 view") return mockTrackView;
        return {};
      });

      const result = select({ selectedDeviceId: "id device_123" });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set view");
      expect(liveApiCall).toHaveBeenCalledWith(
        "select_device",
        "id device_123",
      );
      expect(result).toEqual(
        expectViewState({ selectedDeviceId: "id device_123" }),
      );
    });

    it("selects instrument on specified track", () => {
      const result = select({
        selectedTrackType: "regular",
        selectedTrackIndex: 0,
        selectInstrument: true,
      });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set tracks 0 view");
      expect(liveApiCall).toHaveBeenCalledWith("select_instrument");
      expect(result.selectInstrument).toBe(true);
    });

    it("selects instrument on currently selected track", () => {
      // Mock a selected track in the read state
      global.LiveAPI.mockImplementation(function (path) {
        if (path === "live_app view")
          return {
            getProperty: vi.fn().mockReturnValue(1), // session view
            call: vi.fn().mockReturnValue(0), // no special views visible
          };
        if (path === "live_set view") return mockSongView;
        if (path === "live_set view selected_track")
          return {
            exists: vi.fn().mockReturnValue(true),
            trackType: "regular",
            trackIndex: 1,
            id: "id track_123",
            path: "live_set tracks 1",
          };
        if (path === "live_set view selected_scene")
          return { exists: vi.fn().mockReturnValue(false) };
        if (path === "live_set view detail_clip")
          return { exists: vi.fn().mockReturnValue(false) };
        if (path === "live_set view highlighted_clip_slot")
          return { exists: vi.fn().mockReturnValue(false) };
        if (path === "live_set tracks 1 view")
          return {
            exists: vi.fn().mockReturnValue(true),
            call: liveApiCall,
            get: vi.fn().mockReturnValue(null), // No selected device
          };
        return {};
      });

      const result = select({ selectInstrument: true });

      // The function should eventually call select_instrument
      expect(liveApiCall).toHaveBeenCalledWith("select_instrument");
      expect(result).toEqual(
        expectViewState({
          selectInstrument: true,
          selectedTrack: {
            trackId: "id track_123",
            trackType: "regular",
            trackIndex: 1,
          },
        }),
      );
    });
  });

  describe("highlighted clip slot", () => {
    it("sets highlighted clip slot by indices", () => {
      const result = select({
        selectedClipSlot: { trackIndex: 1, sceneIndex: 3 },
      });

      expect(global.LiveAPI).toHaveBeenCalledWith(
        "live_set tracks 1 clip_slots 3",
      );
      expect(liveApiSet).toHaveBeenCalledWith(
        "highlighted_clip_slot",
        "id clipslot_id_789",
      );
      expect(result).toEqual(
        expectViewState({
          selectedClipSlot: { trackIndex: 1, sceneIndex: 3 },
        }),
      );
    });
  });

  describe("detail view", () => {
    it("shows clip detail view", () => {
      const result = select({ showDetail: "clip" });

      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      expect(result).toEqual(expectViewState({ detailView: "clip" }));
    });

    it("shows device detail view", () => {
      const result = select({ showDetail: "device" });

      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN,
      );
      expect(result).toEqual(expectViewState({ detailView: "device" }));
    });

    it("hides detail view using hide_view API", () => {
      const result = select({ showDetail: "none" });

      expect(liveApiCall).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.DETAIL,
      );
      expect(result).toEqual(expectViewState({ detailView: null }));
    });

    it("shows loop view by focusing on clip detail", () => {
      const result = select({
        selectedClipId: "id clip_123",
        showLoop: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id clip_123");
      expect(result).toEqual(
        expectViewState({
          selectedClipId: "id clip_123",
          showLoop: true,
        }),
      );
    });
  });

  describe("browser visibility", () => {
    it("shows browser", () => {
      const result = select({ browserVisible: true });

      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.BROWSER,
      );
      expect(result).toEqual(expectViewState({ browserVisible: true }));
    });

    it("hides browser using hide_view API", () => {
      const result = select({ browserVisible: false });

      expect(liveApiCall).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.BROWSER,
      );
      expect(result).toEqual(expectViewState({ browserVisible: false }));
    });
  });

  describe("validation", () => {
    it("throws error when master track type with index", () => {
      expect(() => {
        select({
          selectedTrackType: "master",
          selectedTrackIndex: 0,
        });
      }).toThrow(
        "selectedTrackIndex should not be provided when selectedTrackType is 'master'",
      );
    });

    it("throws error when both device ID and selectInstrument", () => {
      expect(() => {
        select({
          selectedDeviceId: "id device_123",
          selectInstrument: true,
        });
      }).toThrow("cannot specify both selectedDeviceId and selectInstrument");
    });

    it("throws error when track ID and index refer to different tracks", () => {
      liveApiId.mockReturnValue("id different_track");

      expect(() => {
        select({
          selectedTrackId: "id track_123",
          selectedTrackIndex: 2,
        });
      }).toThrow(
        "selectedTrackId and selectedTrackIndex refer to different tracks",
      );
    });

    it("throws error when scene ID and index refer to different scenes", () => {
      liveApiId.mockReturnValue("id different_scene");

      expect(() => {
        select({
          selectedSceneId: "id scene_123",
          selectedSceneIndex: 5,
        });
      }).toThrow(
        "selectedSceneId and selectedSceneIndex refer to different scenes",
      );
    });
  });

  describe("complex scenarios", () => {
    it("updates multiple properties at once", () => {
      const result = select({
        view: "arrangement",
        selectedTrackType: "regular",
        selectedTrackIndex: 1,
        selectedSceneIndex: 3,
        selectedClipId: "id clip_456",
        showDetail: "clip",
        browserVisible: false,
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

      expect(result).toEqual(
        expectViewState({
          view: "arrangement",
          selectedTrackId: "id track_id_123",
          selectedTrackType: "regular",
          selectedTrackIndex: 1,
          selectedSceneId: "id scene_id_456",
          selectedSceneIndex: 3,
          selectedClipId: "id clip_456",
          detailView: "clip",
          browserVisible: false,
        }),
      );
    });

    it("handles return track with device selection", () => {
      const result = select({
        selectedTrackType: "return",
        selectedTrackIndex: 2,
        selectInstrument: true,
      });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set return_tracks 2");
      expect(global.LiveAPI).toHaveBeenCalledWith(
        "live_set return_tracks 2 view",
      );
      expect(liveApiCall).toHaveBeenCalledWith("select_instrument");
      expect(result.selectedTrackType).toBe("return");
      expect(result.selectInstrument).toBe(true);
    });

    it("validates matching track ID and index are accepted", () => {
      liveApiId.mockReturnValue("id track_id_123");

      const result = select({
        selectedTrackId: "id track_id_123",
        selectedTrackIndex: 2,
      });

      expect(result).toEqual(
        expectViewState({
          selectedTrackId: "id track_id_123",
          selectedTrackIndex: 2,
        }),
      );
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
        trackType: "regular",
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
      global.LiveAPI.mockImplementation((path) => {
        const instance = (() => {
          if (path === "live_app view") return mockAppView;
          if (path === "live_set view selected_track") return mockSelectedTrack;
          if (path === "live_set view selected_scene") return mockSelectedScene;
          if (path === "live_set view detail_clip") return mockDetailClip;
          if (path === "live_set view highlighted_clip_slot")
            return mockHighlightedSlot;
          // Handle dynamic track view paths
          if (path.match(/^live_set tracks \d+ view$/))
            return {
              exists: vi.fn().mockReturnValue(true),
              get: vi.fn().mockReturnValue(["id", 456]),
            };
          if (path.match(/^live_set return_tracks \d+ view$/))
            return {
              exists: vi.fn().mockReturnValue(true),
              get: vi.fn().mockReturnValue(["id", 456]),
            };
          if (path === "live_set master_track view")
            return {
              exists: vi.fn().mockReturnValue(false),
              get: vi.fn().mockReturnValue(null),
            };
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
        browserVisible: false,
        selectedTrack: {
          trackId: "id 789",
          trackType: "regular",
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
        )
          return 1;
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
        browserVisible: false,
        selectedTrack: {
          trackId: null,
          trackType: null,
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
        browserVisible: false,
        selectedTrack: {
          trackId: null,
          trackType: null,
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
