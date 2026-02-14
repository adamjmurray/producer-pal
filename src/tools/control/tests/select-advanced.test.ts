// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { LIVE_API_VIEW_NAMES } from "#src/tools/constants.ts";
import { select } from "#src/tools/control/select.ts";
import {
  expectViewState,
  setupAppViewMock,
  setupSelectedTrackMock,
  setupSongViewMock,
  setupTrackViewMock,
  setupViewStateMock,
} from "./select-test-helpers.ts";

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
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();

    // Setup default "nothing selected" state for select() reads
    setupViewStateMock({
      selectedTrack: { exists: false },
      selectedScene: { exists: false },
      selectedClip: { exists: false },
      highlightedClipSlot: { exists: false },
    });
  });

  describe("detail view", () => {
    it("shows clip detail view", () => {
      const appView = setupAppViewMock();

      const result = select({ detailView: "clip" });

      expect(appView.call).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      // Result reflects actual readViewState(), which returns default (no detail view)
      expect(result).toStrictEqual(expectViewState());
    });

    it("shows device detail view", () => {
      const appView = setupAppViewMock();

      const result = select({ detailView: "device" });

      expect(appView.call).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN,
      );
      // Result reflects actual readViewState(), which returns default (no detail view)
      expect(result).toStrictEqual(expectViewState());
    });

    it("hides detail view using hide_view API", () => {
      const appView = setupAppViewMock();

      const result = select({ detailView: "none" });

      expect(appView.call).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.DETAIL,
      );
      // Result reflects actual readViewState(), which returns default (no detail view)
      expect(result).toStrictEqual(expectViewState());
    });

    it("shows loop view by focusing on clip detail", () => {
      const appView = setupAppViewMock();
      const songView = setupSongViewMock();

      registerMockObject("clip_123", { path: "id clip_123", type: "Clip" });

      const result = select({
        clipId: "id clip_123",
        showLoop: true,
      });

      expect(appView.call).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      expect(songView.set).toHaveBeenCalledWith("detail_clip", "id clip_123");
      // showLoop is not returned - only the action (focus_view) happens
      // Result reflects actual readViewState()
      expect(result).toStrictEqual(expectViewState());
    });
  });

  describe("browser visibility", () => {
    it("shows browser", () => {
      const appView = setupAppViewMock();

      const result = select({ showBrowser: true });

      expect(appView.call).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.BROWSER,
      );
      // Result reflects actual readViewState(), which returns default (browser not shown)
      expect(result).toStrictEqual(expectViewState());
    });

    it("hides browser using hide_view API", () => {
      const appView = setupAppViewMock();

      const result = select({ showBrowser: false });

      expect(appView.call).toHaveBeenCalledWith(
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
      // Track at index 2 has ID "track_at_index_2"
      registerMockObject("track_at_index_2", {
        path: "live_set tracks 2",
        type: "Track",
      });
      // The trackId "id track_123" refers to a different track
      registerMockObject("track_123", {
        path: "id track_123",
        type: "Track",
      });

      expect(() => {
        select({ trackId: "id track_123", trackIndex: 2 });
      }).toThrow("trackId and trackIndex refer to different tracks");
    });

    it("throws error when scene ID and index refer to different scenes", () => {
      // Scene at index 5 has ID "scene_at_index_5"
      registerMockObject("scene_at_index_5", {
        path: "live_set scenes 5",
        type: "Scene",
      });
      // The sceneId "id scene_123" refers to a different scene
      registerMockObject("scene_123", {
        path: "id scene_123",
        type: "Scene",
      });

      expect(() => {
        select({ sceneId: "id scene_123", sceneIndex: 5 });
      }).toThrow("sceneId and sceneIndex refer to different scenes");
    });
  });

  describe("complex scenarios", () => {
    it("updates multiple properties at once", () => {
      const appView = setupAppViewMock();

      registerMockObject("clip_456", { path: "id clip_456", type: "Clip" });
      registerMockObject("track_1", {
        path: "live_set tracks 1",
        type: "Track",
      });
      registerMockObject("scene_3", {
        path: "live_set scenes 3",
        type: "Scene",
      });

      const result = select({
        view: "arrangement",
        category: "regular",
        trackIndex: 1,
        sceneIndex: 3,
        clipId: "id clip_456",
        detailView: "clip",
        showBrowser: false,
      });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Arranger");
      expect(appView.call).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      expect(appView.call).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.BROWSER,
      );
      expect(result).toStrictEqual(expectViewState());
    });

    it("handles return track with device selection", () => {
      registerMockObject("return_track_2", {
        path: "live_set return_tracks 2",
        type: "Track",
      });
      const trackView = setupTrackViewMock("live_set return_tracks 2");

      const result = select({
        category: "return",
        trackIndex: 2,
        instrument: true,
      });

      expect(trackView.call).toHaveBeenCalledWith("select_instrument");
      expect(result).toStrictEqual(expectViewState());
    });

    it("handles instrument selection using currently selected track when no category/index provided", () => {
      setupSelectedTrackMock({
        exists: true,
        category: "regular",
        trackIndex: 3,
        id: "selected_track_123",
        path: "live_set tracks 3",
      });
      const trackView = setupTrackViewMock("live_set tracks 3");

      const result = select({ instrument: true });

      expect(trackView.call).toHaveBeenCalledWith("select_instrument");
      expect(result).toBeDefined();
    });

    it("handles instrument selection on return track using currently selected track", () => {
      setupSelectedTrackMock({
        exists: true,
        category: "return",
        trackIndex: null,
        returnTrackIndex: 1,
        id: "return_track_123",
        path: "live_set return_tracks 1",
      });
      const trackView = setupTrackViewMock("live_set return_tracks 1");

      const result = select({ instrument: true });

      expect(trackView.call).toHaveBeenCalledWith("select_instrument");
      expect(result).toBeDefined();
    });

    it("handles instrument selection on master track using currently selected track", () => {
      setupSelectedTrackMock({
        exists: true,
        category: "master",
        trackIndex: null,
        returnTrackIndex: null,
        id: "master_track_123",
        path: "live_set master_track",
      });
      const trackView = setupTrackViewMock("live_set master_track");

      const result = select({ instrument: true });

      expect(trackView.call).toHaveBeenCalledWith("select_instrument");
      expect(result).toBeDefined();
    });

    it("validates matching track ID and index are accepted", () => {
      registerMockObject("track_id_123", {
        path: "live_set tracks 2",
        type: "Track",
      });

      const result = select({
        trackId: "id track_id_123",
        trackIndex: 2,
      });

      expect(result).toStrictEqual(expectViewState());
    });

    it("skips track selection when category is invalid", () => {
      const songView = setupSongViewMock();

      // Using an invalid category should cause buildTrackPath to return null
      // and skip the track selection
      const result = select({
        // @ts-expect-error Testing invalid category
        category: "invalid_category",
        trackIndex: 2,
      });

      // Should not set selected_track since buildTrackPath returns null
      expect(songView.set).not.toHaveBeenCalledWith(
        "selected_track",
        expect.anything(),
      );
      expect(result).toStrictEqual(expectViewState());
    });
  });

  describe("read functionality (no arguments)", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      clearMockRegistry();

      // Default: nothing selected
      setupViewStateMock({
        view: "session",
        selectedTrack: { exists: false },
        selectedScene: { exists: false },
        selectedClip: { exists: false },
        highlightedClipSlot: { exists: false },
      });
    });

    it("reads basic view state with session view when no arguments", () => {
      clearMockRegistry();

      setupViewStateMock({
        view: "session",
        selectedTrack: {
          exists: true,
          category: "regular",
          trackIndex: 0,
          id: "789",
          path: "live_set tracks 0",
        },
        selectedScene: {
          exists: true,
          sceneIndex: 2,
          id: "012",
        },
        selectedClip: {
          exists: true,
          id: "123",
        },
        highlightedClipSlot: {
          exists: true,
          trackIndex: 1,
          sceneIndex: 3,
        },
      });

      setupTrackViewMock("live_set tracks 0", "456"); // with selected device

      const result = select();

      expect(result).toStrictEqual({
        view: "session",
        detailView: null,
        showBrowser: false,
        selectedTrack: {
          trackId: "789",
          category: "regular",
          trackIndex: 0,
        },
        selectedClipId: "123",
        selectedDeviceId: "456",
        selectedScene: {
          sceneId: "012",
          sceneIndex: 2,
        },
        selectedClipSlot: {
          trackIndex: 1,
          sceneIndex: 3,
        },
      });
    });

    it("reads view state with arrangement view and detail clip view", () => {
      clearMockRegistry();

      setupViewStateMock({
        view: "arrangement",
        detailView: "clip",
        selectedTrack: { exists: false },
        selectedScene: { exists: false },
        selectedClip: { exists: false },
        highlightedClipSlot: { exists: false },
      });

      const result = select({});

      expect(result).toStrictEqual(
        expectViewState({ view: "arrangement", detailView: "clip" }),
      );
    });

    it("reads view state with device detail view visible", () => {
      clearMockRegistry();

      setupViewStateMock({
        view: "session",
        detailView: "device",
        selectedTrack: { exists: false },
        selectedScene: { exists: false },
        selectedClip: { exists: false },
        highlightedClipSlot: { exists: false },
      });

      const result = select({});

      expect(result).toStrictEqual(expectViewState({ detailView: "device" }));
    });

    it("reads view state with return track selected showing returnTrackIndex", () => {
      clearMockRegistry();

      setupViewStateMock({
        view: "session",
        selectedTrack: {
          exists: true,
          category: "return",
          returnTrackIndex: 2,
          id: "return_456",
          path: "live_set return_tracks 2",
        },
        selectedScene: { exists: false },
        selectedClip: { exists: false },
        highlightedClipSlot: { exists: false },
      });

      setupTrackViewMock("live_set return_tracks 2", "789"); // with selected device

      const result = select({});

      expect(result.selectedTrack).toStrictEqual({
        trackId: "return_456",
        category: "return",
        returnTrackIndex: 2,
      });
    });

    it("handles null values when nothing is selected", () => {
      clearMockRegistry();

      setupViewStateMock({
        view: "arrangement",
        selectedTrack: { exists: false },
        selectedScene: { exists: false },
        selectedClip: { exists: false },
        highlightedClipSlot: { exists: false },
      });

      const result = select();

      expect(result).toStrictEqual(expectViewState({ view: "arrangement" }));
    });
  });
});
