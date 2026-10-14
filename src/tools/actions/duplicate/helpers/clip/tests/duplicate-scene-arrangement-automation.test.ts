// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A scene copy lengthens or shortens its clips the way a clip copy does, so it
// writes their automation lanes the same way.

import { describe, expect, it } from "vitest";
import "../../../tests/duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { shownByStamps } from "./stamp-automation-test-helpers.ts";
import { registerStampWorld } from "./stamp-world-test-helpers.ts";

describe("duplicate - a scene with automated clips, at another length", () => {
  it("stamps a scene's clip too, since the scene copy lengthens or shortens it the same way", async () => {
    const world = registerStampWorld({ existing: [{ start: 16, end: 20 }] });
    const result = await duplicate({
      type: "scene",
      id: "world_scene_0",
      arrangementStart: "5|1",
      arrangementLength: "2bar",
    });

    expect(shownByStamps(world.stamps())).toStrictEqual([
      [0, 4, 0],
      [0, 4, 4],
    ]);
    expect(JSON.stringify(result)).toContain("overwrote the clip at");
  });
});
