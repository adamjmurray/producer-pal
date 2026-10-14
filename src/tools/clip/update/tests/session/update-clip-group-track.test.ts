// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateClip } from "../../update-clip.ts";

const GROUP_REASON = "track t0 (id group) is a group track; it holds no clips";

describe("updateClip of a group track's slot", () => {
  beforeEach(() => {
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
    mockNonExistentObjects();
  });

  it("throws that the track is a group when it is the only target", async () => {
    await expect(updateClip({ path: "t0/s0", name: "A" })).rejects.toThrow(
      GROUP_REASON,
    );
  });

  it("skips only that target, keeping its place", async () => {
    expect(await updateClip({ path: "t0/s0,t1/s0", name: "A" })).toStrictEqual([
      { path: "t0/s0", ok: false, detail: GROUP_REASON },
      { path: "t1/s0", ok: false, detail: 'no clip at path "t1/s0"' },
    ]);
  });
});
