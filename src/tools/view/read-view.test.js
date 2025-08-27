// src/tools/view/read-view.test.js
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_API_VIEW_NAMES } from "../constants.js";
import { readView } from "./read-view.js";

// Mock the global LiveAPI
global.LiveAPI = vi.fn();

// Mock utility functions
vi.mock(import("../shared/utils.js"), () => ({
  fromLiveApiView: vi.fn((view) => {
    const viewMap = { 1: "session", 2: "arrangement" };
    return viewMap[view] || "session";
  }),
}));

describe("readView", () => {
  let mockAppView,
    mockSelectedTrack,
    mockSelectedScene,
    mockDetailClip,
    mockSelectedDevice,
    mockHighlightedSlot;
  let liveApiInstances = [];

  beforeEach(() => {
    vi.clearAllMocks();
    liveApiInstances = [];

    // Create mock instances
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
    mockSelectedDevice = {
      exists: vi.fn(),
      id: "id 456",
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
      liveApiInstances.push(instance);
      return instance;
    });
  });

  it("reads basic view state with session view", () => {
    // Setup
    mockAppView.getProperty.mockReturnValue(1); // Session view
    mockAppView.call.mockReturnValue(0); // No detail views or browser visible
    mockSelectedTrack.exists.mockReturnValue(true);
    mockSelectedScene.exists.mockReturnValue(true);
    mockDetailClip.exists.mockReturnValue(true);
    mockSelectedDevice.exists.mockReturnValue(true);
    mockHighlightedSlot.exists.mockReturnValue(true);

    // Execute
    const result = readView();

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
    mockSelectedDevice.exists.mockReturnValue(false);
    mockHighlightedSlot.exists.mockReturnValue(false);

    // Execute
    const result = readView();

    // Verify
    expect(result).toEqual({
      view: "arrangement", // fromLiveApiView maps 2 to arrangement in our mock
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

  it("reads view state with detail device view", () => {
    // Setup
    mockAppView.getProperty.mockReturnValue(1); // Session view
    mockAppView.call.mockImplementation((method, view) => {
      if (
        method === "is_view_visible" &&
        view === LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN
      )
        return 1;
      return 0;
    });
    mockSelectedTrack.exists.mockReturnValue(false);
    mockSelectedScene.exists.mockReturnValue(false);
    mockDetailClip.exists.mockReturnValue(false);
    mockHighlightedSlot.exists.mockReturnValue(false);

    // Execute
    const result = readView();

    // Verify
    expect(result).toEqual({
      view: "session",
      detailView: "device",
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
    const result = readView();

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

  it("reads view state with browser visible", () => {
    // Setup
    mockAppView.getProperty.mockReturnValue(1); // Session view
    mockAppView.call.mockImplementation((method, view) => {
      if (method === "is_view_visible" && view === LIVE_API_VIEW_NAMES.BROWSER)
        return 1;
      return 0;
    });
    mockSelectedTrack.exists.mockReturnValue(false);
    mockSelectedScene.exists.mockReturnValue(false);
    mockDetailClip.exists.mockReturnValue(false);
    mockHighlightedSlot.exists.mockReturnValue(false);

    // Execute
    const result = readView();

    // Verify
    expect(result).toEqual({
      view: "session",
      detailView: null,
      browserVisible: true,
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

  it("reads view state with return track selected", () => {
    // Setup - Mock return track
    mockSelectedTrack.exists.mockReturnValue(true);
    mockSelectedTrack.trackIndex = null;
    mockSelectedTrack.returnTrackIndex = 1;
    mockSelectedTrack.trackType = "return";
    mockSelectedTrack.id = "id 234";
    mockSelectedTrack.path = "live_set return_tracks 1";

    mockAppView.getProperty.mockReturnValue(1); // Session view
    mockAppView.call.mockReturnValue(0); // No detail views or browser visible
    mockSelectedScene.exists.mockReturnValue(false);
    mockDetailClip.exists.mockReturnValue(false);
    mockSelectedDevice.exists.mockReturnValue(true);
    mockHighlightedSlot.exists.mockReturnValue(false);

    // Execute
    const result = readView();

    // Verify
    expect(result).toEqual({
      view: "session",
      detailView: null,
      browserVisible: false,
      selectedTrack: {
        trackId: "id 234",
        trackType: "return",
        returnTrackIndex: 1,
      },
      selectedClipId: null,
      selectedDeviceId: "456",
      selectedScene: {
        sceneId: null,
        sceneIndex: null,
      },
      selectedClipSlot: null,
    });
  });

  it("reads view state with master track selected", () => {
    // Setup - Mock master track
    mockSelectedTrack.exists.mockReturnValue(true);
    mockSelectedTrack.trackIndex = null;
    mockSelectedTrack.returnTrackIndex = null;
    mockSelectedTrack.trackType = "master";
    mockSelectedTrack.id = "id 345";
    mockSelectedTrack.path = "live_set master_track";

    mockAppView.getProperty.mockReturnValue(2); // Arrangement view
    mockAppView.call.mockReturnValue(0); // No detail views or browser visible
    mockSelectedScene.exists.mockReturnValue(false);
    mockDetailClip.exists.mockReturnValue(false);
    mockSelectedDevice.exists.mockReturnValue(false);
    mockHighlightedSlot.exists.mockReturnValue(false);

    // Execute
    const result = readView();

    // Verify
    expect(result).toEqual({
      view: "arrangement",
      detailView: null,
      browserVisible: false,
      selectedTrack: {
        trackId: "id 345",
        trackType: "master",
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
