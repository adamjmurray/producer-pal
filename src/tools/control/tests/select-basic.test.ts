// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { select } from "#src/tools/control/select.ts";
import {
  expectViewState,
  getDefaultViewState,
  resetSelectTestState,
  setupAppViewMock,
  setupDeviceMock,
  setupSessionClipMock,
  setupSongViewMock,
  setupTrackViewMock,
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

      const result = select({ id: "id track_123" });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_track",
        "id track_123",
      );
      expect(result).toStrictEqual(expectViewState({ detectedType: "track" }));
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
      expect(result).toStrictEqual(expectViewState());
    });

    it("defaults to regular track type when only index provided", () => {
      registerMockObject("track_id_123", {
        path: livePath.track(2),
        type: "Track",
      });

      const result = select({ trackIndex: 2 });

      expect(result).toStrictEqual(expectViewState());
    });

    it("selects track by ID with trackIndex hint", () => {
      registerMockObject("track_123", {
        path: livePath.track(2),
        type: "Track",
      });
      const songView = setupSongViewMock();

      const result = select({ id: "id track_123", trackIndex: 2 });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_track",
        "id track_123",
      );
      expect(result).toStrictEqual(expectViewState({ detectedType: "track" }));
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

      const result = select({ id: "id scene_123" });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_scene",
        "id scene_123",
      );
      expect(result).toStrictEqual(expectViewState({ detectedType: "scene" }));
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
      expect(result).toStrictEqual(expectViewState());
    });

    it("selects scene by ID with sceneIndex hint", () => {
      registerMockObject("scene_123", {
        path: livePath.scene(3),
        type: "Scene",
      });
      const songView = setupSongViewMock();

      const result = select({ id: "id scene_123", sceneIndex: 3 });

      expect(songView.set).toHaveBeenCalledWith(
        "selected_scene",
        "id scene_123",
      );
      expect(result).toStrictEqual(expectViewState({ detectedType: "scene" }));
    });

    it("skips scene selection when scene does not exist", () => {
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
    it("selects clip by ID and auto-opens clip detail", () => {
      registerMockObject("clip_123", {
        path: livePath.track(0).clipSlot(0).clip(),
        type: "Clip",
      });
      const songView = setupSongViewMock();
      const appView = setupAppViewMock();

      const result = select({ id: "id clip_123" });

      expect(songView.set).toHaveBeenCalledWith("detail_clip", "id clip_123");
      expect(appView.call).toHaveBeenCalledWith("focus_view", "Detail/Clip");
      expect(result).toStrictEqual(expectViewState({ detectedType: "clip" }));
    });

    it("highlights clip slot when selecting a session clip", () => {
      const { clip, clipSlot } = setupSessionClipMock("session_clip_123", 2, 3);
      const songView = setupSongViewMock();

      select({ id: `id ${clip.id}` });

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

      select({ id: `id ${clip.id}`, view: "arrangement" });

      const outletMock = (globalThis as Record<string, unknown>)
        .outlet as ReturnType<typeof vi.fn>;

      expect(outletMock).toHaveBeenCalledWith(
        1,
        expect.stringContaining("ignoring view="),
      );
    });
  });

  describe("device selection", () => {
    it("selects device by ID and auto-opens device detail", () => {
      const device = setupDeviceMock(
        "device_123",
        String(livePath.track(0).device(0)),
      );
      const songView = setupSongViewMock();
      const appView = setupAppViewMock();

      setupTrackViewMock(livePath.track(0));

      const result = select({ id: `id ${device.id}` });

      expect(songView.call).toHaveBeenCalledWith(
        "select_device",
        `id ${device.id}`,
      );
      expect(appView.call).toHaveBeenCalledWith(
        "focus_view",
        "Detail/DeviceChain",
      );
      expect(result).toStrictEqual(expectViewState({ detectedType: "device" }));
    });
  });

  describe("highlighted clip slot", () => {
    it("sets highlighted clip slot by string", () => {
      const clipSlot = registerMockObject("clipslot_id_789", {
        path: livePath.track(1).clipSlot(3),
        type: "ClipSlot",
        properties: {
          has_clip: 0,
        },
      });
      const songView = setupSongViewMock();

      const result = select({ clipSlot: "1/3" });

      expect(songView.set).toHaveBeenCalledWith(
        "highlighted_clip_slot",
        `id ${clipSlot.id}`,
      );
      expect(result).toStrictEqual(expectViewState());
    });
  });
});
