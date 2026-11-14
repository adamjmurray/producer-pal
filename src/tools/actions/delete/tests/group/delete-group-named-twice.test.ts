// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import { deleteObject } from "../../delete.ts";
import { PAIR, setUpGroupSet } from "./delete-group-test-helpers.ts";

// A group track named twice is walked once; the call deletes it once and says
// what went with it.

describe("deleteObject of a group track named twice", () => {
  it("deletes it once and lists the tracks that went with it", () => {
    const liveSet = setUpGroupSet(PAIR);

    expect(deleteObject({ id: "g,g", type: "track" })).toStrictEqual([
      { id: "g", detail: "named again as id g later in this call" },
      {
        id: "g",
        deletedPath: "t0",
        detail:
          "also deleted the 2 tracks inside this group track: t1 (id a), t2 (id b)",
      },
    ]);
    expect(liveSet.call).toHaveBeenCalledTimes(1);
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 0);
  });
});
