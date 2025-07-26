// src/tools/update-view.test.js
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateView } from "./update-view.js";
import {
  LIVE_API_VIEW_SESSION,
  LIVE_API_VIEW_ARRANGEMENT,
  LIVE_API_VIEW_NAMES,
} from "./constants.js";

// Mock the global LiveAPI
global.LiveAPI = vi.fn();

// Mock utility functions
vi.mock("../utils.js", () => ({
  toLiveApiView: vi.fn((view) => {
    const viewMap = { session: 1, arrangement: 2 };
    return viewMap[view] || 1;
  }),
}));

describe("updateView", () => {
  let mockAppView,
    mockSongView,
    mockTrackAPI,
    mockSceneAPI,
    mockClipSlotAPI,
    mockDeviceAPI;
  let liveApiCall,
    liveApiSet,
    liveApiGetProperty,
    liveApiExists,
    liveApiGetChildIds,
    liveApiId,
    liveApiPath;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock methods that will be called on LiveAPI instances
    liveApiCall = vi.fn();
    liveApiSet = vi.fn();
    liveApiGetProperty = vi.fn();
    liveApiExists = vi.fn().mockReturnValue(true);
    liveApiGetChildIds = vi.fn().mockReturnValue([]);
    liveApiId = vi.fn(function () {
      return this._id;
    });
    liveApiPath = vi.fn(function () {
      return this._path;
    });

    // Create mock instances
    mockAppView = {
      call: liveApiCall,
      getProperty: liveApiGetProperty,
      _id: "app_view_id",
      _path: "live_app view",
    };
    mockSongView = {
      set: liveApiSet,
      _id: "song_view_id",
      _path: "live_set view",
    };
    mockTrackAPI = {
      exists: liveApiExists,
      getProperty: liveApiGetProperty,
      getChildIds: liveApiGetChildIds,
      set: liveApiSet,
      _id: "id track_id_123",
      _path: "live_set tracks 2",
      trackType: "regular",
      trackIndex: 2,
      returnTrackIndex: null,
    };
    mockSceneAPI = {
      exists: liveApiExists,
      _id: "id scene_id_456",
      _path: "live_set scenes 5",
    };
    mockClipSlotAPI = {
      exists: liveApiExists,
      _id: "id clipslot_id_789",
      _path: "live_set tracks 1 clip_slots 3",
    };
    mockDeviceAPI = {
      exists: liveApiExists,
      getProperty: liveApiGetProperty.mockReturnValue(9), // Instrument type
      getChildIds: liveApiGetChildIds,
      _id: "id device_id_999",
      _path: "live_set tracks 0 devices 0",
    };

    // Mock LiveAPI constructor to return appropriate instances
    global.LiveAPI.mockImplementation(function (path) {
      const instance = (() => {
        if (path === "live_app view") return mockAppView;
        if (path === "live_set view") return mockSongView;
        if (path === "live_set view selected_track") return mockTrackAPI;
        if (path.startsWith("live_set tracks") && path.includes("clip_slots"))
          return mockClipSlotAPI;
        if (path.startsWith("live_set tracks") && path.includes("devices"))
          return mockDeviceAPI;
        if (path.startsWith("live_set tracks") && path.includes("view"))
          return mockSongView;
        if (path.startsWith("live_set tracks")) return mockTrackAPI;
        if (path.startsWith("live_set return_tracks")) return mockTrackAPI;
        if (path === "live_set master_track") return mockTrackAPI;
        if (path.startsWith("live_set scenes")) return mockSceneAPI;
        if (path.startsWith("id ")) return mockTrackAPI; // Default for ID lookups
        return {};
      })();

      // Apply common properties to the instance
      instance.exists = liveApiExists;

      // Define id and path as getters only if not already defined
      if (!instance.hasOwnProperty("id")) {
        Object.defineProperty(instance, "id", {
          get: function () {
            return this._id;
          },
        });
      }
      if (!instance.hasOwnProperty("path")) {
        Object.defineProperty(instance, "path", {
          get: function () {
            return this._path;
          },
        });
      }

      return instance;
    });
  });

  describe("basic functionality", () => {
    it("updates view to session", () => {
      const result = updateView({ view: "session" });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", 1);
      expect(result).toEqual({ view: "session" });
    });

    it("updates view to arrangement", () => {
      const result = updateView({ view: "arrangement" });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", 2);
      expect(result).toEqual({ view: "arrangement" });
    });

    it("returns empty object when no parameters provided", () => {
      const result = updateView();

      expect(result).toEqual({});
      expect(liveApiCall).not.toHaveBeenCalled();
      expect(liveApiSet).not.toHaveBeenCalled();
    });
  });

  describe("track selection", () => {
    it("selects track by ID", () => {
      const result = updateView({ selectedTrackId: "id track_123" });

      expect(liveApiSet).toHaveBeenCalledWith("selected_track", "id track_123");
      expect(result).toEqual({ selectedTrackId: "id track_123" });
    });

    it("selects regular track by index", () => {
      const result = updateView({
        selectedTrackType: "regular",
        selectedTrackIndex: 2,
      });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set tracks 2");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_track",
        "id track_id_123",
      );
      expect(result).toEqual({
        selectedTrackId: "id track_id_123",
        selectedTrackType: "regular",
        selectedTrackIndex: 2,
      });
    });

    it("selects return track by index", () => {
      const result = updateView({
        selectedTrackType: "return",
        selectedTrackIndex: 1,
      });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set return_tracks 1");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_track",
        "id track_id_123",
      );
      expect(result).toEqual({
        selectedTrackId: "id track_id_123",
        selectedTrackType: "return",
        selectedTrackIndex: 1,
      });
    });

    it("selects master track", () => {
      const result = updateView({ selectedTrackType: "master" });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set master_track");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_track",
        "id track_id_123",
      );
      expect(result).toEqual({
        selectedTrackId: "id track_id_123",
        selectedTrackType: "master",
      });
    });

    it("defaults to regular track type when only index provided", () => {
      const result = updateView({ selectedTrackIndex: 2 });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set tracks 2");
      expect(result).toEqual({
        selectedTrackId: "id track_id_123",
        selectedTrackType: "regular",
        selectedTrackIndex: 2,
      });
    });

    it("skips track selection when track does not exist", () => {
      liveApiExists.mockReturnValue(false);

      const result = updateView({ selectedTrackIndex: 99 });

      expect(liveApiSet).not.toHaveBeenCalledWith(
        "selected_track",
        expect.anything(),
      );
      expect(result).toEqual({});
    });
  });

  describe("scene selection", () => {
    it("selects scene by ID", () => {
      const result = updateView({ selectedSceneId: "id scene_123" });

      expect(liveApiSet).toHaveBeenCalledWith("selected_scene", "id scene_123");
      expect(result).toEqual({ selectedSceneId: "id scene_123" });
    });

    it("selects scene by index", () => {
      const result = updateView({ selectedSceneIndex: 5 });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set scenes 5");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_scene",
        "id scene_id_456",
      );
      expect(result).toEqual({
        selectedSceneId: "id scene_id_456",
        selectedSceneIndex: 5,
      });
    });

    it("skips scene selection when scene does not exist", () => {
      liveApiExists.mockReturnValue(false);

      const result = updateView({ selectedSceneIndex: 99 });

      expect(liveApiSet).not.toHaveBeenCalledWith(
        "selected_scene",
        expect.anything(),
      );
      expect(result).toEqual({});
    });
  });

  describe("clip selection", () => {
    it("selects clip by ID", () => {
      const result = updateView({ selectedClipId: "id clip_123" });

      expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id clip_123");
      expect(result).toEqual({ selectedClipId: "id clip_123" });
    });

    it("deselects all clips when selectedClipId is null", () => {
      const result = updateView({ selectedClipId: null });

      expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id 0");
      expect(result).toEqual({ selectedClipId: null });
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
        if (path === "live_app view") return mockAppView;
        if (path === "live_set view") return mockSongView;
        if (path === "id device_123") return mockDeviceWithPath;
        if (path === "live_set tracks 0") return mockTrackAPI;
        if (path === "live_set tracks 0 view") return mockTrackView;
        return {};
      });

      const result = updateView({ selectedDeviceId: "id device_123" });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set tracks 0 view");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_device",
        "id device_123",
      );
      expect(result).toEqual({ selectedDeviceId: "id device_123" });
    });

    it("selects instrument on specified track", () => {
      liveApiGetChildIds.mockReturnValue(["id device_123"]);

      const result = updateView({
        selectedTrackType: "regular",
        selectedTrackIndex: 0,
        selectInstrument: true,
      });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set tracks 0 devices");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_device",
        "id device_123",
      );
      expect(result.selectInstrument).toBe(true);
    });

    it("selects instrument on currently selected track", () => {
      mockTrackAPI.trackType = "regular";
      mockTrackAPI.trackIndex = 1;
      liveApiGetChildIds.mockReturnValue(["id device_456"]);

      const result = updateView({ selectInstrument: true });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set tracks 1 devices");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_device",
        "id device_456",
      );
      expect(result).toEqual({ selectInstrument: true });
    });
  });

  describe("highlighted clip slot", () => {
    it("sets highlighted clip slot by ID", () => {
      const result = updateView({ highlightedClipSlotId: "id clipslot_123" });

      expect(liveApiSet).toHaveBeenCalledWith(
        "highlighted_clip_slot",
        "id clipslot_123",
      );
      expect(result).toEqual({ highlightedClipSlotId: "id clipslot_123" });
    });

    it("sets highlighted clip slot by indices", () => {
      const result = updateView({
        highlightedClipSlot: { trackIndex: 1, clipSlotIndex: 3 },
      });

      expect(global.LiveAPI).toHaveBeenCalledWith(
        "live_set tracks 1 clip_slots 3",
      );
      expect(liveApiSet).toHaveBeenCalledWith(
        "highlighted_clip_slot",
        "id clipslot_id_789",
      );
      expect(result).toEqual({
        highlightedClipSlot: { trackIndex: 1, clipSlotIndex: 3 },
      });
    });
  });

  describe("detail view", () => {
    it("shows clip detail view", () => {
      const result = updateView({ showDetail: "clip" });

      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      expect(result).toEqual({ detailView: "Detail/Clip" });
    });

    it("shows device detail view", () => {
      const result = updateView({ showDetail: "device" });

      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN,
      );
      expect(result).toEqual({ detailView: "Detail/Device" });
    });

    it("hides detail view using hide_view API", () => {
      const result = updateView({ showDetail: null });

      expect(liveApiCall).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.DETAIL,
      );
      expect(result).toEqual({ detailView: null });
    });

    it("shows loop view by focusing on clip detail", () => {
      const result = updateView({
        selectedClipId: "id clip_123",
        showLoop: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id clip_123");
      expect(result).toEqual({
        selectedClipId: "id clip_123",
        showLoop: true,
      });
    });
  });

  describe("browser visibility", () => {
    it("shows browser", () => {
      const result = updateView({ browserVisible: true });

      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.BROWSER,
      );
      expect(result).toEqual({ browserVisible: true });
    });

    it("hides browser using hide_view API", () => {
      const result = updateView({ browserVisible: false });

      expect(liveApiCall).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.BROWSER,
      );
      expect(result).toEqual({ browserVisible: false });
    });
  });

  describe("validation", () => {
    it("throws error when master track type with index", () => {
      expect(() => {
        updateView({
          selectedTrackType: "master",
          selectedTrackIndex: 0,
        });
      }).toThrow(
        "selectedTrackIndex should not be provided when selectedTrackType is 'master'",
      );
    });

    it("throws error when both device ID and selectInstrument", () => {
      expect(() => {
        updateView({
          selectedDeviceId: "id device_123",
          selectInstrument: true,
        });
      }).toThrow("cannot specify both selectedDeviceId and selectInstrument");
    });

    it("throws error when track ID and index refer to different tracks", () => {
      liveApiId.mockReturnValue("id different_track");

      expect(() => {
        updateView({
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
        updateView({
          selectedSceneId: "id scene_123",
          selectedSceneIndex: 5,
        });
      }).toThrow(
        "selectedSceneId and selectedSceneIndex refer to different scenes",
      );
    });

    it("throws error when clip slot ID and indices refer to different clip slots", () => {
      liveApiId.mockReturnValue("id different_clipslot");

      expect(() => {
        updateView({
          highlightedClipSlotId: "id clipslot_123",
          highlightedClipSlot: { trackIndex: 1, clipSlotIndex: 3 },
        });
      }).toThrow(
        "highlightedClipSlotId and highlightedClipSlot refer to different clip slots",
      );
    });
  });

  describe("complex scenarios", () => {
    it("updates multiple properties at once", () => {
      const result = updateView({
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

      expect(result).toEqual({
        view: "arrangement",
        selectedTrackId: "id track_id_123",
        selectedTrackType: "regular",
        selectedTrackIndex: 1,
        selectedSceneId: "id scene_id_456",
        selectedSceneIndex: 3,
        selectedClipId: "id clip_456",
        detailView: "Detail/Clip",
        browserVisible: false,
      });
    });

    it("handles return track with device selection", () => {
      liveApiGetChildIds.mockReturnValue(["id device_return"]);

      const result = updateView({
        selectedTrackType: "return",
        selectedTrackIndex: 2,
        selectInstrument: true,
      });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set return_tracks 2");
      expect(global.LiveAPI).toHaveBeenCalledWith(
        "live_set return_tracks 2 devices",
      );
      expect(result.selectedTrackType).toBe("return");
      expect(result.selectInstrument).toBe(true);
    });

    it("validates matching track ID and index are accepted", () => {
      liveApiId.mockReturnValue("id track_id_123");

      const result = updateView({
        selectedTrackId: "id track_id_123",
        selectedTrackIndex: 2,
      });

      expect(result).toEqual({
        selectedTrackId: "id track_id_123",
        selectedTrackIndex: 2,
      });
    });
  });
});
