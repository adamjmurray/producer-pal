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
  let mockAppView, mockSongView, mockTrackAPI, mockSceneAPI;
  let liveApiCall, liveApiSet, liveApiGetProperty;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock methods that will be called on LiveAPI instances
    liveApiCall = vi.fn();
    liveApiSet = vi.fn();
    liveApiGetProperty = vi.fn();

    // Create mock instances
    mockAppView = {
      call: liveApiCall,
      getProperty: liveApiGetProperty,
    };
    mockSongView = {
      set: liveApiSet,
    };
    mockTrackAPI = {
      exists: vi.fn().mockReturnValue(true),
      id: "track_id_123",
    };
    mockSceneAPI = {
      exists: vi.fn().mockReturnValue(true),
      id: "scene_id_456",
    };

    // Mock LiveAPI constructor to return appropriate instances
    global.LiveAPI.mockImplementation((path) => {
      if (path === "live_app view") return mockAppView;
      if (path === "live_set view") return mockSongView;
      if (path.startsWith("live_set tracks")) return mockTrackAPI;
      if (path.startsWith("live_set scenes")) return mockSceneAPI;
      return {};
    });
  });

  it("updates view to session", () => {
    // Execute
    const result = updateView({ view: "session" });

    // Verify
    expect(liveApiCall).toHaveBeenCalledWith("show_view", 1);
    expect(result).toEqual({ view: "session" });
  });

  it("updates view to arrangement", () => {
    // Execute
    const result = updateView({ view: "arrangement" });

    // Verify
    expect(liveApiCall).toHaveBeenCalledWith("show_view", 2);
    expect(result).toEqual({ view: "arrangement" });
  });

  it("updates selected track", () => {
    // Execute
    const result = updateView({ selectedTrackIndex: 2 });

    // Verify
    expect(global.LiveAPI).toHaveBeenCalledWith("live_set tracks 2");
    expect(mockTrackAPI.exists).toHaveBeenCalled();
    expect(liveApiSet).toHaveBeenCalledWith(
      "selected_track",
      "id track_id_123",
    );
    expect(result).toEqual({ selectedTrackIndex: 2 });
  });

  it("updates selected scene", () => {
    // Execute
    const result = updateView({ selectedSceneIndex: 5 });

    // Verify
    expect(global.LiveAPI).toHaveBeenCalledWith("live_set scenes 5");
    expect(mockSceneAPI.exists).toHaveBeenCalled();
    expect(liveApiSet).toHaveBeenCalledWith(
      "selected_scene",
      "id scene_id_456",
    );
    expect(result).toEqual({ selectedSceneIndex: 5 });
  });

  it("selects a clip by ID", () => {
    // Execute
    const result = updateView({ selectedClipId: "clip_123" });

    // Verify
    expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id clip_123");
    expect(result).toEqual({ selectedClipId: "clip_123" });
  });

  it("deselects all clips when selectedClipId is null", () => {
    // Execute
    const result = updateView({ selectedClipId: null });

    // Verify
    expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id 0");
    expect(result).toEqual({ selectedClipId: null });
  });

  it("shows clip detail view", () => {
    // Execute
    const result = updateView({ showDetail: "clip" });

    // Verify
    expect(liveApiCall).toHaveBeenCalledWith(
      "focus_view",
      LIVE_API_VIEW_NAMES.DETAIL_CLIP,
    );
    expect(result).toEqual({ detailView: "Detail/Clip" });
  });

  it("shows device detail view", () => {
    // Execute
    const result = updateView({ showDetail: "device" });

    // Verify
    expect(liveApiCall).toHaveBeenCalledWith(
      "focus_view",
      LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN,
    );
    expect(result).toEqual({ detailView: "Detail/Device" });
  });

  it("hides detail view by focusing on session", () => {
    // Setup
    liveApiGetProperty.mockReturnValue(LIVE_API_VIEW_SESSION); // Currently in session view

    // Execute
    const result = updateView({ showDetail: null });

    // Verify
    expect(liveApiCall).toHaveBeenCalledWith(
      "focus_view",
      LIVE_API_VIEW_NAMES.SESSION,
    );
    expect(result).toEqual({ detailView: null });
  });

  it("hides detail view by focusing on arrangement", () => {
    // Setup
    liveApiGetProperty.mockReturnValue(LIVE_API_VIEW_ARRANGEMENT); // Currently in arrangement view

    // Execute
    const result = updateView({ showDetail: null });

    // Verify
    expect(liveApiCall).toHaveBeenCalledWith(
      "focus_view",
      LIVE_API_VIEW_NAMES.ARRANGER,
    );
    expect(result).toEqual({ detailView: null });
  });

  it("shows loop view by focusing on clip detail", () => {
    // Execute
    const result = updateView({
      selectedClipId: "clip_123",
      showLoop: true,
    });

    // Verify
    expect(liveApiCall).toHaveBeenCalledWith(
      "focus_view",
      LIVE_API_VIEW_NAMES.DETAIL_CLIP,
    );
    expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id clip_123");
    expect(result).toEqual({
      selectedClipId: "clip_123",
      showLoop: true,
    });
  });

  it("updates multiple properties at once", () => {
    // Execute
    const result = updateView({
      view: "arrangement",
      selectedTrackIndex: 1,
      selectedSceneIndex: 3,
      selectedClipId: "clip_456",
      showDetail: "clip",
    });

    // Verify all operations were called
    expect(liveApiCall).toHaveBeenCalledWith("show_view", 2);
    expect(liveApiCall).toHaveBeenCalledWith(
      "focus_view",
      LIVE_API_VIEW_NAMES.DETAIL_CLIP,
    );
    expect(liveApiSet).toHaveBeenCalledWith(
      "selected_track",
      "id track_id_123",
    );
    expect(liveApiSet).toHaveBeenCalledWith(
      "selected_scene",
      "id scene_id_456",
    );
    expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id clip_456");

    expect(result).toEqual({
      view: "arrangement",
      selectedTrackIndex: 1,
      selectedSceneIndex: 3,
      selectedClipId: "clip_456",
      detailView: "Detail/Clip",
    });
  });

  it("skips operations when track does not exist", () => {
    // Setup
    mockTrackAPI.exists.mockReturnValue(false);

    // Execute
    const result = updateView({ selectedTrackIndex: 99 });

    // Verify
    expect(mockTrackAPI.exists).toHaveBeenCalled();
    expect(liveApiSet).not.toHaveBeenCalledWith(
      "selected_track",
      expect.anything(),
    );
    expect(result).toEqual({ selectedTrackIndex: 99 });
  });

  it("skips operations when scene does not exist", () => {
    // Setup
    mockSceneAPI.exists.mockReturnValue(false);

    // Execute
    const result = updateView({ selectedSceneIndex: 99 });

    // Verify
    expect(mockSceneAPI.exists).toHaveBeenCalled();
    expect(liveApiSet).not.toHaveBeenCalledWith(
      "selected_scene",
      expect.anything(),
    );
    expect(result).toEqual({ selectedSceneIndex: 99 });
  });

  it("returns empty object when no parameters provided", () => {
    // Execute
    const result = updateView();

    // Verify
    expect(result).toEqual({});
    expect(liveApiCall).not.toHaveBeenCalled();
    expect(liveApiSet).not.toHaveBeenCalled();
  });
});
