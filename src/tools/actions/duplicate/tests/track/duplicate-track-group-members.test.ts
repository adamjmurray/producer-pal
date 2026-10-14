// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { registerTrackCopySet } from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

// Live copies a group together with every track inside it, so the group's
// entry says which tracks those are, by where they are after the call.

describe("duplicate - the tracks copied inside a group track", () => {
  it("lists the one track inside the group, in the singular", async () => {
    registerTrackCopySet(["group", "member", "other"], {
      index: 0,
      members: 1,
    });

    expect(await duplicate({ type: "track", id: "group" })).toStrictEqual({
      id: "copy-1",
      path: "t2",
      clips: [],
      detail:
        "also copied the track inside this group track: t3 (id copy-1-m1)",
    });
  });

  it("lists several tracks in track order", async () => {
    registerTrackCopySet(["group", "m1", "m2", "after"], {
      index: 0,
      members: 2,
    });

    expect(await duplicate({ type: "track", path: "t0" })).toStrictEqual({
      id: "copy-1",
      path: "t3",
      clips: [],
      detail:
        "also copied the 2 tracks inside this group track: t4 (id copy-1-m1), t5 (id copy-1-m2)",
    });
  });

  it("lists the tracks of a group inside the group too", async () => {
    // t0 holds a, group h (b, c) and d.
    registerTrackCopySet(["group", "a", "h", "b", "c", "d", "after"], {
      index: 0,
      members: 5,
      inner: { offset: 2, members: 2 },
    });

    const result = await duplicate({ type: "track", id: "group" });

    expect(result).toStrictEqual({
      id: "copy-1",
      path: "t6",
      clips: [],
      detail:
        "also copied the 5 tracks inside this group track: t7 (id copy-1-m1), t8 (id copy-1-m2), t9 (id copy-1-m3), t10 (id copy-1-m4), t11 (id copy-1-m5)",
    });
  });

  it("gives each of several copies its own tracks, as they are after the last copy", async () => {
    registerTrackCopySet(["group", "m1", "m2"], { index: 0, members: 2 });

    expect(
      await duplicate({ type: "track", id: "group", count: 2 }),
    ).toStrictEqual([
      {
        id: "copy-2",
        path: "t3",
        clips: [],
        detail:
          "also copied the 2 tracks inside this group track: t4 (id copy-2-m1), t5 (id copy-2-m2)",
      },
      {
        id: "copy-1",
        path: "t6",
        clips: [],
        detail:
          "also copied the 2 tracks inside this group track: t7 (id copy-1-m1), t8 (id copy-1-m2)",
      },
    ]);
  });

  it("lists only the group's copy when the call also names a plain track", async () => {
    registerTrackCopySet(["group", "member", "other"], {
      index: 0,
      members: 1,
    });

    expect(await duplicate({ type: "track", id: "group,other" })).toStrictEqual(
      [
        {
          id: "copy-1",
          path: "t2",
          clips: [],
          detail:
            "also copied the track inside this group track: t3 (id copy-1-m1)",
        },
        { id: "copy-2", path: "t5", clips: [] },
      ],
    );
  });

  it("lists the group's copy when a plain track is named before it", async () => {
    registerTrackCopySet(["group", "member", "other"], {
      index: 0,
      members: 1,
    });

    expect(await duplicate({ type: "track", id: "other,group" })).toStrictEqual(
      [
        { id: "copy-1", path: "t5", clips: [] },
        {
          id: "copy-2",
          path: "t2",
          clips: [],
          detail:
            "also copied the track inside this group track: t3 (id copy-2-m1)",
        },
      ],
    );
  });

  it("gives each copy of a group named twice its own list", async () => {
    registerTrackCopySet(["group", "member"], { index: 0, members: 1 });

    expect(await duplicate({ type: "track", id: "group,group" })).toStrictEqual(
      [
        {
          id: "copy-2",
          path: "t2",
          clips: [],
          detail:
            "also copied the track inside this group track: t3 (id copy-2-m1)",
        },
        {
          id: "copy-1",
          path: "t4",
          clips: [],
          detail:
            "also copied the track inside this group track: t5 (id copy-1-m1)",
        },
      ],
    );
  });

  it("says nothing for a track that isn't a group", async () => {
    const { tracks } = registerTrackCopySet(["track1"]);

    expect(
      await duplicate({ type: "track", id: "track1", count: 2 }),
    ).toStrictEqual([
      { id: "copy-2", path: "t1", clips: [] },
      { id: "copy-1", path: "t2", clips: [] },
    ]);
    // Only the source is asked whether it is a group, not each copy.
    expect(tracks.get("track1")?.get).toHaveBeenCalledWith("is_foldable");
    expect(tracks.get("copy-1")?.get).not.toHaveBeenCalledWith("is_foldable");
    expect(tracks.get("copy-2")?.get).not.toHaveBeenCalledWith("is_foldable");
  });

  it("keeps the list on a copy Live made before it threw", async () => {
    const { liveSet } = registerTrackCopySet(["group", "member", "other"], {
      index: 0,
      members: 1,
    });
    const copyTrack = liveSet.methods.duplicate_track!;

    liveSet.methods.duplicate_track = (...args: unknown[]) => {
      copyTrack(...args);

      throw new Error("Live reported an error");
    };

    expect(await duplicate({ type: "track", id: "group" })).toStrictEqual({
      id: "copy-1",
      path: "t2",
      clips: [],
      detail:
        "the track was made, but Live said: Live reported an error; also copied the track inside this group track: t3 (id copy-1-m1)",
    });
  });
});
