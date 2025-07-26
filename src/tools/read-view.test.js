// src/tools/read-view.test.js
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readView } from "./read-view.js";

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
    mockHighlightedSlot;
  let liveApiInstances = [];

  beforeEach(() => {
    vi.clearAllMocks();
    liveApiInstances = [];

    // Create mock instances
    mockAppView = {
      getProperty: vi.fn(),
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
        return {};
      })();
      liveApiInstances.push(instance);
      return instance;
    });
  });

  it("reads basic view state with session view", () => {
    // Setup
    mockAppView.getProperty.mockReturnValue(1); // Session view
    mockSelectedTrack.exists.mockReturnValue(true);
    mockSelectedScene.exists.mockReturnValue(true);
    mockDetailClip.exists.mockReturnValue(true);
    mockHighlightedSlot.exists.mockReturnValue(true);

    // Execute
    const result = readView();

    // Verify
    expect(result).toEqual({
      view: "session",
      selectedTrackIndex: 0,
      selectedSceneIndex: 2,
      selectedClipId: "id 123",
      highlightedClipSlot: {
        trackIndex: 1,
        clipSlotIndex: 3,
      },
      detailView: null,
    });
  });

  it("reads view state with arrangement view and detail clip view", () => {
    // Setup
    mockAppView.getProperty.mockReturnValue(3); // Detail/Clip view
    mockSelectedTrack.exists.mockReturnValue(false);
    mockSelectedScene.exists.mockReturnValue(false);
    mockDetailClip.exists.mockReturnValue(false);
    mockHighlightedSlot.exists.mockReturnValue(false);

    // Execute
    const result = readView();

    // Verify
    expect(result).toEqual({
      view: "session", // fromLiveApiView maps 3 to session in our mock
      selectedTrackIndex: null,
      selectedSceneIndex: null,
      selectedClipId: null,
      highlightedClipSlot: null,
      detailView: "Detail/Clip",
    });
  });

  it("reads view state with detail device view", () => {
    // Setup
    mockAppView.getProperty.mockReturnValue(4); // Detail/Device view
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
      highlightedClipSlot: null,
      detailView: "Detail/Device",
    });
  });

  it("handles null values when nothing is selected", () => {
    // Setup
    mockAppView.getProperty.mockReturnValue(2); // Arrangement view
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
      highlightedClipSlot: null,
      detailView: null,
    });
  });
});
