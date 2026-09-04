// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { select } from "#src/tools/session/select.ts";
import {
  resetSelectTestState,
  setupAppViewMock,
  setupSongViewMock,
  setupTrackOnlyViewState,
  setupTrackViewMock,
} from "./select-test-helpers.ts";

vi.mock(import("#src/tools/shared/utils.ts"), async (importOriginal) => {
  const { selectSharedUtilsMockBody } =
    await import("./select-test-helpers.ts");

  return selectSharedUtilsMockBody(await importOriginal());
});

describe("select edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSelectTestState();
  });

  describe("readFullState device edge cases", () => {
    it("omits selectedDevice when track view's selected_device does not exist", () => {
      setupTrackOnlyViewState();

      // Track view returns a non-existent device
      setupTrackViewMock(livePath.track(0), "0");

      const result = select();

      // readSelectedDeviceInfo returns undefined when device doesn't exist
      expect(result.selectedDevice).toBeUndefined();
    });

    it("omits selectedDevice when track view has no selected_device", () => {
      setupTrackOnlyViewState();

      // Track view without a selected device (null device result)
      setupTrackViewMock(livePath.track(0));

      const result = select();

      expect(result.selectedDevice).toBeUndefined();
    });
  });

  describe("clip selection with view inference", () => {
    it("infers arrangement view when arrangement clip is selected without explicit view", () => {
      setupSongViewMock();
      setupAppViewMock();

      // Arrangement clip (no clipSlotIndex)
      registerMockObject("arr_clip_1", {
        path: "live_set tracks 0 arrangement_clips 0",
        type: "Clip",
        properties: {
          start_time: 4.0,
        },
      });

      // select() reads time signature for bar:beat formatting in clip results
      registerMockObject("live_set", {
        path: "live_set",
        type: "Song",
        properties: {
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });

      // Use clipId directly (internal param) to reach addClipToResponse
      // without view being set
      const result = select({ clipId: "id arr_clip_1" });

      // When effectiveView is null and clip has no slot, view = "arrangement"
      expect(result.view).toBe("arrangement");
      expect(result.selectedClip).toBeDefined();
    });
  });

  describe("selections Live makes but the response can't describe", () => {
    // Each object exists (selection succeeds) but sits at a path the response
    // builders can't read an index or category out of, so the field is omitted
    // rather than reported half-built.
    beforeEach(() => {
      setupSongViewMock();
      setupAppViewMock();
    });

    it("omits selectedTrack for a track outside every track category", () => {
      registerMockObject("odd_track", {
        path: "live_set odd_tracks 0",
        type: "Track",
      });

      expect(select({ trackId: "id odd_track" }).selectedTrack).toBeUndefined();
    });

    it("omits selectedScene for a scene with no index in its path", () => {
      registerMockObject("odd_scene", {
        path: "live_set odd_scenes",
        type: "Scene",
      });

      expect(select({ sceneId: "id odd_scene" }).selectedScene).toBeUndefined();
    });

    it("omits selectedDevice for a device at an unreadable path", () => {
      registerMockObject("odd_device", {
        path: "live_set odd_devices 0",
        type: "Device",
      });

      expect(
        select({ deviceId: "id odd_device" }).selectedDevice,
      ).toBeUndefined();
    });
  });

  describe("device path selection with non-existent device at path", () => {
    it("refuses a device path with nothing at it", () => {
      const songView = setupSongViewMock();

      setupAppViewMock();
      mockNonExistentObjects();

      // Register track but no device at index 99
      registerMockObject("track_0", {
        path: String(livePath.track(0)),
        type: "Track",
      });

      expect(() => select({ devicePath: "t0/d99" })).toThrow(
        'no device at "t0/d99"',
      );
      expect(songView.call).not.toHaveBeenCalledWith(
        "select_device",
        expect.anything(),
      );
    });
  });

  describe("targets Live selects but the response cannot describe", () => {
    beforeEach(() => {
      setupSongViewMock();
      setupAppViewMock();
    });

    // Live can report has_clip on a slot whose clip won't resolve. The
    // selection still succeeds — there is just nothing to describe.
    it("omits selectedClip when the slot says it has one that isn't there", () => {
      mockNonExistentObjects();
      registerMockObject("track_0", {
        path: String(livePath.track(0)),
        type: "Track",
      });
      registerMockObject("scene_0", {
        path: livePath.scene(0),
        type: "Scene",
      });
      registerMockObject("clipslot-0-0", {
        path: String(livePath.track(0).clipSlot(0)),
        type: "ClipSlot",
        properties: { has_clip: 1 },
      });

      expect(select({ slot: "0/0" }).selectedClip).toBeUndefined();
    });
  });
});
