// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { registerTrackCopySet } from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";

describe("duplicate - a skip whose source path another copy moved", () => {
  it("says where a source that wasn't copied sits now", async () => {
    // The copy of t0 lands at t1, so track2 slides to t2 before its own copy
    // is attempted (and fails).
    registerTrackCopySet(["track1", "track2"], undefined, [2]);

    const result = await duplicate({ type: "track", path: "t0,t1" });

    expect(result).toStrictEqual([
      expect.objectContaining({ id: "copy-1", path: "t1" }),
      {
        path: "t1",
        ok: false,
        detail: "Live made no copy of t2; that track is now t2 (id track2)",
      },
    ]);
  });

  it("says a source path that named nothing now names something", async () => {
    // t2 is past the end until the copy of t0 is made.
    mockNonExistentObjects();
    registerTrackCopySet(["track1", "track2"]);

    const result = await duplicate({ type: "track", path: "t0,t2" });

    expect(result).toStrictEqual([
      expect.objectContaining({ id: "copy-1", path: "t1" }),
      {
        path: "t2",
        ok: false,
        detail:
          'no track at path "t2"; ppal-create-track adds tracks; nothing was there when the call began',
      },
    ]);
  });

  it("leaves the skip alone when no copy moved its source", async () => {
    // t0 is refused, and the copy of t1 lands after it.
    registerTrackCopySet(["track1", "track2"], undefined, [1]);

    const result = await duplicate({ type: "track", path: "t0,t1" });

    expect(result).toStrictEqual([
      { path: "t0", ok: false, detail: "Live made no copy of t0" },
      expect.objectContaining({ id: "copy-1", path: "t2" }),
    ]);
  });
});
