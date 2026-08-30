// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildClipResultObject,
  prepareSessionClipSlot,
} from "../clip-result-helpers.ts";

describe("clip-result-helpers", () => {
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
    function registerLiveSet(sceneCount: number): void {
      const scenes: (string | number)[] = [];

      for (let i = 0; i < sceneCount; i++) {
        scenes.push("id", i + 1);
      }

      registerMockObject("live-set", {
        path: livePath.liveSet,
        type: "Song",
        properties: { scenes },
      });
    }

    it("throws at the boundary sceneIndex === maxAutoCreatedScenes", () => {
      // 1000 >= 1000 must throw. A `>` mutant (strict) would fall through at the
      // exact boundary; the message pins both the blanked-string and the
      // `MAX_AUTO_CREATED_SCENES - 1` (=999) arithmetic mutants.
      registerLiveSet(3);

      expect(() =>
        prepareSessionClipSlot(0, 1000, LiveAPI.from(livePath.liveSet), 1000),
      ).toThrow(
        'scene "s1000" is out of range: scenes auto-create only through "s999"',
      );
    });

    it("does not auto-create scenes when the slot already exists", () => {
      // sceneIndex 1 < currentSceneCount 3 → no scenes created; the slot is empty.
      const liveSet = registerMockObject("live-set", {
        path: livePath.liveSet,
        type: "Song",
        properties: { scenes: ["id", 1, "id", 2, "id", 3] },
      });

      registerMockObject(livePath.track(0).clipSlot(1), {
        path: livePath.track(0).clipSlot(1),
        type: "ClipSlot",
        properties: { has_clip: 0 },
      });

      const slot = prepareSessionClipSlot(
        0,
        1,
        LiveAPI.from(livePath.liveSet),
        1000,
      );

      expect(liveSet.call).not.toHaveBeenCalledWith("create_scene", -1);
      expect(slot.path).toBe(String(livePath.track(0).clipSlot(1)));
    });

    it("throws when a clip already exists in the target slot", () => {
      registerMockObject("live-set", {
        path: livePath.liveSet,
        type: "Song",
        properties: { scenes: ["id", 1, "id", 2, "id", 3] },
      });
      registerMockObject(livePath.track(0).clipSlot(1), {
        path: livePath.track(0).clipSlot(1),
        type: "ClipSlot",
        properties: { has_clip: 1 },
      });

      expect(() =>
        prepareSessionClipSlot(0, 1, LiveAPI.from(livePath.liveSet), 1000),
      ).toThrow("a clip already exists at t0/s1");
    });
  });
});
