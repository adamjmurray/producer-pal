// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A group track's slot holds no clip to copy, and says so rather than "no clip".

import { describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { resolveSlotCopySource } from "#src/tools/actions/duplicate/helpers/clip/duplicate-clip-slot.ts";

const GROUP_REASON = "track t0 (id group) is a group track; it holds no clips";

/**
 * A group track with an empty slot in scene 0, and an ordinary one beside it.
 */
function registerGroupAndTrack(): void {
  registerMockObject("group", {
    path: livePath.track(0),
    type: "Track",
    properties: { is_foldable: 1 },
  });
  registerMockObject("midi", {
    path: livePath.track(1),
    type: "Track",
    properties: { is_foldable: 0 },
  });
  registerMockObject("group-slot", {
    path: livePath.track(0).clipSlot(0),
    properties: { has_clip: 0 },
  });
  mockNonExistentObjects();
}

describe("duplicate of a group track's slot", () => {
  it("refuses a source path in a group track with that reason", async () => {
    registerGroupAndTrack();

    await expect(
      duplicate({ type: "clip", path: "t0/s0", toPath: "t2/s0" }),
    ).rejects.toThrow(GROUP_REASON);
  });

  it("reads the same reason when the slot is resolved for copying", () => {
    registerGroupAndTrack();

    expect(() => resolveSlotCopySource(0, 0)).toThrow(GROUP_REASON);
  });
});
