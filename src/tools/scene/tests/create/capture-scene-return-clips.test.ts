// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A capture lists whatever clips the new scene holds, return tracks included.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  putClipsInScene,
  registerSceneWorld,
} from "#src/tools/shared/clip/slot-contents/tests/scene-world-test-helpers.ts";
import { captureScene } from "../../capture-scene.ts";
import { captureAddsScene } from "./capture-scene-mocks.ts";

/**
 * A two-scene Set with scene 1 selected, whose capture makes scene 2 holding
 * the full scene's clips.
 * @param liveVersion - The version Live reports
 * @returns What the world says about return-slot reads
 */
function setupCapture(liveVersion: string): {
  returnSlotReads: () => unknown[];
} {
  const world = registerSceneWorld(liveVersion, 2);

  captureAddsScene(world.liveSet);
  registerMockObject("live_set/view/selected_scene", {
    path: livePath.scene(1),
  });
  registerMockObject("captured", { path: livePath.scene(2), type: "Scene" });
  putClipsInScene(2, "cap-");

  return world;
}

describe("captureScene - return-track clips", () => {
  it("lists the new scene's regular and return-track clips", () => {
    setupCapture("13.0");

    expect(captureScene().clips).toStrictEqual([
      { id: "cap-t0/s2", path: "t0/s2" },
      { id: "cap-rt0/s2", path: "rt0/s2" },
      { id: "cap-rt1/s2", path: "rt1/s2" },
    ]);
  });

  it("lists only the regular tracks' clips on Live 12, asking no return slot", () => {
    const world = setupCapture("12.4.15");

    expect(captureScene().clips).toStrictEqual([
      { id: "cap-t0/s2", path: "t0/s2" },
    ]);
    expect(world.returnSlotReads()).toStrictEqual([]);
  });
});
