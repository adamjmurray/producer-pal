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
import {
  buildClipResponseFromId,
  buildClipResponseFromSlot,
  buildDeviceResponseFromId,
  buildDeviceResponseFromPath,
  buildSceneResponseFromId,
  buildTrackResponseFromId,
  readFullState,
} from "#src/tools/control/helpers/select-response-helpers.ts";
import {
  resetSelectTestState,
  setupTrackOnlyViewState,
  setupViewStateMock,
  setupTrackViewMock,
  setupDeviceMock,
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

describe("select-response-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSelectTestState();
  });

  describe("buildTrackResponseFromId", () => {
    it("returns track info for a midi track", () => {
      registerMockObject("track_1", {
        path: String(livePath.track(0)),
        type: "Track",
        properties: {
          category: "regular",
          trackIndex: 0,
          returnTrackIndex: null,
          has_midi_input: 1,
        },
      });

      const result = buildTrackResponseFromId("id track_1");

      expect(result).toStrictEqual({
        id: "track_1",
        type: "midi",
        trackIndex: 0,
      });
    });

    it("returns track info for an audio track", () => {
      registerMockObject("track_2", {
        path: String(livePath.track(1)),
        type: "Track",
        properties: {
          category: "regular",
          trackIndex: 1,
          returnTrackIndex: null,
          has_midi_input: 0,
        },
      });

      const result = buildTrackResponseFromId("id track_2");

      expect(result).toStrictEqual({
        id: "track_2",
        type: "audio",
        trackIndex: 1,
      });
    });

    it("returns track info for a return track", () => {
      registerMockObject("return_track_0", {
        path: String(livePath.returnTrack(0)),
        type: "Track",
        properties: {
          category: "return",
          trackIndex: null,
          returnTrackIndex: 0,
          has_midi_input: 0,
        },
      });

      const result = buildTrackResponseFromId("id return_track_0");

      expect(result).toStrictEqual({
        id: "return_track_0",
        type: "return",
        trackIndex: 0,
      });
    });

    it("returns track info for master track", () => {
      registerMockObject("master_track", {
        path: String(livePath.masterTrack()),
        type: "Track",
        properties: {
          category: "master",
          trackIndex: null,
          returnTrackIndex: null,
          has_midi_input: 0,
        },
      });

      const result = buildTrackResponseFromId("id master_track");

      expect(result).toStrictEqual({
        id: "master_track",
        type: "master",
      });
    });

    it("returns undefined for non-existent track", () => {
      mockNonExistentObjects();

      const result = buildTrackResponseFromId("id nonexistent");

      expect(result).toBeUndefined();
    });

    it("returns undefined when track category is null", () => {
      registerMockObject("track_null_cat", {
        path: String(livePath.track(0)),
        type: "Track",
        properties: {
          category: null,
          trackIndex: null,
          returnTrackIndex: null,
          has_midi_input: 0,
        },
      });

      const result = buildTrackResponseFromId("id track_null_cat");

      expect(result).toBeUndefined();
    });
  });

  describe("buildSceneResponseFromId", () => {
    it("returns scene info", () => {
      registerMockObject("scene_0", {
        path: String(livePath.scene(0)),
        type: "Scene",
        properties: { sceneIndex: 0 },
      });

      const result = buildSceneResponseFromId("id scene_0");

      expect(result).toStrictEqual({ id: "scene_0", sceneIndex: 0 });
    });

    it("returns undefined for non-existent scene", () => {
      mockNonExistentObjects();

      const result = buildSceneResponseFromId("id nonexistent");

      expect(result).toBeUndefined();
    });
  });

  describe("buildClipResponseFromId", () => {
    it("returns session clip info with slot", () => {
      registerMockObject("clip_1", {
        path: livePath.track(0).clipSlot(2).clip(),
        type: "Clip",
        properties: {
          trackIndex: 0,
          clipSlotIndex: 2,
        },
      });

      const result = buildClipResponseFromId("id clip_1");

      expect(result).toStrictEqual({
        id: "clip_1",
        slot: "0/2",
      });
    });

    it("returns arrangement clip info with start time", () => {
      registerMockObject("arr_clip_1", {
        path: "live_set tracks 0 arrangement_clips 0",
        type: "Clip",
        properties: {
          start_time: 4.0,
          trackIndex: 0,
        },
      });

      registerMockObject("live_set", {
        path: "live_set",
        type: "Song",
        properties: {
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });

      const result = buildClipResponseFromId("id arr_clip_1");

      expect(result).toStrictEqual({
        id: "arr_clip_1",
        trackIndex: 0,
        arrangementStart: "2|1",
      });
    });

    it("returns undefined for non-existent clip", () => {
      mockNonExistentObjects();

      const result = buildClipResponseFromId("id nonexistent");

      expect(result).toBeUndefined();
    });
  });

  describe("buildClipResponseFromSlot", () => {
    it("returns clip info for occupied slot", () => {
      registerMockObject("slot_clip", {
        path: livePath.track(0).clipSlot(1).clip(),
        type: "Clip",
        properties: {
          trackIndex: 0,
          clipSlotIndex: 1,
        },
      });

      const result = buildClipResponseFromSlot({
        trackIndex: 0,
        sceneIndex: 1,
      });

      expect(result).toStrictEqual({ id: "slot_clip", slot: "0/1" });
    });

    it("returns undefined for empty slot", () => {
      mockNonExistentObjects();

      const result = buildClipResponseFromSlot({
        trackIndex: 0,
        sceneIndex: 5,
      });

      expect(result).toBeUndefined();
    });
  });

  describe("buildDeviceResponseFromId", () => {
    it("returns device info", () => {
      registerMockObject("device_1", {
        path: String(livePath.track(0)) + " devices 0",
        type: "Device",
      });

      const result = buildDeviceResponseFromId("id device_1");

      expect(result).toStrictEqual({ id: "device_1", path: "t0/d0" });
    });

    it("returns undefined for non-existent device", () => {
      mockNonExistentObjects();

      const result = buildDeviceResponseFromId("id nonexistent");

      expect(result).toBeUndefined();
    });

    it("returns undefined when device path cannot be extracted", () => {
      registerMockObject("device_bad_path", {
        path: "some/unrecognized/path",
        type: "Device",
      });

      const result = buildDeviceResponseFromId("id device_bad_path");

      expect(result).toBeUndefined();
    });
  });

  describe("buildDeviceResponseFromPath", () => {
    it("returns device info for valid path", () => {
      registerMockObject("track_0", {
        path: String(livePath.track(0)),
        type: "Track",
      });

      registerMockObject("device_at_path", {
        path: String(livePath.track(0)) + " devices 1",
        type: "Device",
      });

      const result = buildDeviceResponseFromPath("t0/d1");

      expect(result).toStrictEqual({ id: "device_at_path", path: "t0/d1" });
    });

    it("returns undefined when device does not exist at path", () => {
      registerMockObject("track_0", {
        path: String(livePath.track(0)),
        type: "Track",
      });
      mockNonExistentObjects();

      const result = buildDeviceResponseFromPath("t0/d99");

      expect(result).toBeUndefined();
    });

    it("returns undefined when path resolves to a non-device target", () => {
      const result = buildDeviceResponseFromPath("t0/d0/c0");

      expect(result).toBeUndefined();
    });
  });

  describe("readFullState", () => {
    it("returns view only when nothing is selected", () => {
      const result = readFullState();

      expect(result.view).toBe("session");
      expect(result.selectedTrack).toBeUndefined();
      expect(result.selectedScene).toBeUndefined();
      expect(result.selectedClip).toBeUndefined();
      expect(result.selectedDevice).toBeUndefined();
    });

    it("includes selectedDevice when track has a selected device", () => {
      setupTrackOnlyViewState();

      const devicePath = String(livePath.track(0)) + " devices 0";

      setupDeviceMock("device_0", devicePath);
      setupTrackViewMock(livePath.track(0), "device_0");

      const result = readFullState();

      expect(result.selectedDevice).toStrictEqual({
        id: "device_0",
        path: "t0/d0",
      });
    });

    it("omits selectedDevice when device path cannot be extracted", () => {
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

      const devicePath = "some/unrecognized/path";

      setupDeviceMock("device_bad", devicePath);
      setupTrackViewMock(livePath.track(0), "device_bad");

      const result = readFullState();

      expect(result.selectedDevice).toBeUndefined();
    });

    it("omits selectedDevice when track view returns no selected device", () => {
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

      // Track view exists but has no selected device
      setupTrackViewMock(livePath.track(0), undefined);

      const result = readFullState();

      expect(result.selectedTrack).toBeDefined();
      expect(result.selectedDevice).toBeUndefined();
    });

    it("omits selectedDevice when track view does not exist", () => {
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

      // Do NOT set up a track view mock — the view path resolves to
      // a non-existent object so readSelectedDeviceInfo returns early.
      mockNonExistentObjects();

      const result = readFullState();

      expect(result.selectedTrack).toBeDefined();
      expect(result.selectedDevice).toBeUndefined();
    });
  });
});
