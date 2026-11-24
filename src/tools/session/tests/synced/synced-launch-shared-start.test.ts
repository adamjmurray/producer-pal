// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  fireSynced,
  syncedLaunch,
  type SyncedLaunch,
} from "#src/tools/session/helpers/playback/synced-launch.ts";
import {
  DRIFTING_LOOP,
  OWN_QUANTIZATION,
  setupSyncedWorld,
  type WorldOptions,
} from "./synced-launch-test-helpers.ts";

// A call's clips all aim at the loop start the first one fixed, while song
// time moves on between their fires. At 120 BPM the guard is 0.3 beats and
// the margin for a later clip 0.06.
const DRIFTING: WorldOptions = {
  ...DRIFTING_LOOP,
  fires: [
    { track: 1, scene: 0 },
    { track: 2, scene: 0 },
  ],
};
// Loop start 28 is exactly 0.5 beats off, so the 1/4 grid (1 beat) fits it
const EXACT: WorldOptions = {
  songTime: 27.5,
  loops: [{ track: 0, length: 4, position: 3.5 }],
  fires: DRIFTING.fires,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * @param track - The track whose scene 0 to fire
 * @param launch - Where to start
 * @returns Seconds until the clip starts, or null when it fired plain
 */
function fireTrack(track: number, launch: SyncedLaunch): number | null {
  return fireSynced(
    LiveAPI.from(livePath.liveSet),
    LiveAPI.from(livePath.track(track).clipSlot(0)),
    launch,
  );
}

/**
 * @param world - Options for the world
 * @returns Handles on it, and the launch for tracks 1 and 2
 */
function setup(world: WorldOptions): {
  world: ReturnType<typeof setupSyncedWorld>;
  launch: SyncedLaunch;
} {
  const made = setupSyncedWorld(world);

  return {
    world: made,
    launch: syncedLaunch(LiveAPI.from(livePath.liveSet), [1, 2]),
  };
}

describe("fireSynced across the slots of one call", () => {
  it("fires every slot on the same loop start, and reports one time", () => {
    const { world, launch } = setup({ ...DRIFTING, driftPerFire: 0.02 });
    const first = fireTrack(1, launch);
    const second = fireTrack(2, launch);

    // Both on the 1/8 grid that lands on 28, not the 4 bar one that lands on 32
    expect(world.log).toStrictEqual([
      "quant 10",
      "fire t1/s0",
      `quant ${OWN_QUANTIZATION}`,
      "quant 10",
      "fire t2/s0",
      `quant ${OWN_QUANTIZATION}`,
    ]);
    expect(second).toBe(first);
    expect(first).toBe(0.2);
  });

  it("fires plainly once song time has reached the loop start", () => {
    const { world, launch } = setup({ ...DRIFTING, driftPerFire: 0.5 });

    expect(fireTrack(1, launch)).toBe(0.2);
    expect(fireTrack(2, launch)).toBeNull();
    expect(world.log.slice(3)).toStrictEqual(["fire t2/s0"]);
  });

  it("fires plainly when the loop start is nearer than the margin", () => {
    // The second fire is at 27.95: 0.05 beats off
    const { world, launch } = setup({ ...DRIFTING, driftPerFire: 0.26 });

    expect(fireTrack(1, launch)).toBe(0.2);
    expect(fireTrack(2, launch)).toBeNull();
    expect(world.log.slice(3)).toStrictEqual(["fire t2/s0"]);
  });

  it("fires plainly when song time jumped back a whole grid line", () => {
    // Back to 27.0, 1 beat off: the grid's line at 27 would latch first
    const { world, launch } = setup({ ...EXACT, driftPerFire: -0.5 });

    expect(fireTrack(1, launch)).not.toBeNull();
    expect(fireTrack(2, launch)).toBeNull();
    expect(world.log.slice(3)).toStrictEqual(["fire t2/s0"]);
  });

  it("still fires in sync when song time only jumped back within the grid line", () => {
    // Back to 27.25, 0.75 beats off: the line at 27 is already behind it
    const { world, launch } = setup({ ...EXACT, driftPerFire: -0.25 });

    expect(fireTrack(1, launch)).not.toBeNull();
    expect(fireTrack(2, launch)).not.toBeNull();
    expect(world.log.filter((entry) => entry === "quant 8")).toHaveLength(2);
  });

  it("keeps firing plainly when the first found no grid, even if one would fit later", () => {
    // Loop start 8 is 8 beats off: no grid reaches it yet. After the first
    // fire it is 3 beats off, when the 4 beat grid would.
    const { world, launch } = setup({
      ...DRIFTING,
      driftPerFire: 5,
      songTime: 0,
      loops: [{ track: 0, length: 8, position: 0 }],
    });

    expect(fireTrack(1, launch)).toBeNull();
    expect(fireTrack(2, launch)).toBeNull();
    expect(world.log).toStrictEqual(["fire t1/s0", "fire t2/s0"]);
  });

  it("puts a later slot's quantization back when its fire throws", () => {
    const { world, launch } = setup({
      ...DRIFTING,
      fires: [
        { track: 1, scene: 0 },
        { track: 2, scene: 0, throws: true },
      ],
    });

    fireTrack(1, launch);

    expect(() => fireTrack(2, launch)).toThrow("fire failed");
    expect(world.log.slice(3)).toStrictEqual([
      "quant 10",
      "fire t2/s0",
      `quant ${OWN_QUANTIZATION}`,
    ]);
  });

  it("leaves the aim to the first slot that holds a clip", () => {
    const { world, launch } = setup({
      ...DRIFTING,
      fires: [
        { track: 1, scene: 0, clip: false },
        { track: 2, scene: 0 },
      ],
    });

    expect(fireTrack(1, launch)).toBeNull();
    expect(launch.aim).toBeUndefined();
    expect(fireTrack(2, launch)).toBe(0.2);
    expect(launch.aim?.startBeat).toBe(28);
    expect(world.log).toStrictEqual([
      "fire t1/s0",
      "quant 10",
      "fire t2/s0",
      `quant ${OWN_QUANTIZATION}`,
    ]);
  });
});
