// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { select } from "#src/tools/session/select.ts";
import {
  resetSelectTestState,
  setupAppViewMock,
  setupSongViewMock,
} from "./select-test-helpers.ts";

vi.mock(import("#src/tools/shared/utils.ts"), async (importOriginal) => {
  const { selectSharedUtilsMockBody } =
    await import("./select-test-helpers.ts");

  return selectSharedUtilsMockBody(await importOriginal());
});

// select takes every object type by id, so trackId/sceneId/clipId/deviceId are
// all names a model reaches for here. Each is a target of its own, type-detected
// and existence-checked the way `id` is, so two together select two things and
// two that can't both be selected are refused rather than half-honored.
describe("select id aliases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSelectTestState();
  });

  it("selects a track named by trackId", () => {
    registerMockObject("track_123", {
      path: livePath.track(0),
      type: "Track",
    });
    const songView = setupSongViewMock();

    expect(select({ trackId: "id track_123" }).selectedTrack).toBeDefined();
    expect(songView.set).toHaveBeenCalledWith("selected_track", "id track_123");
  });

  it("selects a scene named by sceneId", () => {
    registerMockObject("scene_123", {
      path: livePath.scene(2),
      type: "Scene",
    });
    const songView = setupSongViewMock();

    expect(select({ sceneId: "id scene_123" }).selectedScene).toBeDefined();
    expect(songView.set).toHaveBeenCalledWith("selected_scene", "id scene_123");
  });

  it("selects a clip named by clipId", () => {
    registerMockObject("clip_123", {
      path: livePath.track(0).clipSlot(0).clip(),
      type: "Clip",
    });
    const songView = setupSongViewMock();

    setupAppViewMock();

    expect(select({ clipId: "id clip_123" }).selectedClip?.id).toBe("clip_123");
    expect(songView.set).toHaveBeenCalledWith("detail_clip", "id clip_123");
  });

  it("selects a device named by deviceId", () => {
    registerMockObject("device_123", {
      path: livePath.track(0).device(1),
      type: "Device",
    });
    setupSongViewMock();
    setupAppViewMock();

    expect(select({ deviceId: "id device_123" }).selectedDevice?.id).toBe(
      "device_123",
    );
  });

  // The alias goes through the same auto-detection `id` does, so a pad named by
  // the device spelling still gets selected on its rack rather than as a device.
  it("reads the type off the object, not off the alias", () => {
    registerMockObject("pad_c1", {
      path: livePath.track(0).device(0).drumPad(36),
      type: "DrumPad",
      properties: { note: 36 },
    });
    setupSongViewMock();
    setupAppViewMock();

    const result = select({ deviceId: "id pad_c1" });

    expect(result.selectedDevice).toBeUndefined();
    expect(result.selectedDrumPad?.id).toBe("pad_c1");
  });

  // Dropping the guess was the old behavior: the call reported success and
  // selected nothing. Reading it as a target is what makes this refusable.
  it("refuses an alias that names nothing", () => {
    mockNonExistentObjects();
    setupSongViewMock();

    expect(() => select({ clipId: "id missing" })).toThrow(
      'select failed: id "id missing" does not exist',
    );
  });

  // A client that fills every unused field with null sends four of these. None
  // is published, so naming them back would be four lines about params the
  // caller can't act on.
  it("reads coerced-null aliases as unset, without a word", () => {
    const warn = vi.spyOn(console, "warn");

    setupSongViewMock();
    select({ trackId: "null", sceneId: "null", clipId: "null", deviceId: "" });

    expect(warn).not.toHaveBeenCalled();
  });

  // Reading only the first alias dropped the rest in silence, while the
  // framework's migration notice told the caller every one had been honored.
  it("selects a track and a scene named by separate aliases", () => {
    registerMockObject("track_123", {
      path: livePath.track(0),
      type: "Track",
    });
    registerMockObject("scene_123", {
      path: livePath.scene(2),
      type: "Scene",
    });
    const songView = setupSongViewMock();

    const result = select({
      trackId: "id track_123",
      sceneId: "id scene_123",
    });

    expect(result.selectedTrack).toBeDefined();
    expect(result.selectedScene).toBeDefined();
    expect(songView.set).toHaveBeenCalledWith("selected_track", "id track_123");
    expect(songView.set).toHaveBeenCalledWith("selected_scene", "id scene_123");
  });

  it("takes a clip alias alongside the track it sits on", () => {
    registerMockObject("track_123", {
      path: livePath.track(0),
      type: "Track",
    });
    registerMockObject("clip_123", {
      path: livePath.track(0).clipSlot(0).clip(),
      type: "Clip",
    });
    setupSongViewMock();
    setupAppViewMock();

    const result = select({ trackId: "id track_123", clipId: "id clip_123" });

    expect(result.selectedTrack).toBeDefined();
    expect(result.selectedClip?.id).toBe("clip_123");
  });

  // Selecting the clip moves Live's track selection onto its own track, so
  // honoring both would report a track that isn't the one on screen.
  it("refuses a clip alias on a different track than trackId", () => {
    registerMockObject("track_123", {
      path: livePath.track(0),
      type: "Track",
    });
    registerMockObject("track_456", {
      path: livePath.track(3),
      type: "Track",
    });
    registerMockObject("clip_123", {
      path: livePath.track(3).clipSlot(0).clip(),
      type: "Clip",
    });
    setupSongViewMock();
    setupAppViewMock();

    expect(() =>
      select({ trackId: "id track_123", clipId: "id clip_123" }),
    ).toThrow("select failed: trackId and clipId name different tracks");
  });

  it("refuses a clip alias in a different scene than sceneId", () => {
    registerMockObject("scene_123", {
      path: livePath.scene(2),
      type: "Scene",
    });
    registerMockObject("scene_456", {
      path: livePath.scene(0),
      type: "Scene",
    });
    registerMockObject("clip_123", {
      path: livePath.track(0).clipSlot(0).clip(),
      type: "Clip",
    });
    setupSongViewMock();
    setupAppViewMock();

    expect(() =>
      select({ sceneId: "id scene_123", clipId: "id clip_123" }),
    ).toThrow("select failed: sceneId and clipId name different scenes");
  });

  it("takes a device alias on the return track named by trackId", () => {
    registerMockObject("return_0", {
      path: livePath.returnTrack(0),
      type: "Track",
    });
    registerMockObject("device_123", {
      path: livePath.returnTrack(0).device(0),
      type: "Device",
    });
    setupSongViewMock();
    setupAppViewMock();

    const result = select({
      trackId: "id return_0",
      deviceId: "id device_123",
    });

    expect(result.selectedTrack).toBeDefined();
    expect(result.selectedDevice?.id).toBe("device_123");
  });

  // An arrangement clip sits on a timeline, not in a scene, so there is no
  // scene for a sceneId to disagree with.
  it("takes a scene alias alongside an arrangement clip", () => {
    registerMockObject("scene_123", {
      path: livePath.scene(2),
      type: "Scene",
    });
    registerMockObject("clip_123", {
      path: livePath.track(0).arrangementClip(0),
      type: "Clip",
      properties: { start_time: 0 },
    });
    setupSongViewMock();
    setupAppViewMock();

    const result = select({ sceneId: "id scene_123", clipId: "id clip_123" });

    expect(result.selectedScene).toBeDefined();
    expect(result.selectedClip?.id).toBe("clip_123");
  });

  it("refuses two ids of the same kind naming different objects", () => {
    registerMockObject("track_123", {
      path: livePath.track(0),
      type: "Track",
    });
    registerMockObject("track_456", {
      path: livePath.track(1),
      type: "Track",
    });
    setupSongViewMock();

    expect(() =>
      select({ id: "id track_123", trackId: "id track_456" }),
    ).toThrow("select failed: id and trackId name different tracks; send one");
  });

  it("takes the same object under two spellings", () => {
    registerMockObject("track_123", {
      path: livePath.track(0),
      type: "Track",
    });
    const warn = vi.spyOn(console, "warn");

    setupSongViewMock();

    expect(
      select({ id: "id track_123", trackId: "id track_123" }).selectedTrack,
    ).toBeDefined();
    expect(warn).not.toHaveBeenCalled();
  });
});
