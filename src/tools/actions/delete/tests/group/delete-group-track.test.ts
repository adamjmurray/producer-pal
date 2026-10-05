// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import { resolves } from "#src/live-api-adapter/tests/objects/build-budget-resolves.ts";
import { deleteObject } from "../../delete.ts";
import { type GroupTrack, setUpGroupSet } from "./delete-group-test-helpers.ts";

// Live deletes a group track together with every track inside it. The group's
// entry says what else went; a track the call named too gets its own plain one.

// t0 holds a and nested group h (b, c); t5 stands alone.
const NESTED: GroupTrack[] = [
  { id: "g", foldable: true },
  { id: "a", group: "g" },
  { id: "h", group: "g", foldable: true },
  { id: "b", group: "h" },
  { id: "c", group: "h" },
  { id: "z" },
];

// t0 holds a and b.
const PAIR: GroupTrack[] = [
  { id: "g", foldable: true },
  { id: "a", group: "g" },
  { id: "b", group: "g" },
];

describe("deleteObject of a group track", () => {
  it("lists every track that went with it, nested ones too", () => {
    const liveSet = setUpGroupSet(NESTED);

    expect(deleteObject({ id: "g", type: "track" })).toStrictEqual({
      id: "g",
      deletedPath: "t0",
      detail:
        "also deleted the 4 tracks inside this group track: t1 (id a), t2 (id h), t3 (id b), t4 (id c)",
    });
    expect(liveSet.call).toHaveBeenCalledTimes(1);
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 0);
  });

  it("lists a lone track in the singular", () => {
    setUpGroupSet([
      { id: "g", foldable: true },
      { id: "a", group: "g" },
      { id: "b", group: "g" },
    ]);

    expect(deleteObject({ id: "g, a", type: "track" })).toStrictEqual([
      {
        id: "g",
        deletedPath: "t0",
        detail: "also deleted the track inside this group track: t2 (id b)",
      },
      { id: "a", deletedPath: "t1" },
    ]);
  });

  it("names the group by path as well", () => {
    setUpGroupSet(PAIR);

    expect(deleteObject({ path: "t0", type: "track" })).toStrictEqual({
      id: "g",
      deletedPath: "t0",
      detail:
        "also deleted the 2 tracks inside this group track: t1 (id a), t2 (id b)",
    });
  });

  it("leaves the detail off when every track inside was named", () => {
    const liveSet = setUpGroupSet(PAIR);

    expect(deleteObject({ id: "b, g, a", type: "track" })).toStrictEqual([
      { id: "b", deletedPath: "t2" },
      { id: "g", deletedPath: "t0" },
      { id: "a", deletedPath: "t1" },
    ]);
    expect(liveSet.call).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["ids, member first", { id: "a,g" }],
    ["ids, group first", { id: "g,a" }],
    ["paths", { path: "t1,t0" }],
    ["an id and a path", { id: "g", path: "t1" }],
    ["a path and an id", { id: "a", path: "t0" }],
  ])("deletes a group and its only member once, named by %s", (_name, args) => {
    const liveSet = setUpGroupSet([
      { id: "g", foldable: true },
      { id: "a", group: "g" },
    ]);

    const result = deleteObject({ type: "track", ...args });

    expect(result).toStrictEqual(
      expect.arrayContaining([{ id: "a", deletedPath: "t1" }]),
    );
    expect(result).toStrictEqual(
      expect.arrayContaining([{ id: "g", deletedPath: "t0" }]),
    );
    expect(liveSet.call).toHaveBeenCalledTimes(1);
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 0);
  });

  it("treats a track deeper down as named too", () => {
    const liveSet = setUpGroupSet(NESTED);

    expect(deleteObject({ id: "c, g", type: "track" })).toStrictEqual([
      { id: "c", deletedPath: "t4" },
      {
        id: "g",
        deletedPath: "t0",
        detail:
          "also deleted the 3 tracks inside this group track: t1 (id a), t2 (id h), t3 (id b)",
      },
    ]);
    expect(liveSet.call).toHaveBeenCalledTimes(1);
  });

  it("deletes a nested group and the group around it in one go", () => {
    const liveSet = setUpGroupSet(NESTED);

    expect(deleteObject({ id: "h, g, z", type: "track" })).toStrictEqual([
      { id: "h", deletedPath: "t2" },
      {
        id: "g",
        deletedPath: "t0",
        detail:
          "also deleted the 3 tracks inside this group track: t1 (id a), t3 (id b), t4 (id c)",
      },
      { id: "z", deletedPath: "t5" },
    ]);
    expect(liveSet.call).toHaveBeenCalledTimes(2);
    expect(liveSet.call).toHaveBeenNthCalledWith(1, "delete_track", 5);
    expect(liveSet.call).toHaveBeenNthCalledWith(2, "delete_track", 0);
  });

  it("deletes a member of a group with others like any track", () => {
    setUpGroupSet(PAIR);

    expect(deleteObject({ id: "a", type: "track" })).toStrictEqual({
      id: "a",
      deletedPath: "t1",
    });
  });

  it("reads each track inside a group once, and one past the end", () => {
    setUpGroupSet(NESTED);
    deleteObject({ id: "g", type: "track" });

    // Four inside, and the track after them that ends the walk.
    expect(resolves("live_set tracks *")).toBe(5);
  });
});
