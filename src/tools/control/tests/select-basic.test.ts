// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { select } from "#src/tools/control/select.ts";
import {
  expectViewState,
  getDefaultViewState,
  setupAppViewMock,
  setupDeviceMock,
  setupSelectedTrackMock,
  setupSessionClipMock,
  setupSongViewMock,
  setupTrackViewMock,
  setupViewStateMock,
} from "./select-test-helpers.ts";

// Mock utility functions
vi.mock(import("#src/tools/shared/utils.ts"), async (importOriginal) => ({
  ...(await importOriginal()),
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

    // Register default "nothing selected" view state for select() reads
    setupViewStateMock({
      selectedTrack: { exists: false },
      selectedScene: { exists: false },
      selectedClip: { exists: false },
      highlightedClipSlot: { exists: false },
    });
  });

  describe("basic functionality", () => {
    it("updates view to session", () => {
      const appView = setupAppViewMock();

      const result = select({ view: "session" });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
      expect(result).toStrictEqual(expectViewState({ view: "session" }));
    });

    it("updates view to arrangement", () => {
      const appView = setupAppViewMock();

      const result = select({ view: "arrangement" });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Arranger");
      // Result reflects actual readViewState(), which returns default (session)
      expect(result).toStrictEqual(expectViewState());
    });

    it("returns full view state when no parameters provided", () => {
      const songView = setupSongViewMock();

      const result = select();

      expect(result).toStrictEqual(getDefaultViewState());
      // Read API calls are expected for reading current view state
      expect(songView.set).not.toHaveBeenCalled();
    });
  });

  describe("track selection", () => {
    it("selects track by ID", () => {
      registerMockObject("track_123", {
        path: livePath.track(0),
        type: "Track",
      });
      const songView = setupSongViewMock();

      const result = select({ trackId: "id track_123" });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_track",
        "id track_123",
      );
      // Result reflects actual readViewState(), which returns default (no track selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects regular track by index", () => {
      const track = registerMockObject("track_id_123", {
        path: livePath.track(2),
        type: "Track",
      });
      const songView = setupSongViewMock();

      const result = select({
        category: "regular",
        trackIndex: 2,
      });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_track",
        `id ${track.id}`,
      );
      // Result reflects actual readViewState(), which returns default (no track selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects return track by index", () => {
      const track = registerMockObject("track_id_123", {
        path: livePath.returnTrack(1),
        type: "Track",
      });
      const songView = setupSongViewMock();

      const result = select({
        category: "return",
        trackIndex: 1,
      });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_track",
        `id ${track.id}`,
      );
      // Result reflects actual readViewState(), which returns default (no track selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects master track", () => {
      const track = registerMockObject("track_id_123", {
        path: livePath.masterTrack(),
        type: "Track",
      });
      const songView = setupSongViewMock();

      const result = select({ category: "master" });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_track",
        `id ${track.id}`,
      );
      // Result reflects actual readViewState(), which returns default (no track selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("defaults to regular track type when only index provided", () => {
      registerMockObject("track_id_123", {
        path: livePath.track(2),
        type: "Track",
      });

      const result = select({ trackIndex: 2 });

      // Result reflects actual readViewState(), which returns default (no track selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects track by ID with category hint", () => {
      registerMockObject("track_123", {
        path: livePath.track(0),
        type: "Track",
      });
      const songView = setupSongViewMock();

      const result = select({ trackId: "id track_123", category: "return" });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_track",
        "id track_123",
      );
      // Category hint is passed through for internal use
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects track by ID with trackIndex hint", () => {
      registerMockObject("track_123", {
        path: livePath.track(2),
        type: "Track",
      });
      const songView = setupSongViewMock();

      const result = select({ trackId: "id track_123", trackIndex: 2 });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_track",
        "id track_123",
      );
      expect(result).toStrictEqual(expectViewState());
    });

    it("skips track selection when track does not exist", () => {
      // Register non-existent track (id "0" makes exists() return false)
      registerMockObject("0", {
        path: livePath.track(99),
        type: "Track",
      });
      const songView = setupSongViewMock();

      const result = select({ trackIndex: 99 });

      expect(songView.set).not.toHaveBeenCalledWith(
        "selected_track",
        expect.anything(),
      );
      expect(result).toStrictEqual(expectViewState());
    });
  });

  describe("scene selection", () => {
    it("selects scene by ID", () => {
      registerMockObject("scene_123", {
        path: livePath.scene(0),
        type: "Scene",
      });
      const songView = setupSongViewMock();

      const result = select({ sceneId: "id scene_123" });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_scene",
        "id scene_123",
      );
      // Result reflects actual readViewState(), which returns default (no scene selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects scene by index", () => {
      const scene = registerMockObject("scene_id_456", {
        path: livePath.scene(5),
        type: "Scene",
      });
      const songView = setupSongViewMock();

      const result = select({ sceneIndex: 5 });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_scene",
        `id ${scene.id}`,
      );
      // Result reflects actual readViewState(), which returns default (no scene selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects scene by ID with sceneIndex hint", () => {
      registerMockObject("scene_123", {
        path: livePath.scene(3),
        type: "Scene",
      });
      const songView = setupSongViewMock();

      const result = select({ sceneId: "id scene_123", sceneIndex: 3 });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_scene",
        "id scene_123",
      );
      expect(result).toStrictEqual(expectViewState());
    });

    it("skips scene selection when scene does not exist", () => {
      // Register non-existent scene (id "0" makes exists() return false)
      registerMockObject("0", {
        path: livePath.scene(99),
        type: "Scene",
      });
      const songView = setupSongViewMock();

      const result = select({ sceneIndex: 99 });

      expect(songView.set).not.toHaveBeenCalledWith(
        "selected_scene",
        expect.anything(),
      );
      expect(result).toStrictEqual(expectViewState());
    });
  });

  describe("clip selection", () => {
    it("selects clip by ID", () => {
      registerMockObject("clip_123", {
        path: livePath.track(0).clipSlot(0).clip(),
        type: "Clip",
      });
      const songView = setupSongViewMock();

      const result = select({ clipId: "id clip_123" });

      expect(songView.set).toHaveBeenCalledWith("detail_clip", "id clip_123");
      // Result reflects actual readViewState(), which returns default (no clip selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("highlights clip slot when selecting a session clip", () => {
      const { clip, clipSlot } = setupSessionClipMock("session_clip_123", 2, 3);
      const songView = setupSongViewMock();

      select({ clipId: `id ${clip.id}` });

      // Verify both detail_clip and highlighted_clip_slot were set
      expect(songView.set).toHaveBeenCalledWith("detail_clip", `id ${clip.id}`);
      expect(songView.set).toHaveBeenCalledWith(
        "highlighted_clip_slot",
        `id ${clipSlot.id}`,
      );
    });
  });

  describe("clip selection - view conflict", () => {
    it("warns when requested view conflicts with clip type", () => {
      const { clip } = setupSessionClipMock("session_clip_456", 1, 2);

      setupSongViewMock();

      // Request arrangement view but clip is a session clip → should warn
      select({ clipId: `id ${clip.id}`, view: "arrangement" });

      // Warning goes through v8-max-console.warn → outlet(1, ...) in test env
      const outletMock = (globalThis as Record<string, unknown>)
        .outlet as ReturnType<typeof vi.fn>;

      expect(outletMock).toHaveBeenCalledWith(
        1,
        expect.stringContaining("ignoring view="),
      );
    });
  });

  describe("device selection", () => {
    it("selects device by ID", () => {
      const device = setupDeviceMock(
        "device_123",
        String(livePath.track(0).device(0)),
      );
      const songView = setupSongViewMock();

      setupTrackViewMock(livePath.track(0));

      const result = select({ deviceId: `id ${device.id}` });

      expect(songView.call).toHaveBeenCalledWith(
        "select_device",
        `id ${device.id}`,
      );
      // Result reflects actual readViewState(), which returns default (no device selected)
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects instrument on specified track", () => {
      const trackView = setupTrackViewMock(livePath.track(0));

      const result = select({
        category: "regular",
        trackIndex: 0,
        instrument: true,
      });

      expect(trackView.call).toHaveBeenCalledWith("select_instrument");
      // Result reflects actual readViewState(), not optimistic updates
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects instrument on currently selected track", () => {
      // Re-register with exists: true to override the beforeEach default
      setupSelectedTrackMock({
        exists: true,
        category: "regular",
        trackIndex: 1,
        id: "track_123",
        path: String(livePath.track(1)),
      });
      const trackView = setupTrackViewMock(livePath.track(1));

      const result = select({ instrument: true });

      // The function should eventually call select_instrument
      expect(trackView.call).toHaveBeenCalledWith("select_instrument");
      // Result reflects actual readViewState() with the mocked selected track
      expect(result).toStrictEqual(
        expectViewState({
          selectedTrack: {
            trackId: "track_123",
            type: "midi",
            trackIndex: 1,
          },
        }),
      );
    });

    it("skips instrument selection when no track is selected", () => {
      setupSelectedTrackMock({ exists: false });
      const trackView = setupTrackViewMock(livePath.track(0));

      const result = select({ instrument: true });

      // Should not call select_instrument since no track is selected
      expect(trackView.call).not.toHaveBeenCalledWith("select_instrument");
      // Result reflects actual readViewState() with no track selected
      expect(result).toStrictEqual(expectViewState());
    });
  });

  describe("highlighted clip slot", () => {
    it("sets highlighted clip slot by indices", () => {
      const clipSlot = registerMockObject("clipslot_id_789", {
        path: livePath.track(1).clipSlot(3),
        type: "ClipSlot",
      });
      const songView = setupSongViewMock();

      const result = select({
        clipSlot: { trackIndex: 1, sceneIndex: 3 },
      });

      expect(songView.set).toHaveBeenCalledWith(
        "highlighted_clip_slot",
        `id ${clipSlot.id}`,
      );
      // Result reflects actual readViewState(), which returns default (no clip slot highlighted)
      expect(result).toStrictEqual(expectViewState());
    });
  });
});
