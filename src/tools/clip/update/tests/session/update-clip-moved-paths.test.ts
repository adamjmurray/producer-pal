// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A skip entry repeats the caller's path. When an earlier clip's write moved
// things (a conversion adds a track, shifting the ones after it), that path can
// name another clip by the end of the call, so the entry says where its own
// clip went.

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

describe("updateClip - a skip whose path an earlier clip's write moved", () => {
  let mocks: UpdateClipMocks;

  /** Slide clip 456 one track down, and leave another clip in its place. */
  function slideClip456Down(): void {
    registerMockObject("456", {
      path: livePath.track(2).clipSlot(1).clip(),
    });
    registerMockObject("777", {
      path: livePath.track(1).clipSlot(1).clip(),
      methods: mocks.clip456.methods,
    });
  }

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);
    // Clip 456 is refused.
    mocks.clip456.set.mockImplementation(() => {
      throw new Error("Live refused");
    });
  });

  it("says where the clip that wasn't updated sits now", async () => {
    mocks.clip123.set.mockImplementation(slideClip456Down);

    expect(await updateClip({ path: "t0/s0,t1/s1", name: "A" })).toStrictEqual([
      { id: "123", path: "t0/s0" },
      {
        path: "t1/s1",
        ok: false,
        detail: "Live refused; that clip is now t2/s1 (id 456)",
      },
    ]);
  });

  it("leaves the skip alone when nothing moved", async () => {
    expect(await updateClip({ path: "t0/s0,t1/s1", name: "A" })).toStrictEqual([
      { id: "123", path: "t0/s0" },
      { path: "t1/s1", ok: false, detail: "Live refused" },
    ]);
  });

  it("says a path that named no clip now names one", async () => {
    mockNonExistentObjects();
    setupMidiClipMock(mocks.clip123);
    // Clip 456 is at t1/s1 only once the first write has put it there.
    registerMockObject("456", { path: "live_set tracks 5 clip_slots 5 clip" });
    mocks.clip123.set.mockImplementation(() => {
      registerMockObject("456", { path: livePath.track(1).clipSlot(1).clip() });
    });

    expect(await updateClip({ path: "t0/s0,t1/s1", name: "A" })).toStrictEqual([
      { id: "123", path: "t0/s0" },
      {
        path: "t1/s1",
        ok: false,
        detail:
          'no clip at path "t1/s1"; nothing was there when the call began',
      },
    ]);
  });
});
