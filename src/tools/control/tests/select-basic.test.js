import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LiveAPI,
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
  liveApiType,
} from "#src/test/mock-live-api.js";
import { select } from "#src/tools/control/select.js";
import {
  setupSelectMocks,
  getDefaultViewState,
  expectViewState,
} from "./select-test-helpers.js";

// Mock the LiveAPI constructor
vi.mocked(LiveAPI);

// Set up global LiveAPI
global.LiveAPI = vi.fn(function () {
  // Will be overridden by mockImplementation in beforeEach
});

// Mock utility functions
vi.mock(import("#src/tools/shared/utils.js"), () => ({
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
    const mocks = setupSelectMocks();

    mockAppView = mocks.mockAppView;
    mockSongView = mocks.mockSongView;
    mockTrackAPI = mocks.mockTrackAPI;
  });

  describe("basic functionality", () => {
    it("updates view to session", () => {
      const result = select({ view: "session" });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", 1);
      expect(result).toStrictEqual(expectViewState({ view: "session" }));
    });

    it("updates view to arrangement", () => {
      const result = select({ view: "arrangement" });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", 2);
      // Result reflects actual readViewState(), which returns default (session)
      expect(result).toStrictEqual(expectViewState());
    });

    it("returns full view state when no parameters provided", () => {
      const result = select();

      expect(result).toStrictEqual(getDefaultViewState());
      // Read API calls are expected for reading current view state
      expect(liveApiSet).not.toHaveBeenCalled();
    });
  });

  describe("track selection", () => {
    it("selects track by ID", () => {
      liveApiType.mockReturnValue("Track");
      const result = select({ trackId: "id track_123" });

      expect(liveApiSet).toHaveBeenCalledWith("selected_track", "id track_123");
      // Result reflects actual readViewState(), which returns default (no track selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects regular track by index", () => {
      const result = select({
        category: "regular",
        trackIndex: 2,
      });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set tracks 2");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_track",
        "id track_id_123",
      );
      // Result reflects actual readViewState(), which returns default (no track selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects return track by index", () => {
      const result = select({
        category: "return",
        trackIndex: 1,
      });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set return_tracks 1");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_track",
        "id track_id_123",
      );
      // Result reflects actual readViewState(), which returns default (no track selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects master track", () => {
      const result = select({ category: "master" });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set master_track");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_track",
        "id track_id_123",
      );
      // Result reflects actual readViewState(), which returns default (no track selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("defaults to regular track type when only index provided", () => {
      const result = select({ trackIndex: 2 });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set tracks 2");
      // Result reflects actual readViewState(), which returns default (no track selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects track by ID with category hint", () => {
      liveApiType.mockReturnValue("Track");
      const result = select({ trackId: "id track_123", category: "return" });

      expect(liveApiSet).toHaveBeenCalledWith("selected_track", "id track_123");
      // Category hint is passed through for internal use
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects track by ID with trackIndex hint", () => {
      liveApiType.mockReturnValue("Track");
      liveApiId.mockReturnValue("id track_123"); // Match trackId to avoid mismatch error
      const result = select({ trackId: "id track_123", trackIndex: 2 });

      expect(liveApiSet).toHaveBeenCalledWith("selected_track", "id track_123");
      expect(result).toStrictEqual(expectViewState());
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
        this._id = "id track_id_123";
        Object.defineProperty(this, "id", {
          get: function () {
            return liveApiId.apply(this);
          },
        });

        return this;
      });

      const result = select({ trackIndex: 99 });

      expect(liveApiSet).not.toHaveBeenCalledWith(
        "selected_track",
        expect.anything(),
      );
      expect(result).toStrictEqual(expectViewState());
    });
  });

  describe("scene selection", () => {
    it("selects scene by ID", () => {
      liveApiType.mockReturnValue("Scene");
      const result = select({ sceneId: "id scene_123" });

      expect(liveApiSet).toHaveBeenCalledWith("selected_scene", "id scene_123");
      // Result reflects actual readViewState(), which returns default (no scene selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects scene by index", () => {
      const result = select({ sceneIndex: 5 });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set scenes 5");
      expect(liveApiSet).toHaveBeenCalledWith(
        "selected_scene",
        "id scene_id_456",
      );
      // Result reflects actual readViewState(), which returns default (no scene selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects scene by ID with sceneIndex hint", () => {
      liveApiType.mockReturnValue("Scene");
      liveApiId.mockReturnValue("id scene_123"); // Match sceneId to avoid mismatch error
      const result = select({ sceneId: "id scene_123", sceneIndex: 3 });

      expect(liveApiSet).toHaveBeenCalledWith("selected_scene", "id scene_123");
      expect(result).toStrictEqual(expectViewState());
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
        this._id = "id scene_id_456";
        Object.defineProperty(this, "id", {
          get: function () {
            return liveApiId.apply(this);
          },
        });

        return this;
      });

      const result = select({ sceneIndex: 99 });

      expect(liveApiSet).not.toHaveBeenCalledWith(
        "selected_scene",
        expect.anything(),
      );
      expect(result).toStrictEqual(expectViewState());
    });
  });

  describe("clip selection", () => {
    it("selects clip by ID", () => {
      liveApiType.mockReturnValue("Clip");
      const result = select({ clipId: "id clip_123" });

      expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id clip_123");
      // Result reflects actual readViewState(), which returns default (no clip selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("deselects all clips when clipId is null", () => {
      const result = select({ clipId: null });

      expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id 0");
      // Result reflects actual readViewState(), which returns default (no clip selected)
      expect(result).toStrictEqual(expectViewState());
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
        if (path === "live_app view") {
          return {
            ...mockAppView,
            getProperty: vi.fn().mockReturnValue(1), // session view
            call: vi.fn().mockReturnValue(0), // no special views visible
          };
        }

        if (path === "live_set view") {
          return mockSongView;
        }

        if (path === "live_set view selected_track") {
          return { exists: vi.fn().mockReturnValue(false) };
        }

        if (path === "live_set view selected_scene") {
          return { exists: vi.fn().mockReturnValue(false) };
        }

        if (path === "live_set view detail_clip") {
          return { exists: vi.fn().mockReturnValue(false) };
        }

        if (path === "live_set view highlighted_clip_slot") {
          return { exists: vi.fn().mockReturnValue(false) };
        }

        if (path === "id device_123") {
          return mockDeviceWithPath;
        }

        if (path === "live_set tracks 0") {
          return mockTrackAPI;
        }

        if (path === "live_set tracks 0 view") {
          return mockTrackView;
        }

        return {};
      });

      liveApiType.mockReturnValue("Device");
      const result = select({ deviceId: "id device_123" });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set view");
      expect(liveApiCall).toHaveBeenCalledWith(
        "select_device",
        "id device_123",
      );
      // Result reflects actual readViewState(), which returns default (no device selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects instrument on specified track", () => {
      const result = select({
        category: "regular",
        trackIndex: 0,
        instrument: true,
      });

      expect(global.LiveAPI).toHaveBeenCalledWith("live_set tracks 0 view");
      expect(liveApiCall).toHaveBeenCalledWith("select_instrument");
      // Result reflects actual readViewState(), not optimistic updates
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects instrument on currently selected track", () => {
      // Mock a selected track in the read state
      global.LiveAPI.mockImplementation(function (path) {
        if (path === "live_app view") {
          return {
            getProperty: vi.fn().mockReturnValue(1), // session view
            call: vi.fn().mockReturnValue(0), // no special views visible
          };
        }

        if (path === "live_set view") {
          return mockSongView;
        }

        if (path === "live_set view selected_track") {
          return {
            exists: vi.fn().mockReturnValue(true),
            category: "regular",
            trackIndex: 1,
            id: "id track_123",
            path: "live_set tracks 1",
          };
        }

        if (path === "live_set view selected_scene") {
          return { exists: vi.fn().mockReturnValue(false) };
        }

        if (path === "live_set view detail_clip") {
          return { exists: vi.fn().mockReturnValue(false) };
        }

        if (path === "live_set view highlighted_clip_slot") {
          return { exists: vi.fn().mockReturnValue(false) };
        }

        if (path === "live_set tracks 1 view") {
          return {
            exists: vi.fn().mockReturnValue(true),
            call: liveApiCall,
            get: vi.fn().mockReturnValue(null), // No selected device
          };
        }

        // Default fallback for any other LiveAPI object
        return {
          exists: vi.fn().mockReturnValue(true),
          call: liveApiCall,
          get: vi.fn(),
          set: liveApiSet,
        };
      });

      const result = select({ instrument: true });

      // The function should eventually call select_instrument
      expect(liveApiCall).toHaveBeenCalledWith("select_instrument");
      // Result reflects actual readViewState() with the mocked selected track
      expect(result).toStrictEqual(
        expectViewState({
          selectedTrack: {
            trackId: "id track_123",
            category: "regular",
            trackIndex: 1,
          },
        }),
      );
    });
  });

  describe("highlighted clip slot", () => {
    it("sets highlighted clip slot by indices", () => {
      const result = select({
        clipSlot: { trackIndex: 1, sceneIndex: 3 },
      });

      expect(global.LiveAPI).toHaveBeenCalledWith(
        "live_set tracks 1 clip_slots 3",
      );
      expect(liveApiSet).toHaveBeenCalledWith(
        "highlighted_clip_slot",
        "id clipslot_id_789",
      );
      // Result reflects actual readViewState(), which returns default (no clip slot highlighted)
      expect(result).toStrictEqual(expectViewState());
    });
  });
});
