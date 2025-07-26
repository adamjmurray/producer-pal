// src/tools/update-view.test.js
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateView } from "./update-view.js";
import {
  LIVE_API_VIEW_SESSION,
  LIVE_API_VIEW_ARRANGEMENT,
  LIVE_API_VIEW_NAMES,
} from "./constants.js";
import "../live-api-extensions.js";
import {
  LiveAPI,
  liveApiCall,
  liveApiSet,
  liveApiGet,
  liveApiId,
} from "../mock-live-api.js";

// Mock the LiveAPI constructor
vi.mocked(LiveAPI);

// Set up global LiveAPI
global.LiveAPI = vi.fn();

// Mock utility functions
vi.mock("../utils.js", () => ({
  toLiveApiView: vi.fn((view) => {
    const viewMap = { session: 1, arrangement: 2 };
    return viewMap[view] || 1;
  }),
}));

describe("updateView", () => {
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
      } else if (path === "live_set view") {
        Object.assign(this, mockSongView);
      } else if (path === "live_set view selected_track") {
        Object.assign(this, mockTrackAPI);
      } else if (path.includes("clip_slots")) {
        this._id = "id clipslot_id_789";
      } else if (path.startsWith("live_set tracks") || path.startsWith("live_set return_tracks") || path.startsWith("live_set master_track")) {
        this._id = "id track_id_123";
      } else if (path.startsWith("live_set scenes")) {
        this._id = "id scene_id_456";
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
      // Mock the exists method to return false for this test
      global.LiveAPI.mockImplementation(function (path) {
        this.path = path;
        this._path = path;
        this.exists = vi.fn().mockReturnValue(false);
        this.set = liveApiSet;
        this.call = liveApiCall;
        this.get = liveApiGet;
        this.getProperty = vi.fn();
        this.setProperty = vi.fn((property, value) => this.set(property, value));
        if (path.startsWith("live_set tracks") || path.startsWith("live_set return_tracks") || path.startsWith("live_set master_track")) {
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
      // Mock the exists method to return false for this test
      global.LiveAPI.mockImplementation(function (path) {
        this.path = path;
        this._path = path;
        this.exists = vi.fn().mockReturnValue(false);
        this.set = liveApiSet;
        this.call = liveApiCall;
        this.get = liveApiGet;
        this.getProperty = vi.fn();
        this.setProperty = vi.fn((property, value) => this.set(property, value));
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

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set view");
      expect(liveApiCall).toHaveBeenCalledWith(
        "select_device",
        "id device_123",
      );
      expect(result).toEqual({ selectedDeviceId: "id device_123" });
    });

    it("selects instrument on specified track", () => {
      const result = updateView({
        selectedTrackType: "regular",
        selectedTrackIndex: 0,
        selectInstrument: true,
      });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set tracks 0 view");
      expect(liveApiCall).toHaveBeenCalledWith("select_instrument");
      expect(result.selectInstrument).toBe(true);
    });

    it("selects instrument on currently selected track", () => {
      mockTrackAPI.trackType = "regular";
      mockTrackAPI.trackIndex = 1;

      const result = updateView({ selectInstrument: true });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set tracks 1 view");
      expect(liveApiCall).toHaveBeenCalledWith("select_instrument");
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
      const result = updateView({
        selectedTrackType: "return",
        selectedTrackIndex: 2,
        selectInstrument: true,
      });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set return_tracks 2");
      expect(global.LiveAPI).toHaveBeenCalledWith("live_set return_tracks 2 view");
      expect(liveApiCall).toHaveBeenCalledWith("select_instrument");
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
