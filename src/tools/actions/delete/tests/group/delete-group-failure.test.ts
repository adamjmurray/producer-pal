// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import { deleteObject } from "../../delete.ts";
import { setUpGroupSet } from "./delete-group-test-helpers.ts";

// A track named with its group goes with the group. When the group's delete
// doesn't happen, that track gets its own, and its entry says what is true.

describe("deleteObject of a group track and a track inside it", () => {
  it("deletes the inner track itself when the group is refused", () => {
    const liveSet = setUpGroupSet(
      [
        { id: "g", foldable: true },
        { id: "a", group: "g" },
        { id: "b", group: "g" },
        { id: "host", group: "g" },
      ],
      { host: 3 },
    );

    expect(deleteObject({ id: "g, a", type: "track" })).toStrictEqual([
      {
        id: "g",
        ok: false,
        detail:
          "cannot delete group track t0 (id g), which contains the Producer Pal device",
      },
      { id: "a", deletedPath: "t1" },
    ]);
    expect(liveSet.call).toHaveBeenCalledTimes(1);
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  it("refuses the host track on its own turn", () => {
    setUpGroupSet(
      [
        { id: "g", foldable: true },
        { id: "a", group: "g" },
        { id: "host", group: "g" },
      ],
      { host: 2 },
    );

    expect(deleteObject({ id: "g, host", type: "track" })).toStrictEqual([
      {
        id: "g",
        ok: false,
        detail:
          "cannot delete group track t0 (id g), which contains the Producer Pal device",
      },
      {
        id: "host",
        ok: false,
        detail:
          "cannot delete track t2 (id host), which hosts the Producer Pal device",
      },
    ]);
  });

  it("falls back to the only-member rule for an inner track when the group is skipped", () => {
    // g is alone in p, so it can't be deleted; a is one of two in g.
    const liveSet = setUpGroupSet([
      { id: "p", foldable: true },
      { id: "g", group: "p", foldable: true },
      { id: "a", group: "g" },
      { id: "b", group: "g" },
    ]);

    expect(deleteObject({ id: "g, a", type: "track" })).toStrictEqual([
      {
        id: "g",
        ok: false,
        detail:
          "Live won't delete the only track in a group track; delete group track t0 (id p) instead, which deletes the tracks inside it too",
      },
      { id: "a", deletedPath: "t2" },
    ]);
    expect(liveSet.call).toHaveBeenCalledTimes(1);
  });

  it("does not call an inner track deleted when its group is still there", () => {
    // g is alone in p, and a alone in g: neither can go, and neither is lost.
    const liveSet = setUpGroupSet([
      { id: "p", foldable: true },
      { id: "g", group: "p", foldable: true },
      { id: "a", group: "g" },
    ]);

    expect(deleteObject({ id: "g, a", type: "track" })).toStrictEqual([
      {
        id: "g",
        ok: false,
        detail: expect.stringContaining("delete group track t0 (id p) instead"),
      },
      {
        id: "a",
        ok: false,
        detail: expect.stringContaining("delete group track t0 (id p) instead"),
      },
    ]);
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("keeps the group's entry and reports the inner track as deleted when Live threw after deleting", () => {
    const liveSet = setUpGroupSet(
      [
        { id: "g", foldable: true },
        { id: "a", group: "g" },
        { id: "b", group: "g" },
      ],
      {
        afterDelete: () => {
          throw new Error("Live lost its place");
        },
      },
    );

    expect(deleteObject({ id: "a, g", type: "track" })).toStrictEqual([
      { id: "a", deletedPath: "t1" },
      {
        id: "g",
        deletedPath: "t0",
        detail:
          "Live lost its place; already changed: deleted the track, also deleted the track inside this group track: t2 (id b)",
      },
    ]);
    expect(liveSet.call).toHaveBeenCalledTimes(1);
  });

  it("says a plain track is gone when Live threw after deleting it", () => {
    setUpGroupSet([{ id: "z" }, { id: "y" }], {
      afterDelete: () => {
        throw new Error("Live lost its place");
      },
    });

    expect(deleteObject({ id: "z, y", type: "track" })).toStrictEqual([
      {
        id: "z",
        deletedPath: "t0",
        detail: "Live lost its place; already changed: deleted the track",
      },
      {
        id: "y",
        deletedPath: "t1",
        detail: "Live lost its place; already changed: deleted the track",
      },
    ]);
  });

  it("skips a group Live threw on before deleting, and its inner track is deleted on its own", () => {
    setUpGroupSet(
      [
        { id: "g", foldable: true },
        { id: "a", group: "g" },
        { id: "b", group: "g" },
      ],
      {
        onDelete: (index) => {
          if (index === 0) {
            throw new Error("Live said no");
          }
        },
      },
    );

    expect(deleteObject({ id: "g, a", type: "track" })).toStrictEqual([
      { id: "g", ok: false, detail: "Live said no" },
      { id: "a", deletedPath: "t1" },
    ]);
  });

  it("deletes a covered group before the track inside it", () => {
    // P is refused for the host. g2 is then deleted on its own, and m with it.
    // Lowest first is what lets g2 go before m, which Live won't delete alone.
    const liveSet = setUpGroupSet(
      [
        { id: "P", foldable: true },
        { id: "x", group: "P" },
        { id: "g2", group: "P", foldable: true },
        { id: "m", group: "g2" },
        { id: "host", group: "P" },
      ],
      { host: 4 },
    );

    expect(deleteObject({ id: "P, g2, m", type: "track" })).toStrictEqual([
      {
        id: "P",
        ok: false,
        detail:
          "cannot delete group track t0 (id P), which contains the Producer Pal device",
      },
      { id: "g2", deletedPath: "t2" },
      { id: "m", deletedPath: "t3" },
    ]);
    expect(liveSet.call).toHaveBeenCalledTimes(1);
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 2);
  });
});
