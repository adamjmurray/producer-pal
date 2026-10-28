// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import {
  GROUP_REASON,
  registerGroupBesideTrack,
} from "#src/tools/shared/clip/tests/group-track-test-helpers.ts";
import { updateClip } from "../../update-clip.ts";

describe("updateClip of a group track's slot", () => {
  beforeEach(registerGroupBesideTrack);

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
