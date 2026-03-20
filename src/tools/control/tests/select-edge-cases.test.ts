// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { select } from "#src/tools/control/select.ts";
import {
  resetSelectTestState,
  setupAppViewMock,
  setupSongViewMock,
  setupTrackViewMock,
  setupViewStateMock,
} from "./select-test-helpers.ts";

vi.mock(import("#src/tools/shared/utils.ts"), async (importOriginal) => {
  const { viewMockToLive, viewMockFromLive } =
    await import("./select-test-helpers.ts");

  return {
    ...(await importOriginal()),
    toLiveApiView: vi.fn(viewMockToLive),
    fromLiveApiView: vi.fn(viewMockFromLive),
  };
});

describe("select edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSelectTestState();
  });

  describe("readFullState device edge cases", () => {
    it("omits selectedDevice when track view's selected_device does not exist", () => {
      clearMockRegistry();

      setupViewStateMock({
        view: "session",
        selectedTrack: {
          exists: true,
          category: "regular",
          trackIndex: 0,
          id: "track_1",
          path: String(livePath.track(0)),
        },
        selectedScene: { exists: false },
        selectedClip: { exists: false },
        highlightedClipSlot: { exists: false },
      });

      // Track view returns a non-existent device
      setupTrackViewMock(livePath.track(0), "0");

      const result = select();

      // readSelectedDeviceInfo returns undefined when device doesn't exist
      expect(result.selectedDevice).toBeUndefined();
    });

    it("omits selectedDevice when track view has no selected_device", () => {
      clearMockRegistry();

      setupViewStateMock({
        view: "session",
        selectedTrack: {
          exists: true,
          category: "regular",
          trackIndex: 0,
          id: "track_1",
          path: String(livePath.track(0)),
        },
        selectedScene: { exists: false },
        selectedClip: { exists: false },
        highlightedClipSlot: { exists: false },
      });

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

  describe("device path selection with non-existent device at path", () => {
    it("skips device selection when device at path doesn't exist", () => {
      setupSongViewMock();
      setupAppViewMock();
      mockNonExistentObjects();

      // Register track but no device at index 99
      registerMockObject("track_0", {
        path: String(livePath.track(0)),
        type: "Track",
      });

      const result = select({ devicePath: "t0/d99" });

      // Device doesn't exist at path, so no selection made
      expect(result.selectedDevice).toBeUndefined();
    });
  });
});
