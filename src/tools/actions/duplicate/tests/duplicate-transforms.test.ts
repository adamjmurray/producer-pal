// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerMockObject,
  registerSessionClipDuplication,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { applyTransformsToDuplicatedClips } from "#src/tools/actions/duplicate/helpers/duplicate-transform-helpers.ts";

// Capture warnings emitted for unsupported transforms/code usage
vi.mock(import("#src/shared/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

// updateClip is mocked via duplicate-mocks-test-helpers.ts -> setup.ts
import { updateClipMock } from "./setup.ts";
import * as consoleMock from "#src/shared/v8-max-console.ts";

/**
 * Set up two-destination session duplication mocks on track 0:
 * slot 1 (existing) and slot 2 (empty). Used by the multi-copy transform tests.
 */
function setupTwoSlotDuplication(): void {
  registerSessionClipDuplication();
  registerMockObject("live_set/tracks/0/clip_slots/2", {
    path: livePath.track(0).clipSlot(2),
    properties: { has_clip: 0 },
  });
  registerMockObject("live_set/tracks/0/clip_slots/1/clip", {
    path: livePath.track(0).clipSlot(1).clip(),
  });
  registerMockObject("live_set/tracks/0/clip_slots/2/clip", {
    path: livePath.track(0).clipSlot(2).clip(),
  });
}

describe("duplicate - transforms/code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("duplicate() integration", () => {
    it("applies transforms to a duplicated session clip", async () => {
      registerSessionClipDuplication({ destClipProperties: {} });
      const destId = "live_set/tracks/0/clip_slots/1/clip";

      updateClipMock.mockReturnValueOnce([
        { id: destId, noteCount: 4, transformed: 2 },
      ]);

      const result = await duplicate({
        type: "clip",
        id: "clip1",
        toSlot: "0/1",
        transforms: ["velocity *= 0.5"],
      });

      expect(updateClipMock).toHaveBeenCalledTimes(1);
      expect(updateClipMock).toHaveBeenCalledWith(
        { ids: destId, transforms: ["velocity *= 0.5"], code: undefined },
        expect.anything(),
      );
      expect(result).toStrictEqual({
        id: destId,
        slot: "0/1",
        noteCount: 4,
        transformed: 2,
      });
    });

    it("cycles a single-entry transform array across multiple duplicated clips", async () => {
      setupTwoSlotDuplication();

      const dest1 = "live_set/tracks/0/clip_slots/1/clip";
      const dest2 = "live_set/tracks/0/clip_slots/2/clip";

      updateClipMock.mockReturnValueOnce([
        { id: dest1, noteCount: 3, transformed: 3 },
        { id: dest2, noteCount: 3, transformed: 3 },
      ]);

      const result = await duplicate({
        type: "clip",
        id: "clip1",
        toSlot: "0/1, 0/2",
        transforms: ["velocity = seq(100, 60)"],
      });

      // One entry cycles to both ids, keeping a single batched updateClip call
      // so clip.index/clip.count span both copies (seq() stays correct).
      expect(updateClipMock).toHaveBeenCalledWith(
        {
          ids: `${dest1},${dest2}`,
          transforms: ["velocity = seq(100, 60)", "velocity = seq(100, 60)"],
          code: undefined,
        },
        expect.anything(),
      );
      expect(result).toStrictEqual([
        { id: dest1, slot: "0/1", noteCount: 3, transformed: 3 },
        { id: dest2, slot: "0/2", noteCount: 3, transformed: 3 },
      ]);
    });

    it("applies distinct per-copy transforms when the array matches the copies", async () => {
      setupTwoSlotDuplication();

      const dest1 = "live_set/tracks/0/clip_slots/1/clip";
      const dest2 = "live_set/tracks/0/clip_slots/2/clip";

      updateClipMock.mockReturnValueOnce([{ id: dest1 }, { id: dest2 }]);

      await duplicate({
        type: "clip",
        id: "clip1",
        toSlot: "0/1, 0/2",
        transforms: ["pitch += 0", "pitch += 12"],
      });

      expect(updateClipMock).toHaveBeenCalledWith(
        {
          ids: `${dest1},${dest2}`,
          transforms: ["pitch += 0", "pitch += 12"],
          code: undefined,
        },
        expect.anything(),
      );
    });

    it("warns when more transform entries are given than copies", async () => {
      registerSessionClipDuplication({ destClipProperties: {} });
      const destId = "live_set/tracks/0/clip_slots/1/clip";

      updateClipMock.mockReturnValueOnce([{ id: destId }]);

      await duplicate({
        type: "clip",
        id: "clip1",
        toSlot: "0/1",
        transforms: ["pitch += 0", "pitch += 12"],
      });

      expect(consoleMock.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          "2 transforms provided but only 1 clips — ignoring extra",
        ),
      );
    });

    it("passes the code array through to updateClip", async () => {
      registerSessionClipDuplication({ destClipProperties: {} });
      const destId = "live_set/tracks/0/clip_slots/1/clip";

      updateClipMock.mockReturnValueOnce([{ id: destId, noteCount: 8 }]);

      const result = await duplicate({
        type: "clip",
        id: "clip1",
        toSlot: "0/1",
        code: ["return notes;"],
      });

      expect(updateClipMock).toHaveBeenCalledWith(
        { ids: destId, transforms: undefined, code: ["return notes;"] },
        expect.anything(),
      );
      expect(result).toStrictEqual({
        id: destId,
        slot: "0/1",
        noteCount: 8,
      });
    });

    it("does not call updateClip when no transforms/code are given", async () => {
      registerSessionClipDuplication({ destClipProperties: {} });

      await duplicate({ type: "clip", id: "clip1", toSlot: "0/1" });

      expect(updateClipMock).not.toHaveBeenCalled();
    });

    it("warns and skips transforms for non-clip types", async () => {
      registerMockObject("track1", { path: livePath.track(0) });
      registerMockObject("live_set", { path: livePath.liveSet });
      registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
        properties: { devices: [], clip_slots: [], arrangement_clips: [] },
      });

      await duplicate({
        type: "track",
        id: "track1",
        transforms: ["velocity *= 0.5"],
      });

      expect(updateClipMock).not.toHaveBeenCalled();
      expect(consoleMock.warn).toHaveBeenCalledWith(
        expect.stringContaining("transforms/code ignored"),
      );
    });
  });

  describe("applyTransformsToDuplicatedClips", () => {
    it("shares one transform entry across clips nested in one logical duplicate", async () => {
      const createdObjects: object[] = [
        { trackIndex: 0, clips: [{ id: "a" }, { id: "b" }] },
      ];

      updateClipMock.mockReturnValueOnce([
        { id: "a", noteCount: 1, transformed: 1 },
        { id: "b", noteCount: 2 },
      ]);

      await applyTransformsToDuplicatedClips(
        createdObjects,
        ["velocity *= 2"],
        undefined,
        {},
      );

      // The two tiled clips belong to one logical duplicate, so they receive the
      // same transform entry (built per-id, aligned with the flattened ids).
      expect(updateClipMock).toHaveBeenCalledWith(
        {
          ids: "a,b",
          transforms: ["velocity *= 2", "velocity *= 2"],
          code: undefined,
        },
        {},
      );
      expect(createdObjects).toStrictEqual([
        {
          trackIndex: 0,
          clips: [
            { id: "a", noteCount: 1, transformed: 1 },
            { id: "b", noteCount: 2 },
          ],
        },
      ]);
    });

    it("cycles per-duplicate entries across multiple logical duplicates", async () => {
      const createdObjects: object[] = [{ id: "a" }, { id: "b" }, { id: "c" }];

      updateClipMock.mockReturnValueOnce([
        { id: "a" },
        { id: "b" },
        { id: "c" },
      ]);

      await applyTransformsToDuplicatedClips(
        createdObjects,
        ["t0", "t1"],
        undefined,
        {},
      );

      // 3 duplicates, 2 entries → cycle: a→t0, b→t1, c→t0 (modulo)
      expect(updateClipMock).toHaveBeenCalledWith(
        { ids: "a,b,c", transforms: ["t0", "t1", "t0"], code: undefined },
        {},
      );
    });

    it("is a no-op when there are no clips to transform", async () => {
      await applyTransformsToDuplicatedClips(
        [],
        ["velocity *= 2"],
        undefined,
        {},
      );

      expect(updateClipMock).not.toHaveBeenCalled();
    });

    it("handles a single (non-array) updateClip result", async () => {
      const createdObjects: object[] = [{ id: "a", slot: "0/1" }];

      updateClipMock.mockReturnValueOnce({
        id: "a",
        noteCount: 5,
        transformed: 3,
      });

      await applyTransformsToDuplicatedClips(
        createdObjects,
        ["velocity *= 2"],
        undefined,
        {},
      );

      expect(createdObjects).toStrictEqual([
        { id: "a", slot: "0/1", noteCount: 5, transformed: 3 },
      ]);
    });

    it("does not pass an undefined transforms/code array down", async () => {
      const createdObjects: object[] = [{ id: "a" }];

      updateClipMock.mockReturnValueOnce([{ id: "a" }]);

      await applyTransformsToDuplicatedClips(
        createdObjects,
        undefined,
        ["return notes;"],
        {},
      );

      expect(updateClipMock).toHaveBeenCalledWith(
        { ids: "a", transforms: undefined, code: ["return notes;"] },
        {},
      );
    });
  });
});
