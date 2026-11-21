// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import { simulateMockDeletes } from "#src/test/mocks/mock-registry.ts";
import { deleteObject } from "../../delete.ts";
import { setUpTracks } from "../delete-test-helpers.ts";

describe("deleteObject: a skip whose path another delete moved", () => {
  beforeEach(() => {
    simulateMockDeletes();
    // Live refuses to delete the track at t2.
    setUpTracks(4, (index) => {
      if (index === 2) {
        throw new Error("Live could not do that");
      }
    });
  });

  it("says where the track that wasn't deleted sits now", () => {
    // t2 is refused, then t0 goes, and track_2 slides down to t1.
    expect(deleteObject({ path: "t0,t2", type: "track" })).toStrictEqual([
      { id: "track_0", deletedPath: "t0" },
      {
        path: "t2",
        ok: false,
        detail: "Live could not do that; that track is now t1 (id track_2)",
      },
    ]);
  });

  it("leaves the skip alone when nothing before it moved", () => {
    // t2 is refused and the only other delete is above it.
    expect(deleteObject({ path: "t2,t3", type: "track" })).toStrictEqual([
      { path: "t2", ok: false, detail: "Live could not do that" },
      { id: "track_3", deletedPath: "t3" },
    ]);
  });

  it("leaves a skip named by id alone", () => {
    expect(
      deleteObject({ id: "track_2", path: "t0", type: "track" }),
    ).toStrictEqual([
      { id: "track_2", ok: false, detail: "Live could not do that" },
      { id: "track_0", deletedPath: "t0" },
    ]);
  });
});
