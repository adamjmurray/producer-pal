// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildClipResultObject,
  prepareSessionClipSlot,
} from "../clip-results.ts";

describe("clip-results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
  });

  describe("buildClipResultObject", () => {
    it("returns object with only id when noteResult is null", () => {
      const result = buildClipResultObject("clip123", null);

      expect(result).toStrictEqual({ id: "clip123" });
      expect(result.noteCount).toBeUndefined();
    });

    it("returns object with id and noteCount when noteResult is provided", () => {
      const result = buildClipResultObject("clip456", { noteCount: 42 });

      expect(result).toStrictEqual({ id: "clip456", noteCount: 42 });
    });

    it("includes noteCount of 0 when explicitly provided", () => {
      const result = buildClipResultObject("clip789", { noteCount: 0 });

      expect(result).toStrictEqual({ id: "clip789", noteCount: 0 });
    });

    it("includes transformed when provided in noteResult", () => {
      const result = buildClipResultObject("clip100", {
        noteCount: 10,
        transformed: 5,
      });

      expect(result).toStrictEqual({
        id: "clip100",
        noteCount: 10,
        transformed: 5,
      });
    });

    it("omits transformed when undefined in noteResult", () => {
      const result = buildClipResultObject("clip200", { noteCount: 8 });

      expect(result).toStrictEqual({ id: "clip200", noteCount: 8 });
      expect(result.transformed).toBeUndefined();
    });

    it("includes the path when one is provided", () => {
      const result = buildClipResultObject("clip300", null, "t0/s3");

      expect(result).toStrictEqual({ id: "clip300", path: "t0/s3" });
    });

    it("omits path when none is provided", () => {
      const result = buildClipResultObject("clip300", null);

      expect(result).toStrictEqual({ id: "clip300" });
    });
  });

  describe("prepareSessionClipSlot", () => {
    function registerLiveSet(sceneCount: number) {
      const scenes: (string | number)[] = [];

      for (let i = 0; i < sceneCount; i++) {
        scenes.push("id", i + 1);
      }

      return registerMockObject("live-set", {
        path: livePath.liveSet,
        type: "Song",
        properties: { scenes },
      });
    }

    /**
     * Register t0/s1 as a clip slot.
     * @param hasClip - Whether the slot already holds a clip
     * @returns The registered clip slot
     */
    function registerSlot(hasClip: number): RegisteredMockObject {
      return registerMockObject(livePath.track(0).clipSlot(1), {
        path: livePath.track(0).clipSlot(1),
        type: "ClipSlot",
        properties: { has_clip: hasClip },
      });
    }

    it("creates no scenes when the slot already exists", () => {
      // sceneIndex 1 < currentSceneCount 3 → no scenes created; the slot is empty.
      const liveSet = registerLiveSet(3);
      const clipSlot = registerSlot(0);
      const prepared = prepareSessionClipSlot(
        0,
        1,
        LiveAPI.from(livePath.liveSet),
      );

      expect(liveSet.call).not.toHaveBeenCalledWith("create_scene", -1);
      expect(clipSlot.call).not.toHaveBeenCalledWith("delete_clip");
      expect(prepared.created).toBeNull();
      expect(prepared.overwrote).toBeNull();
      expect(prepared.clipSlot.path).toBe(
        String(livePath.track(0).clipSlot(1)),
      );
    });

    it("reports the scenes it had to create", () => {
      registerLiveSet(1);
      registerSlot(0);

      const prepared = prepareSessionClipSlot(
        0,
        1,
        LiveAPI.from(livePath.liveSet),
      );

      expect(prepared.created).toBe("s1");
    });

    it("deletes the clip the slot already holds, and says what it replaced", () => {
      registerLiveSet(3);

      const clipSlot = registerSlot(1);
      const prepared = prepareSessionClipSlot(
        0,
        1,
        LiveAPI.from(livePath.liveSet),
      );

      expect(clipSlot.call).toHaveBeenCalledWith("delete_clip");
      expect(prepared.overwrote).toBe("overwrote the existing clip at t0/s1");
    });
  });
});
