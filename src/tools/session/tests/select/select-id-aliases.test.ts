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
// all names a model reaches for here. Each folds onto `id`, which means the
// type detection and the existence check apply to the guess too — a spelling
// that used to be dropped as an unexpected argument now selects.
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
  // selected nothing. Folding it onto `id` is what makes this refusable.
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

  it("keeps id and says the alias went nowhere when they disagree", () => {
    registerMockObject("track_123", {
      path: livePath.track(0),
      type: "Track",
    });
    const warn = vi.spyOn(console, "warn");

    setupSongViewMock();
    select({ id: "id track_123", trackId: "id other_track" });

    expect(warn).toHaveBeenCalledWith(
      'trackId "id other_track" ignored — "id" names the target',
    );
  });
});
