// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildClipResultObject, createInSessionSlot } from "../clip-results.ts";

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

  describe("createInSessionSlot", () => {
    const create = (slot: LiveAPI): unknown => slot.call("create_clip", 4);

    function registerLiveSet(sceneCount: number): RegisteredMockObject {
      return registerMockObject("live-set", {
        path: livePath.liveSet,
        type: "Song",
        properties: {
          scenes: children(
            ...Array.from({ length: sceneCount }, (_, i) => `scene${i}`),
          ),
        },
      });
    }

    /**
     * Register t0/s<scene> as a clip slot holding a clip or not.
     * @param sceneIndex - The slot's scene
     * @param hasClip - Whether the slot already holds a clip
     * @param clipId - The clip's id, when it holds one
     * @returns The registered clip slot
     */
    function registerSlot(
      sceneIndex: number,
      hasClip: number,
      clipId = `clip${sceneIndex}`,
    ): RegisteredMockObject {
      const slotPath = livePath.track(0).clipSlot(sceneIndex);

      registerMockObject(hasClip ? clipId : "0", {
        path: slotPath.clip(),
        type: "Clip",
      });

      return registerMockObject(slotPath, {
        path: slotPath,
        type: "ClipSlot",
        properties: { has_clip: hasClip },
      });
    }

    /**
     * Make the slot's create_clip land a clip.
     * @param slot - The slot
     * @param sceneIndex - Its scene
     */
    function landsClip(slot: RegisteredMockObject, sceneIndex: number): void {
      slot.call.mockImplementation((method: string) => {
        if (method === "create_clip") {
          registerMockObject("made", {
            path: livePath.track(0).clipSlot(sceneIndex).clip(),
            type: "Clip",
          });
        }
      });
    }

    it("creates straight into an empty slot", () => {
      registerLiveSet(3);
      landsClip(registerSlot(1, 0), 1);

      const made = createInSessionSlot(
        0,
        1,
        LiveAPI.from(livePath.liveSet),
        create,
      );

      expect(made.clip.id).toBe("made");
      expect(made.created).toBeNull();
      expect(made.overwrote).toBeNull();
    });

    it("reports the scenes it had to create", () => {
      registerLiveSet(1);
      landsClip(registerSlot(1, 0), 1);

      const made = createInSessionSlot(
        0,
        1,
        LiveAPI.from(livePath.liveSet),
        create,
      );

      expect(made.created).toBe("s1");
    });

    it("clears the scratch slot when the copy onto the destination fails", () => {
      registerLiveSet(2);

      const dest = registerSlot(1, 1);
      const scratch = registerSlot(0, 0);

      registerMockObject(livePath.track(0), {
        path: livePath.track(0),
        properties: { clip_slots: children("slot0", "slot1") },
      });
      // The build lands, but duplicate_clip_to copies nothing.
      scratch.call.mockImplementation((method: string) => {
        if (method === "create_clip") {
          scratch.properties.has_clip = 1;
          registerMockObject("built", {
            path: livePath.track(0).clipSlot(0).clip(),
            type: "Clip",
          });
        }
      });

      expect(() =>
        createInSessionSlot(0, 1, LiveAPI.from(livePath.liveSet), create),
      ).toThrow(
        "Live didn't copy the new clip onto t0/s1; the clip at t0/s1 was not touched",
      );
      expect(scratch.call).toHaveBeenCalledWith("delete_clip");
      expect(dest.call).not.toHaveBeenCalledWith("delete_clip");
    });
  });
});
