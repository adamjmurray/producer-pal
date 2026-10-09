// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import { setupTrackMocks } from "./delete-test-helpers.ts";
import { deleteObject } from "../delete.ts";

// A path that can't be parsed was written wrong and refuses the call. One that
// parses but names the wrong kind of thing skips only its own target, and one
// that names an empty place needs no work at all.
describe("deleteObject by the kind of thing a target names", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    simulateMockDeletes();
    liveSet = registerMockObject("live_set", { path: livePath.liveSet });
    setupTrackMocks({
      track_0: String(livePath.track(0)),
      track_1: String(livePath.track(1)),
    });
  });

  it("refuses the whole call for a path it can't parse", () => {
    expect(() =>
      deleteObject({ path: "t0,not-a-path,t1", type: "track" }),
    ).toThrow(/invalid path/);
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("skips a path naming the wrong kind of thing and deletes the rest", () => {
    mockNonExistentObjects();

    expect(deleteObject({ path: "t0/s0,t1,t99", type: "track" })).toStrictEqual(
      [
        {
          path: "t0/s0",
          ok: false,
          detail: expect.stringContaining("not a track"),
        },
        { id: "track_1", deletedPath: "t1" },
        { path: "t99", detail: "nothing to delete" },
      ],
    );
  });

  it("throws for a lone path naming the wrong kind of thing", () => {
    expect(() => deleteObject({ path: "t0/s0", type: "track" })).toThrow(
      "not a track",
    );
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("is satisfied by a lone path naming nothing", () => {
    mockNonExistentObjects();

    expect(deleteObject({ path: "t99", type: "track" })).toStrictEqual({
      path: "t99",
      detail: "nothing to delete",
    });
    expect(liveSet.call).not.toHaveBeenCalled();
  });
});
