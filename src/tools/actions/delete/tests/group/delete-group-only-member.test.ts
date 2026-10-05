// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { deleteObject } from "../../delete.ts";
import { setUpGroupSet } from "./delete-group-test-helpers.ts";

// Live ignores a delete of the only track in a group track without saying so.
// The target is skipped at its turn, just before the Live call, naming the
// group to delete instead.

describe("deleteObject of the only track in a group track", () => {
  it("skips it and names the group, which takes both", () => {
    const liveSet = setUpGroupSet([
      { id: "g", foldable: true },
      { id: "a", group: "g" },
    ]);

    expect(() => deleteObject({ id: "a", type: "track" })).toThrow(
      "Live won't delete the only track in a group track; delete group track t0 (id g) instead, which deletes both",
    );
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("skips only that target and deletes the rest", () => {
    setUpGroupSet([
      { id: "w" },
      { id: "g", foldable: true },
      { id: "a", group: "g" },
    ]);

    expect(deleteObject({ path: "t2,t0", type: "track" })).toStrictEqual([
      {
        path: "t2",
        ok: false,
        detail:
          "Live won't delete the only track in a group track; delete group track t1 (id g) instead, which deletes both",
      },
      { id: "w", deletedPath: "t0" },
    ]);
  });

  it("goes up to the first group that can be deleted", () => {
    const liveSet = setUpGroupSet([
      { id: "p", foldable: true },
      { id: "g", group: "p", foldable: true },
      { id: "a", group: "g" },
    ]);

    expect(() => deleteObject({ id: "a", type: "track" })).toThrow(
      "delete group track t0 (id p) instead, which deletes the tracks inside it too",
    );
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("covers an only member that is a group itself", () => {
    setUpGroupSet([
      { id: "p", foldable: true },
      { id: "g", group: "p", foldable: true },
      { id: "a", group: "g" },
      { id: "b", group: "g" },
    ]);

    expect(() => deleteObject({ id: "g", type: "track" })).toThrow(
      "delete group track t0 (id p) instead, which deletes the tracks inside it too",
    );
  });

  it("stops at the first group above it with more than one member", () => {
    setUpGroupSet([
      { id: "p", foldable: true },
      { id: "x", group: "p" },
      { id: "g", group: "p", foldable: true },
      { id: "a", group: "g" },
    ]);

    expect(() => deleteObject({ id: "a", type: "track" })).toThrow(
      "delete group track t2 (id g) instead, which deletes both",
    );
  });

  it("leaves the suggestion out when the group holds the Producer Pal device", () => {
    const liveSet = setUpGroupSet(
      [
        { id: "g", foldable: true },
        { id: "a", group: "g" },
      ],
      { host: 0 },
    );

    expect(() => deleteObject({ id: "a", type: "track" })).toThrow(
      "Live won't delete the only track in a group track, and group track t0 (id g) can't be deleted because it holds the Producer Pal device",
    );
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("stops going up at a group that holds the device", () => {
    setUpGroupSet(
      [
        { id: "p", foldable: true },
        { id: "g", group: "p", foldable: true },
        { id: "a", group: "g" },
      ],
      { host: 1 },
    );

    expect(() => deleteObject({ id: "a", type: "track" })).toThrow(
      "group track t1 (id g) can't be deleted because it holds the Producer Pal device",
    );
  });

  it("stops going up at the group that is the host track", () => {
    setUpGroupSet(
      [
        { id: "p", foldable: true },
        { id: "g", group: "p", foldable: true },
        { id: "a", group: "g" },
      ],
      { host: 0 },
    );

    expect(() => deleteObject({ id: "a", type: "track" })).toThrow(
      "group track t0 (id p) can't be deleted because it holds the Producer Pal device",
    );
  });

  it("still refuses the host track before anything else", () => {
    setUpGroupSet(
      [
        { id: "g", foldable: true },
        { id: "a", group: "g" },
      ],
      { host: 1 },
    );

    expect(() => deleteObject({ id: "a", type: "track" })).toThrow(
      "which hosts the Producer Pal device",
    );
  });

  it("deletes a member that has a sibling", () => {
    const liveSet = setUpGroupSet([
      { id: "g", foldable: true },
      { id: "a", group: "g" },
      { id: "b", group: "g" },
    ]);

    expect(deleteObject({ id: "b", type: "track" })).toStrictEqual({
      id: "b",
      deletedPath: "t2",
    });
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 2);
  });

  it("doesn't walk the track list for a group that isn't a regular track", () => {
    const liveSet = setUpGroupSet([{ id: "a", group: "odd" }]);

    registerMockObject("odd", { path: String(livePath.returnTrack(0)) });

    expect(() => deleteObject({ id: "a", type: "track" })).toThrow(
      "delete group track rt0 (id odd) instead, which deletes both",
    );
    expect(liveSet.call).not.toHaveBeenCalled();
  });
});
