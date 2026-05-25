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
        transforms: "velocity *= 0.5",
      });

      expect(updateClipMock).toHaveBeenCalledTimes(1);
      expect(updateClipMock).toHaveBeenCalledWith(
        { ids: destId, transforms: "velocity *= 0.5", code: undefined },
        expect.anything(),
      );
      expect(result).toStrictEqual({
        id: destId,
        slot: "0/1",
        noteCount: 4,
        transformed: 2,
      });
    });

    it("joins multiple duplicated clip ids into one updateClip call", async () => {
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
        transforms: "velocity = seq(100, 60)",
      });

      expect(updateClipMock).toHaveBeenCalledWith(
        {
          ids: `${dest1},${dest2}`,
          transforms: "velocity = seq(100, 60)",
          code: undefined,
        },
        expect.anything(),
      );
      expect(result).toStrictEqual([
        { id: dest1, slot: "0/1", noteCount: 3, transformed: 3 },
        { id: dest2, slot: "0/2", noteCount: 3, transformed: 3 },
      ]);
    });

    it("passes the code parameter through to updateClip", async () => {
      registerSessionClipDuplication({ destClipProperties: {} });
      const destId = "live_set/tracks/0/clip_slots/1/clip";

      updateClipMock.mockReturnValueOnce([{ id: destId, noteCount: 8 }]);

      const result = await duplicate({
        type: "clip",
        id: "clip1",
        toSlot: "0/1",
        code: "return notes;",
      });

      expect(updateClipMock).toHaveBeenCalledWith(
        { ids: destId, transforms: undefined, code: "return notes;" },
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
        transforms: "velocity *= 0.5",
      });

      expect(updateClipMock).not.toHaveBeenCalled();
      expect(consoleMock.warn).toHaveBeenCalledWith(
        expect.stringContaining("transforms/code ignored"),
      );
    });
  });

  describe("applyTransformsToDuplicatedClips", () => {
    it("flattens nested arrangement-tiling results and merges stats", async () => {
      const createdObjects: object[] = [
        { trackIndex: 0, clips: [{ id: "a" }, { id: "b" }] },
      ];

      updateClipMock.mockReturnValueOnce([
        { id: "a", noteCount: 1, transformed: 1 },
        { id: "b", noteCount: 2 },
      ]);

      await applyTransformsToDuplicatedClips(
        createdObjects,
        "velocity *= 2",
        undefined,
        {},
      );

      expect(updateClipMock).toHaveBeenCalledWith(
        { ids: "a,b", transforms: "velocity *= 2", code: undefined },
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

    it("is a no-op when there are no clips to transform", async () => {
      await applyTransformsToDuplicatedClips(
        [],
        "velocity *= 2",
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
        "velocity *= 2",
        undefined,
        {},
      );

      expect(createdObjects).toStrictEqual([
        { id: "a", slot: "0/1", noteCount: 5, transformed: 3 },
      ]);
    });
  });
});
