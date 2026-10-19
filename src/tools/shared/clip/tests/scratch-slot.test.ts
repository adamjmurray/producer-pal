// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { changedNothing } from "#src/shared/max/v8-warning-capture.ts";
import { withScratchSlot } from "#src/tools/shared/clip/scratch-slot.ts";
import { provedUnchangedRequest } from "#src/tools/shared/write-pipeline/tests/proved-unchanged-request.ts";
import { registerTrackSlots } from "./track-slots-test-helpers.ts";

describe("withScratchSlot", () => {
  it("hands out an empty slot other than the destination", () => {
    const liveSet = registerTrackSlots([0, 1, 0]);
    const path = withScratchSlot(0, 0, (scratch) => scratch.path);

    expect(path).toBe("t0/s2");
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("appends a temp scene when no slot is free, and deletes it even on a throw", () => {
    const liveSet = registerTrackSlots([1, 1]);

    expect(() =>
      withScratchSlot(0, 0, (scratch) => {
        throw new Error(`failed in ${scratch.path}`);
      }),
    ).toThrow("failed in t0/s2");
    expect(liveSet.call).toHaveBeenCalledWith("create_scene", -1);
    expect(liveSet.call).toHaveBeenCalledWith("delete_scene", 2);
  });

  it("changed nothing when the temp scene goes", () => {
    registerTrackSlots([1, 1]);

    const capture = provedUnchangedRequest();

    withScratchSlot(0, 0, () => 0);
    expect(changedNothing(capture)).toBe(true);
  });

  it("may have changed something when the temp scene stays", () => {
    registerTrackSlots([1, 1]).methods.delete_scene = () => {
      throw new Error("Live says no");
    };

    const capture = provedUnchangedRequest();

    expect(() => withScratchSlot(0, 0, () => 0)).toThrow("Live says no");
    expect(changedNothing(capture)).toBe(false);
  });
});
