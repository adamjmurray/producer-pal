// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A move whose destination made chains and was then refused leaves them behind
// empty, so whatever words the refusal has to name them. This is the shared
// move every toPath user goes through.

import { beforeEach, describe, expect, it } from "vitest";
import { moveDeviceToPath } from "../../helpers/move-device.ts";
import {
  registerGrowingRack,
  registerMoveSourceAndRackTrack,
} from "../../../tests/helpers/growing-rack-fixtures.ts";
import {
  livePath,
  mockNonExistentObjects,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";

/**
 * Register a rack on track 1 that appends a chain per insert_chain, and a
 * live_set whose move_device does nothing: Live dropping the move.
 * @param existing - How many chains the rack starts with
 */
function registerRackAndDroppedMoves(existing: number): void {
  registerGrowingRack({ track: 1, existing });
  registerMockObject("live-set", {
    path: livePath.liveSet,
    methods: { move_device: () => null },
  });
}

/**
 * Move a device that sits on track 0 to a path, the way update-device does.
 * @param toPath - Where to move it
 * @returns What the move came to
 */
function moveToPath(toPath: string): ReturnType<typeof moveDeviceToPath> {
  registerMockObject("moving", {
    path: livePath.track(0).device(0),
    type: "Device",
  });

  return moveDeviceToPath(LiveAPI.from("moving"), toPath, null, toPath);
}

describe("a move refused after its toPath made chains", () => {
  beforeEach(() => {
    mockNonExistentObjects();
    registerMoveSourceAndRackTrack();
  });

  it("hands back the chains a c+ made, which created leaves out", () => {
    registerRackAndDroppedMoves(1);

    const move = moveToPath("t1/d0/c+");

    expect(move).toStrictEqual({
      outcome: "refused",
      reason: undefined,
      madeChains: "c1",
    });
    expect(move).not.toHaveProperty("created");
  });

  it("hands back a gap's chains too, and no created for a failed move", () => {
    registerRackAndDroppedMoves(0);

    const move = moveToPath("t1/d0/c2/d+");

    expect(move).toStrictEqual({
      outcome: "refused",
      reason: undefined,
      madeChains: "c0-c2",
    });
    expect(move).not.toHaveProperty("created");
  });

  it("names them in update-device's refusal", () => {
    registerRackAndDroppedMoves(1);

    expect(() => updateDevice({ id: "src-0", toPath: "t1/d0/c+" })).toThrow(
      'not moved to "t1/d0/c+"; left an empty chain: c1',
    );
  });

  it("names them on that target's entry in a list", () => {
    registerRackAndDroppedMoves(1);
    registerMockObject("src-1", {
      path: livePath.track(0).device(1),
      type: "Device",
    });

    expect(
      updateDevice({
        id: "src-0,src-1",
        toPath: "t1/d0/c+,t1/d0/c+",
        name: "Moved",
      }),
    ).toStrictEqual([
      {
        id: "src-0",
        path: "t0/d0",
        detail: 'not moved to "t1/d0/c+"; left an empty chain: c1',
      },
      {
        id: "src-1",
        path: "t0/d1",
        detail: 'not moved to "t1/d0/c+"; left an empty chain: c2',
      },
    ]);
  });
});
