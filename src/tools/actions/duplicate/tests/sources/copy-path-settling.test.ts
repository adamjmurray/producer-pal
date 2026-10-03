// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { settleCopyPaths } from "#src/tools/actions/duplicate/helpers/sources/copy-path-settling.ts";

describe("settleCopyPaths", () => {
  it("moves a track copy's clips along with it", () => {
    registerMockObject("copy", { path: livePath.track(3) });

    const entries = [
      {
        id: "copy",
        path: "t1",
        clips: [
          { id: "c1", path: "t1/s0" },
          { id: "c2", path: "t1[5|1]" },
          { id: "c3" },
        ],
      },
    ];

    settleCopyPaths(entries, "track");

    expect(entries).toStrictEqual([
      {
        id: "copy",
        path: "t3",
        clips: [
          { id: "c1", path: "t3/s0" },
          { id: "c2", path: "t3[5|1]" },
          { id: "c3" },
        ],
      },
    ]);
  });

  it("moves a scene copy's clips along with it", () => {
    registerMockObject("copy", { path: livePath.scene(4) });

    const entries = [
      { id: "copy", path: "s2", clips: [{ id: "c1", path: "t0/s2" }] },
    ];

    settleCopyPaths(entries, "scene");

    expect(entries).toStrictEqual([
      { id: "copy", path: "s4", clips: [{ id: "c1", path: "t0/s4" }] },
    ]);
  });

  it("leaves a copy that can't be found where it was", () => {
    mockNonExistentObjects();

    const entries = [
      { id: "gone", path: "t1", clips: [{ id: "c", path: "t1/s0" }] },
    ];

    settleCopyPaths(entries, "track");

    expect(entries).toStrictEqual([
      { id: "gone", path: "t1", clips: [{ id: "c", path: "t1/s0" }] },
    ]);
  });
});
