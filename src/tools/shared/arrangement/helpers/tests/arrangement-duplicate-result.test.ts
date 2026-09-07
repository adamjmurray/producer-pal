// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { clipFromDuplicateResult } from "../arrangement-duplicate-result.ts";

describe("clipFromDuplicateResult", () => {
  it("returns the clip Live copied", () => {
    registerMockObject("549", {
      path: livePath.track(0).arrangementClip(0),
    });

    const clip = clipFromDuplicateResult(["id", 549]);

    expect(clip.exists()).toBe(true);
    expect(clip.id).toBe("549");
  });

  it("reads a refusal as no clip, not as the Song", () => {
    // Live returns a bare 1 when it refuses the copy. "id 1" is the Song, so
    // wrapping the raw value hands back an object that exists and flows on as
    // the new clip.
    registerMockObject("1", { path: livePath.liveSet });

    expect(clipFromDuplicateResult(1).exists()).toBe(false);
  });

  it("reads an empty id as no clip", () => {
    expect(clipFromDuplicateResult(["id", 0]).exists()).toBe(false);
    expect(clipFromDuplicateResult("").exists()).toBe(false);
  });

  it("lets an id string through", () => {
    registerMockObject("888", {
      path: livePath.track(0).arrangementClip(1),
    });

    expect(clipFromDuplicateResult("id 888").id).toBe("888");
  });
});
