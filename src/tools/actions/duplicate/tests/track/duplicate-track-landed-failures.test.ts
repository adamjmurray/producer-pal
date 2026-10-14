// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  type RegisteredMockObject,
  registerTrackCopySet,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import {
  LIVE_FAILURE,
  failOnSet,
  hookCalls,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";

describe("duplicate - a track copy that landed before Live failed", () => {
  // The copy is in the Set, so a throw out of the call that made it must not
  // make its entry a skip, nor stop the copies after it.
  it("keeps a copy Live made even when the call that made it threw", async () => {
    const { liveSet } = registerTrackCopySet(["track1"]);
    const copyTrack = liveSet.methods.duplicate_track!;

    liveSet.methods.duplicate_track = (...args: unknown[]) => {
      copyTrack(...args);

      throw new Error("Live reported an error");
    };

    const result = await duplicate({ type: "track", id: "track1", count: 2 });

    expect(result).toStrictEqual([
      {
        id: "copy-2",
        path: "t1",
        clips: [],
        detail: "the track was made, but Live said: Live reported an error",
      },
      {
        id: "copy-1",
        path: "t2",
        clips: [],
        detail: "the track was made, but Live said: Live reported an error",
      },
    ]);
  });

  it("keeps a copy whose name won't take, and still makes the others", async () => {
    const { liveSet, tracks } = registerTrackCopySet(["track1"]);

    // The first copy made takes the last name; it lands, but won't be named.
    hookCalls(liveSet, /^duplicate_track$/, {
      after: (nth) => {
        if (nth === 1) {
          failOnSet(tracks.get("copy-1") as RegisteredMockObject, "name");
        }
      },
    });

    const result = await duplicate({
      type: "track",
      id: "track1",
      count: 2,
      name: "A,B",
    });

    expect(result).toStrictEqual([
      { id: "copy-2", path: "t1", clips: [] },
      {
        id: "copy-1",
        path: "t2",
        clips: [],
        detail: `the track was made, but naming or coloring it didn't finish: ${LIVE_FAILURE}`,
      },
    ]);
    expect(tracks.get("copy-2")?.set).toHaveBeenCalledWith("name", "A");
  });
});
