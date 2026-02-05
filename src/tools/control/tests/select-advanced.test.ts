// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  LiveAPI,
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
  liveApiType,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { LIVE_API_VIEW_NAMES } from "#src/tools/constants.ts";
import { select } from "#src/tools/control/select.ts";
import { setupSelectMocks, expectViewState } from "./select-test-helpers.ts";

// Type-safe way to access global LiveAPI
const g = globalThis as Record<string, unknown>;

// Interface for track overrides in createLiveAPIMock
interface TrackOverrides {
  exists?: boolean;
  category?: string;
  trackIndex?: number | null;
  returnTrackIndex?: number | null;
  id?: string;
  path?: string;
}

// Interface for overrides parameter in createLiveAPIMock
interface MockOverrides {
  selectedTrack?: TrackOverrides;
  trackViewPath?: string;
}

// Interface for mock LiveAPI instance
interface MockLiveAPIInstance {
  path: string;
  _path: string;
  exists: Mock;
  set: Mock;
  call: Mock;
  get: Mock;
  getProperty: Mock;
  setProperty: Mock;
  category?: string;
  trackIndex?: number | null;
  returnTrackIndex?: number | null;
  id?: string;
}

// Mock the LiveAPI constructor
vi.mocked(LiveAPI);

// Set up global LiveAPI
g.LiveAPI = vi.fn(function () {
  // Will be overridden by mockImplementation in beforeEach
}) as unknown;

// Mock utility functions
vi.mock(import("#src/tools/shared/utils.ts"), async () => ({
  toLiveApiView: vi.fn((view: string) => {
    const viewMap: Record<string, string> = {
      session: "Session",
      arrangement: "Arranger",
    };

    return viewMap[view] ?? "Session";
  }),
  fromLiveApiView: vi.fn((liveApiView: string) => {
    const viewMap: Record<string, string> = {
      Session: "session",
      Arranger: "arrangement",
    };

    return viewMap[liveApiView] ?? "session";
  }),
}));

describe("view", () => {
  let mockAppView: ReturnType<typeof setupSelectMocks>["mockAppView"];
  let mockSongView: ReturnType<typeof setupSelectMocks>["mockSongView"];

  beforeEach(() => {
    vi.clearAllMocks();
    const mocks = setupSelectMocks();

    mockAppView = mocks.mockAppView;
    mockSongView = mocks.mockSongView;
  });

  // Helper to create a customized LiveAPI mock implementation
  function createLiveAPIMock(overrides: MockOverrides = {}) {
    return function (this: MockLiveAPIInstance, path: string) {
      this.path = path;
      this._path = path;
      this.exists = vi.fn().mockReturnValue(true);
      this.set = liveApiSet;
      this.call = liveApiCall;
      this.get = liveApiGet;
      this.getProperty = vi.fn();
      this.setProperty = vi.fn((property: string, value: unknown) =>
        this.set(property, value),
      );

      if (path === "live_app view") {
        Object.assign(this, mockAppView);
        this.getProperty.mockReturnValue("Session"); // Session view
        this.call.mockReturnValue(0);
      } else if (path === "live_set view") {
        Object.assign(this, mockSongView);
      } else if (path === "live_set view selected_track") {
        const trackOverrides = overrides.selectedTrack ?? {};

        this.exists.mockReturnValue(trackOverrides.exists ?? true);
        this.category = trackOverrides.category ?? "regular";
        this.trackIndex = trackOverrides.trackIndex ?? 3;
        this.returnTrackIndex = trackOverrides.returnTrackIndex ?? null;
        this.id = trackOverrides.id ?? "id selected_track_123";
        this.path = trackOverrides.path ?? "live_set tracks 3";
      } else if (path === "live_set view selected_scene") {
        this.exists.mockReturnValue(false);
      } else if (path === "live_set view detail_clip") {
        this.exists.mockReturnValue(false);
      } else if (path === "live_set view highlighted_clip_slot") {
        this.exists.mockReturnValue(false);
      } else if (overrides.trackViewPath && path === overrides.trackViewPath) {
        this.exists.mockReturnValue(true);
      }

      Object.defineProperty(this, "id", {
        get: function (this: MockLiveAPIContext) {
          return liveApiId.apply(this);
        },
      });

      return this;
    };
  }

  describe("detail view", () => {
    it("shows clip detail view", () => {
      const result = select({ detailView: "clip" });

      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      // Result reflects actual readViewState(), which returns default (no detail view)
      expect(result).toStrictEqual(expectViewState());
    });

    it("shows device detail view", () => {
      const result = select({ detailView: "device" });

      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN,
      );
      // Result reflects actual readViewState(), which returns default (no detail view)
      expect(result).toStrictEqual(expectViewState());
    });

    it("hides detail view using hide_view API", () => {
      const result = select({ detailView: "none" });

      expect(liveApiCall).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.DETAIL,
      );
      // Result reflects actual readViewState(), which returns default (no detail view)
      expect(result).toStrictEqual(expectViewState());
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
      expect(result).toStrictEqual(expectViewState());
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
      expect(result).toStrictEqual(expectViewState());
    });

    it("hides browser using hide_view API", () => {
      const result = select({ showBrowser: false });

      expect(liveApiCall).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.BROWSER,
      );
      // Result reflects actual readViewState(), which returns default (browser not shown)
      expect(result).toStrictEqual(expectViewState());
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
      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
      expect(liveApiCall).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      expect(liveApiCall).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.BROWSER,
      );

      // Result reflects actual readViewState(), which returns default
      expect(result).toStrictEqual(expectViewState());
    });

    it("handles return track with device selection", () => {
      const result = select({
        category: "return",
        trackIndex: 2,
        instrument: true,
      });

      expect(g.LiveAPI as Mock).toHaveBeenCalledWith(
        "live_set return_tracks 2",
      );
      expect(g.LiveAPI as Mock).toHaveBeenCalledWith(
        "live_set return_tracks 2 view",
      );
      expect(liveApiCall).toHaveBeenCalledWith("select_instrument");
      // Result reflects actual readViewState(), which returns default (no track selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("handles instrument selection using currently selected track when no category/index provided", () => {
      (g.LiveAPI as Mock).mockImplementation(
        createLiveAPIMock({ trackViewPath: "live_set tracks 3 view" }),
      );

      // Call select with only instrument: true - no category/trackIndex
      const result = select({ instrument: true });

      // Should have called select_instrument on the currently selected track's view
      expect(g.LiveAPI as Mock).toHaveBeenCalledWith(
        "live_set view selected_track",
      );
      expect(g.LiveAPI as Mock).toHaveBeenCalledWith("live_set tracks 3 view");
      expect(liveApiCall).toHaveBeenCalledWith("select_instrument");
      expect(result).toBeDefined();
    });

    it("handles instrument selection on return track using currently selected track", () => {
      (g.LiveAPI as Mock).mockImplementation(
        createLiveAPIMock({
          selectedTrack: {
            category: "return",
            trackIndex: null,
            returnTrackIndex: 1,
            id: "id return_track_123",
            path: "live_set return_tracks 1",
          },
          trackViewPath: "live_set return_tracks 1 view",
        }),
      );

      // Call select with only instrument: true on a return track
      const result = select({ instrument: true });

      expect(g.LiveAPI as Mock).toHaveBeenCalledWith(
        "live_set return_tracks 1 view",
      );
      expect(liveApiCall).toHaveBeenCalledWith("select_instrument");
      expect(result).toBeDefined();
    });

    it("handles instrument selection on master track using currently selected track", () => {
      (g.LiveAPI as Mock).mockImplementation(
        createLiveAPIMock({
          selectedTrack: {
            category: "master",
            trackIndex: null,
            returnTrackIndex: null,
            id: "id master_track_123",
            path: "live_set master_track",
          },
          trackViewPath: "live_set master_track view",
        }),
      );

      // Call select with only instrument: true on master track
      const result = select({ instrument: true });

      expect(g.LiveAPI as Mock).toHaveBeenCalledWith(
        "live_set master_track view",
      );
      expect(liveApiCall).toHaveBeenCalledWith("select_instrument");
      expect(result).toBeDefined();
    });

    it("validates matching track ID and index are accepted", () => {
      liveApiId.mockReturnValue("id track_id_123");
      liveApiType.mockReturnValue("Track");

      const result = select({
        trackId: "id track_id_123",
        trackIndex: 2,
      });

      // Result reflects actual readViewState(), which returns default (no track selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("skips track selection when category is invalid", () => {
      // Using an invalid category should cause buildTrackPath to return null
      // and skip the track selection
      const result = select({
        // @ts-expect-error Testing invalid category
        category: "invalid_category",
        trackIndex: 2,
      });

      // Should not set selected_track since buildTrackPath returns null
      expect(liveApiSet).not.toHaveBeenCalledWith(
        "selected_track",
        expect.anything(),
      );
      expect(result).toStrictEqual(expectViewState());
    });
  });

  describe("read functionality (no arguments)", () => {
    let readAppView: { getProperty: Mock; call: Mock };
    let readSelectedTrack: {
      exists: Mock;
      trackIndex: number | null;
      returnTrackIndex: number | null;
      category: string;
      id: string;
      path: string;
    };
    let readSelectedScene: { exists: Mock; sceneIndex: number; id: string };
    let readDetailClip: { exists: Mock; id: string };
    let readHighlightedSlot: {
      exists: Mock;
      id: string;
      trackIndex: number;
      sceneIndex: number;
    };

    beforeEach(() => {
      vi.clearAllMocks();

      // Create mock instances for read functionality
      readAppView = {
        getProperty: vi.fn(),
        call: vi.fn(),
      };
      readSelectedTrack = {
        exists: vi.fn(),
        trackIndex: 0,
        returnTrackIndex: null,
        category: "regular",
        id: "id 789",
        path: "live_set tracks 0",
      };
      readSelectedScene = {
        exists: vi.fn(),
        sceneIndex: 2,
        id: "id 012",
      };
      readDetailClip = {
        exists: vi.fn(),
        id: "id 123",
      };
      readHighlightedSlot = {
        exists: vi.fn(),
        id: "id 999",
        trackIndex: 1,
        sceneIndex: 3,
      };

      // Mock LiveAPI constructor to return appropriate instances
      (g.LiveAPI as Mock).mockImplementation(function (path: string) {
        return (() => {
          if (path === "live_app view") {
            return readAppView;
          }

          if (path === "live_set view selected_track") {
            return readSelectedTrack;
          }

          if (path === "live_set view selected_scene") {
            return readSelectedScene;
          }

          if (path === "live_set view detail_clip") {
            return readDetailClip;
          }

          if (path === "live_set view highlighted_clip_slot") {
            return readHighlightedSlot;
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
      });
    });

    it("reads basic view state with session view when no arguments", () => {
      // Setup
      readAppView.getProperty.mockReturnValue("Session"); // Session view
      readAppView.call.mockReturnValue(0); // No detail views or browser visible
      readSelectedTrack.exists.mockReturnValue(true);
      readSelectedScene.exists.mockReturnValue(true);
      readDetailClip.exists.mockReturnValue(true);
      readHighlightedSlot.exists.mockReturnValue(true);

      // Execute
      const result = select();

      // Verify
      expect(result).toStrictEqual({
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
      readAppView.getProperty.mockReturnValue("Arranger"); // Arrangement view
      readAppView.call.mockImplementation((method: string, view: string) => {
        if (
          method === "is_view_visible" &&
          view === LIVE_API_VIEW_NAMES.DETAIL_CLIP
        ) {
          return 1;
        }

        return 0;
      });
      readSelectedTrack.exists.mockReturnValue(false);
      readSelectedScene.exists.mockReturnValue(false);
      readDetailClip.exists.mockReturnValue(false);
      readHighlightedSlot.exists.mockReturnValue(false);

      // Execute
      const result = select({});

      // Verify
      expect(result).toStrictEqual({
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

    it("reads view state with device detail view visible", () => {
      // Setup
      readAppView.getProperty.mockReturnValue("Session"); // Session view
      readAppView.call.mockImplementation((method: string, view: string) => {
        // Return 0 for DETAIL_CLIP, 1 for DETAIL_DEVICE_CHAIN
        if (
          method === "is_view_visible" &&
          view === LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN
        ) {
          return 1;
        }

        return 0;
      });
      readSelectedTrack.exists.mockReturnValue(false);
      readSelectedScene.exists.mockReturnValue(false);
      readDetailClip.exists.mockReturnValue(false);
      readHighlightedSlot.exists.mockReturnValue(false);

      // Execute
      const result = select({});

      // Verify
      expect(result).toStrictEqual({
        view: "session",
        detailView: "device",
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

    it("reads view state with return track selected showing returnTrackIndex", () => {
      // Setup
      readAppView.getProperty.mockReturnValue("Session"); // Session view
      readAppView.call.mockReturnValue(0); // No detail views or browser visible
      readSelectedTrack.exists.mockReturnValue(true);
      readSelectedTrack.category = "return";
      readSelectedTrack.returnTrackIndex = 2;
      readSelectedTrack.trackIndex = null;
      readSelectedTrack.id = "id return_456";
      readSelectedTrack.path = "live_set return_tracks 2";
      readSelectedScene.exists.mockReturnValue(false);
      readDetailClip.exists.mockReturnValue(false);
      readHighlightedSlot.exists.mockReturnValue(false);

      // Mock LiveAPI to return return track view
      (g.LiveAPI as Mock).mockImplementation(function (path: string) {
        if (path === "live_app view") {
          return readAppView;
        }

        if (path === "live_set view selected_track") {
          return readSelectedTrack;
        }

        if (path === "live_set view selected_scene") {
          return readSelectedScene;
        }

        if (path === "live_set view detail_clip") {
          return readDetailClip;
        }

        if (path === "live_set view highlighted_clip_slot") {
          return readHighlightedSlot;
        }

        if (path === "live_set return_tracks 2 view") {
          return {
            exists: vi.fn().mockReturnValue(true),
            get: vi.fn().mockReturnValue(["id", 789]),
          };
        }

        return {};
      });

      // Execute
      const result = select({});

      // Verify return track with returnTrackIndex (not trackIndex)
      expect(result.selectedTrack).toStrictEqual({
        trackId: "id return_456",
        category: "return",
        returnTrackIndex: 2,
      });
    });

    it("handles null values when nothing is selected", () => {
      // Setup
      readAppView.getProperty.mockReturnValue("Arranger"); // Arrangement view
      readAppView.call.mockReturnValue(0); // No detail views or browser visible
      readSelectedTrack.exists.mockReturnValue(false);
      readSelectedScene.exists.mockReturnValue(false);
      readDetailClip.exists.mockReturnValue(false);
      readHighlightedSlot.exists.mockReturnValue(false);

      // Execute
      const result = select();

      // Verify
      expect(result).toStrictEqual({
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
