// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { LIVE_API_VIEW_NAMES } from "#src/tools/constants.ts";
import { select } from "#src/tools/control/select.ts";
import {
  expectReadState,
  resetSelectTestState,
  setupAppViewMock,
  setupSongViewMock,
  setupTrackViewMock,
  setupViewStateMock,
} from "./select-test-helpers.ts";

const { viewMockToLive, viewMockFromLive } = vi.hoisted(() => ({
  viewMockToLive: (view: string) =>
    ({ session: "Session", arrangement: "Arranger" })[view] ?? "Session",
  viewMockFromLive: (liveApiView: string) =>
    ({ Session: "session", Arranger: "arrangement" })[liveApiView] ?? "session",
}));

vi.mock(import("#src/tools/shared/utils.ts"), async (importOriginal) => ({
  ...(await importOriginal()),
  toLiveApiView: vi.fn(viewMockToLive),
  fromLiveApiView: vi.fn(viewMockFromLive),
}));

describe("view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSelectTestState();
  });

  describe("auto detail view", () => {
    it("auto-opens clip detail when selecting clip by id", () => {
      const appView = setupAppViewMock();

      setupSongViewMock();

      registerMockObject("clip_123", {
        path: livePath.track(0).clipSlot(0).clip(),
        type: "Clip",
      });

      select({ id: "id clip_123" });

      expect(appView.call).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
    });

    it("auto-opens device detail when selecting device by id", () => {
      const appView = setupAppViewMock();

      setupSongViewMock();

      registerMockObject("device_123", {
        path: String(livePath.track(0).device(0)),
        type: "Eq8Device",
      });

      select({ id: "id device_123" });

      expect(appView.call).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN,
      );
    });

    it("auto-opens device detail when selecting by devicePath", () => {
      const appView = setupAppViewMock();

      setupSongViewMock();

      registerMockObject("device_at_path", {
        path: String(livePath.track(0)) + " devices 1",
        type: "Device",
      });

      select({ devicePath: "t0/d1" });

      expect(appView.call).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN,
      );
    });

    it("hides detail view on view-only change", () => {
      const appView = setupAppViewMock();

      select({ view: "arrangement" });

      expect(appView.call).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.DETAIL,
      );
    });

    it("does not change detail view when selecting track only", () => {
      const appView = setupAppViewMock();

      registerMockObject("track_123", {
        path: livePath.track(0),
        type: "Track",
      });

      select({ id: "id track_123" });

      expect(appView.call).not.toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      expect(appView.call).not.toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_DEVICE_CHAIN,
      );
      expect(appView.call).not.toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.DETAIL,
      );
    });

    it("does not change detail view when selecting scene only", () => {
      const appView = setupAppViewMock();

      registerMockObject("scene_123", {
        path: livePath.scene(0),
        type: "Scene",
      });

      select({ id: "id scene_123" });

      expect(appView.call).not.toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      expect(appView.call).not.toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.DETAIL,
      );
    });

    it("internal detailView overrides auto behavior", () => {
      const appView = setupAppViewMock();

      setupSongViewMock();

      registerMockObject("clip_123", {
        path: livePath.track(0).clipSlot(0).clip(),
        type: "Clip",
      });

      select({ clipId: "id clip_123", detailView: "none" });

      expect(appView.call).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.DETAIL,
      );
    });
  });

  describe("auto session view", () => {
    it("auto-switches to session view when selecting scene by index", () => {
      const appView = setupAppViewMock();

      registerMockObject("scene_123", {
        path: livePath.scene(0),
        type: "Scene",
      });
      setupSongViewMock();

      const result = select({ sceneIndex: 0 });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
      expect(result.view).toBe("session");
    });

    it("auto-switches to session view when selecting clipSlot", () => {
      const appView = setupAppViewMock();

      registerMockObject("clipslot_1_2", {
        path: livePath.track(1).clipSlot(2),
        type: "ClipSlot",
        properties: { has_clip: 0 },
      });
      setupSongViewMock();

      const result = select({ clipSlot: "1/2" });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
      expect(result.view).toBe("session");
    });

    it("does not auto-switch when view is explicitly provided", () => {
      const appView = setupAppViewMock();

      registerMockObject("scene_456", {
        path: livePath.scene(1),
        type: "Scene",
      });
      setupSongViewMock();

      select({ sceneIndex: 1, view: "arrangement" });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Arranger");
      expect(appView.call).not.toHaveBeenCalledWith("show_view", "Session");
    });
  });

  describe("id auto-detection", () => {
    it("resolves track from id and returns selectedTrack", () => {
      registerMockObject("track_abc", {
        path: livePath.track(0),
        type: "Track",
      });
      const songView = setupSongViewMock();

      const result = select({ id: "id track_abc" });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_track",
        "id track_abc",
      );
      expect(result.selectedTrack).toBeDefined();
    });

    it("resolves scene from id and returns selectedScene", () => {
      registerMockObject("scene_abc", {
        path: livePath.scene(0),
        type: "Scene",
      });
      const songView = setupSongViewMock();

      const result = select({ id: "id scene_abc" });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_scene",
        "id scene_abc",
      );
      expect(result.selectedScene).toBeDefined();
    });

    it("resolves clip from id and returns selectedClip", () => {
      registerMockObject("clip_abc", {
        path: livePath.track(0).clipSlot(0).clip(),
        type: "Clip",
      });
      setupSongViewMock();

      const result = select({ id: "id clip_abc" });

      expect(result.selectedClip).toBeDefined();
      expect(result.selectedClip?.id).toBe("clip_abc");
    });

    it("resolves device from id with subclass type", () => {
      registerMockObject("device_abc", {
        path: String(livePath.track(0).device(0)),
        type: "Eq8Device",
      });
      setupSongViewMock();

      const result = select({ id: "id device_abc" });

      expect(result.selectedDevice).toBeDefined();
      expect(result.selectedDevice?.id).toBe("device_abc");
    });

    it("throws error for nonexistent id", () => {
      mockNonExistentObjects();

      expect(() => select({ id: "id nonexistent" })).toThrow(
        'select failed: id "id nonexistent" does not exist',
      );
    });

    it("throws error for unsupported type", () => {
      registerMockObject("app_thing", {
        path: "live_app",
        type: "Application",
      });

      expect(() => select({ id: "id app_thing" })).toThrow(
        'unsupported type "Application"',
      );
    });
  });

  describe("clipSlot selection", () => {
    it("selects clip in occupied slot", () => {
      const clipSlotMock = registerMockObject("clipslot_0_1", {
        path: livePath.track(0).clipSlot(1),
        type: "ClipSlot",
        properties: { has_clip: 1 },
      });

      registerMockObject("clip_in_slot", {
        path: livePath.track(0).clipSlot(1).clip(),
        type: "Clip",
      });
      const songView = setupSongViewMock();
      const appView = setupAppViewMock();

      const result = select({ clipSlot: "0/1" });

      expect(songView.set).toHaveBeenCalledWith(
        "highlighted_clip_slot",
        `id ${clipSlotMock.id}`,
      );
      expect(songView.set).toHaveBeenCalledWith(
        "detail_clip",
        "id clip_in_slot",
      );
      expect(appView.call).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      expect(result.selectedClip).toBeDefined();
      expect(result.selectedClip?.slot).toBe("0/1");
    });

    it("only highlights empty slot without opening detail", () => {
      const clipSlotMock = registerMockObject("clipslot_0_2", {
        path: livePath.track(0).clipSlot(2),
        type: "ClipSlot",
        properties: { has_clip: 0 },
      });
      const songView = setupSongViewMock();
      const appView = setupAppViewMock();

      const result = select({ clipSlot: "0/2" });

      expect(songView.set).toHaveBeenCalledWith(
        "highlighted_clip_slot",
        `id ${clipSlotMock.id}`,
      );
      expect(songView.set).not.toHaveBeenCalledWith(
        "detail_clip",
        expect.anything(),
      );
      expect(appView.call).not.toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      expect(result.selectedClip).toBeUndefined();
    });

    it("throws on invalid clipSlot format", () => {
      expect(() => select({ clipSlot: "invalid" })).toThrow(
        'invalid clipSlot "invalid"',
      );
    });

    it("throws on negative clipSlot values", () => {
      expect(() => select({ clipSlot: "-1/0" })).toThrow(
        "values must be non-negative",
      );
    });
  });

  describe("devicePath selection", () => {
    it("selects device by path and returns device info", () => {
      registerMockObject("device_at_path", {
        path: String(livePath.track(1)) + " devices 0",
        type: "Device",
      });
      const songView = setupSongViewMock();

      const result = select({ devicePath: "t1/d0" });

      expect(songView.call).toHaveBeenCalledWith(
        "select_device",
        "id device_at_path",
      );
      expect(result.selectedDevice).toBeDefined();
      expect(result.selectedDevice?.path).toBe("t1/d0");
    });

    it("throws when devicePath resolves to non-device", () => {
      expect(() => select({ devicePath: "t0/d0/c0" })).toThrow(
        "does not resolve to a device",
      );
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

    it("throws error when both id (device) and devicePath provided", () => {
      registerMockObject("device_123", {
        path: String(livePath.track(0).device(0)),
        type: "Device",
      });

      expect(() => {
        select({ id: "id device_123", devicePath: "t0/d1" });
      }).toThrow("cannot specify both id (device) and devicePath");
    });

    it("throws error when id (track) and trackIndex refer to different tracks", () => {
      registerMockObject("track_at_index_2", {
        path: livePath.track(2),
        type: "Track",
      });
      registerMockObject("track_123", {
        path: livePath.track(3),
        type: "Track",
      });

      expect(() => {
        select({ id: "id track_123", trackIndex: 2 });
      }).toThrow("id and trackIndex refer to different tracks");
    });

    it("throws error when id (scene) and sceneIndex refer to different scenes", () => {
      registerMockObject("scene_at_index_5", {
        path: livePath.scene(5),
        type: "Scene",
      });
      registerMockObject("scene_123", {
        path: livePath.scene(3),
        type: "Scene",
      });

      expect(() => {
        select({ id: "id scene_123", sceneIndex: 5 });
      }).toThrow("id and sceneIndex refer to different scenes");
    });
  });

  describe("browser auto-close", () => {
    it("closes browser when selecting a track", () => {
      const appView = setupAppViewMock();

      registerMockObject("track_123", {
        path: livePath.track(0),
        type: "Track",
      });
      setupSongViewMock();

      select({ id: "id track_123" });

      expect(appView.call).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.BROWSER,
      );
    });

    it("closes browser on view-only change", () => {
      const appView = setupAppViewMock();

      select({ view: "session" });

      expect(appView.call).toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.BROWSER,
      );
    });

    it("does not close browser on read-only call", () => {
      const appView = setupAppViewMock();

      select();

      expect(appView.call).not.toHaveBeenCalledWith(
        "hide_view",
        LIVE_API_VIEW_NAMES.BROWSER,
      );
    });
  });

  describe("complex scenarios", () => {
    it("updates multiple properties at once", () => {
      const appView = setupAppViewMock();

      registerMockObject("clip_456", {
        path: livePath.track(1).clipSlot(0).clip(),
        type: "Clip",
      });
      registerMockObject("track_1", {
        path: livePath.track(1),
        type: "Track",
      });
      registerMockObject("scene_3", {
        path: livePath.scene(3),
        type: "Scene",
      });
      setupSongViewMock();

      const result = select({
        view: "arrangement",
        category: "regular",
        trackIndex: 1,
        sceneIndex: 3,
        clipId: "id clip_456",
      });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Arranger");
      expect(appView.call).toHaveBeenCalledWith(
        "focus_view",
        LIVE_API_VIEW_NAMES.DETAIL_CLIP,
      );
      // Response includes all selected items
      expect(result.view).toBe("arrangement");
      expect(result.selectedTrack).toBeDefined();
      expect(result.selectedScene).toBeDefined();
      expect(result.selectedClip).toBeDefined();
    });

    it("validates matching track ID and index are accepted", () => {
      registerMockObject("track_id_123", {
        path: livePath.track(2),
        type: "Track",
      });

      const result = select({
        id: "id track_id_123",
        trackIndex: 2,
      });

      expect(result.selectedTrack).toBeDefined();
    });

    it("skips track selection when category is invalid", () => {
      const songView = setupSongViewMock();

      const result = select({
        // @ts-expect-error Testing invalid category
        category: "invalid_category",
        trackIndex: 2,
      });

      expect(songView.set).not.toHaveBeenCalledWith(
        "selected_track",
        expect.anything(),
      );
      expect(result.selectedTrack).toBeUndefined();
    });
  });

  describe("read functionality (no arguments)", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      resetSelectTestState();
    });

    it("reads full state with track, scene, clip, and device", () => {
      clearMockRegistry();

      setupViewStateMock({
        view: "session",
        selectedTrack: {
          exists: true,
          category: "regular",
          trackIndex: 0,
          id: "789",
          path: String(livePath.track(0)),
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

      setupTrackViewMock(livePath.track(0), "456");

      const result = select();

      expect(result.view).toBe("session");
      expect(result.selectedTrack).toStrictEqual({
        id: "789",
        type: "midi",
        trackIndex: 0,
      });
      expect(result.selectedScene).toStrictEqual({
        id: "012",
        sceneIndex: 2,
      });
      // Clip and device are read from detail_clip and track view
      expect(result.selectedClip).toBeDefined();
    });

    it("reads arrangement view with nothing selected", () => {
      clearMockRegistry();

      setupViewStateMock({
        view: "arrangement",
        selectedTrack: { exists: false },
        selectedScene: { exists: false },
        selectedClip: { exists: false },
        highlightedClipSlot: { exists: false },
      });

      const result = select({});

      expect(result).toStrictEqual(expectReadState({ view: "arrangement" }));
    });

    it("reads return track with trackIndex", () => {
      clearMockRegistry();

      setupViewStateMock({
        view: "session",
        selectedTrack: {
          exists: true,
          category: "return",
          returnTrackIndex: 2,
          id: "return_456",
          path: String(livePath.returnTrack(2)),
        },
        selectedScene: { exists: false },
        selectedClip: { exists: false },
        highlightedClipSlot: { exists: false },
      });

      setupTrackViewMock(livePath.returnTrack(2));

      const result = select({});

      expect(result.selectedTrack).toStrictEqual({
        id: "return_456",
        type: "return",
        trackIndex: 2,
      });
    });

    it("reads master track without trackIndex", () => {
      clearMockRegistry();

      setupViewStateMock({
        view: "session",
        selectedTrack: {
          exists: true,
          category: "master",
          id: "master_789",
          path: String(livePath.masterTrack()),
        },
        selectedScene: { exists: false },
        selectedClip: { exists: false },
        highlightedClipSlot: { exists: false },
      });

      setupTrackViewMock(livePath.masterTrack());

      const result = select({});

      expect(result.selectedTrack).toStrictEqual({
        id: "master_789",
        type: "master",
      });
    });

    it("reads audio track", () => {
      clearMockRegistry();

      setupViewStateMock({
        view: "session",
        selectedTrack: {
          exists: true,
          category: "regular",
          trackIndex: 1,
          id: "audio_track_456",
          path: String(livePath.track(1)),
          hasMidiInput: false,
        },
        selectedScene: { exists: false },
        selectedClip: { exists: false },
        highlightedClipSlot: { exists: false },
      });

      setupTrackViewMock(livePath.track(1));

      const result = select({});

      expect(result.selectedTrack).toStrictEqual({
        id: "audio_track_456",
        type: "audio",
        trackIndex: 1,
      });
    });

    it("omits null fields when nothing is selected", () => {
      clearMockRegistry();

      setupViewStateMock({
        view: "arrangement",
        selectedTrack: { exists: false },
        selectedScene: { exists: false },
        selectedClip: { exists: false },
        highlightedClipSlot: { exists: false },
      });

      const result = select();

      expect(result).toStrictEqual({ view: "arrangement" });
      expect(result.selectedTrack).toBeUndefined();
      expect(result.selectedScene).toBeUndefined();
      expect(result.selectedClip).toBeUndefined();
      expect(result.selectedDevice).toBeUndefined();
    });
  });
});
