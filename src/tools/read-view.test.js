// src/tools/read-view.test.js
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readView } from "./read-view.js";
import { LIVE_API_VIEW_NAMES } from "./constants.js";

// Mock the global LiveAPI
global.LiveAPI = vi.fn();

// Mock utility functions
vi.mock("../utils.js", () => ({
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
    };
    mockSelectedScene = {
      exists: vi.fn(),
      sceneIndex: 2,
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
        // Handle dynamic track view selected_device paths
        if (path.match(/^live_set tracks \d+ view selected_device$/))
          return mockSelectedDevice;
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
      selectedTrackIndex: 0,
      selectedSceneIndex: 2,
      selectedClipId: "id 123",
      selectedDeviceId: "id 456",
      highlightedClipSlot: {
        trackIndex: 1,
        clipSlotIndex: 3,
      },
      detailView: null,
      browserVisible: false,
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
      selectedTrackIndex: null,
      selectedSceneIndex: null,
      selectedClipId: null,
      selectedDeviceId: null,
      highlightedClipSlot: null,
      detailView: "clip",
      browserVisible: false,
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
      selectedTrackIndex: null,
      selectedSceneIndex: null,
      selectedClipId: null,
      selectedDeviceId: null,
      highlightedClipSlot: null,
      detailView: "device",
      browserVisible: false,
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
      selectedTrackIndex: null,
      selectedSceneIndex: null,
      selectedClipId: null,
      selectedDeviceId: null,
      highlightedClipSlot: null,
      detailView: null,
      browserVisible: false,
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
      selectedTrackIndex: null,
      selectedSceneIndex: null,
      selectedClipId: null,
      selectedDeviceId: null,
      highlightedClipSlot: null,
      detailView: null,
      browserVisible: true,
    });
  });
});
