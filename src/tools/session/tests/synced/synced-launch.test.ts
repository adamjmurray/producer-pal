// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  awaitLaunchWindow,
  fireSynced,
  syncedLaunch,
  type SyncedLaunch,
} from "#src/tools/session/helpers/playback/synced-launch.ts";
import {
  OWN_QUANTIZATION,
  setupSyncedWorld,
  stopTransportAfter,
  type WorldOptions,
} from "./synced-launch-test-helpers.ts";

// Every world here has its loops start at song time 0, so a playhead at `p`
// goes with a song time of `p`.
const FIRE_T1 = [{ track: 1, scene: 0 }];

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * @param world - Options for the world
 * @param fired - The tracks about to be fired
 * @param deadline - The request's deadline
 * @returns What syncedLaunch makes of it
 */
function plan(
  world: WorldOptions,
  fired: number[],
  deadline?: number | null,
): SyncedLaunch {
  setupSyncedWorld(world);

  return syncedLaunch(LiveAPI.from(livePath.liveSet), fired, deadline);
}

/**
 * Fire t1/s0 the way a tool does.
 * @param launch - Where to start; by default what syncedLaunch plans now
 * @returns Seconds until the clip starts, or null when it fired plain
 */
function fireT1(launch?: SyncedLaunch): number | null {
  const liveSet = LiveAPI.from(livePath.liveSet);

  return fireSynced(
    liveSet,
    LiveAPI.from(livePath.track(1).clipSlot(0)),
    launch ?? syncedLaunch(liveSet, [1]),
  );
}

describe("syncedLaunch", () => {
  it("has nothing to sync to when the transport is stopped", () => {
    expect(
      plan(
        {
          playing: false,
          songTime: 3,
          loops: [{ track: 0, length: 8, position: 3 }],
        },
        [1],
      ),
    ).toStrictEqual({});
  });

  it("has nothing to sync to when no session clip is playing", () => {
    expect(plan({}, [1])).toStrictEqual({});
  });

  it("leaves out clips that don't loop, loops with no length and empty slots", () => {
    setupSyncedWorld({
      songTime: 3,
      loops: [
        { track: 0, length: 8, position: 3, looping: false },
        { track: 1, length: 0, position: 0 },
      ],
    });
    // Playing a slot that holds no clip
    registerMockObject("t2", {
      path: livePath.track(2),
      type: "Track",
      properties: { playing_slot_index: 2 },
    });

    expect(syncedLaunch(LiveAPI.from(livePath.liveSet), [3])).toStrictEqual({});
  });

  it("aims for the next start of a loop that is playing", () => {
    expect(
      plan(
        {
          songTime: 3,
          loops: [{ track: 0, scene: 2, length: 8, position: 3 }],
        },
        [1],
      ),
    ).toStrictEqual({
      startBeat: 8,
      loopBeats: 8,
      reference: "t0/s2",
      // No deadline: the default wait of 30 s
      waitEndsAt: Date.now() + 30_000,
    });
  });

  it("syncs to the longest of loops that restart together", () => {
    const launch = plan(
      {
        songTime: 3,
        loops: [
          { track: 0, length: 8, position: 3 },
          { track: 1, length: 16, position: 3 },
          { track: 2, length: 4, position: 3 },
        ],
      },
      [3],
    );

    expect(launch).toStrictEqual({
      startBeat: 16,
      loopBeats: 16,
      reference: "t1/s0",
      waitEndsAt: Date.now() + 30_000,
    });
  });

  it("refuses loops that don't restart together", () => {
    expect(() =>
      plan(
        {
          songTime: 3,
          loops: [
            { track: 0, length: 8, position: 3 },
            { track: 1, length: 8, position: 5 },
          ],
        },
        [2],
      ),
    ).toThrow(
      "t0/s0 and t1/s0 loop out of step, so there is no one loop start to sync to; use play-session-clips to fire without sync",
    );
  });

  // The longest loop's start must be a start of every loop: 3 beats don't
  // divide 8, though the two happen to meet at 8.
  it("refuses a loop whose length doesn't divide the longest's", () => {
    expect(() =>
      plan(
        {
          songTime: 3,
          loops: [
            { track: 0, length: 8, position: 3 },
            { track: 1, length: 3, position: 1 },
          ],
        },
        [2],
      ),
    ).toThrow("t0/s0 and t1/s0 loop out of step");
  });

  it("doesn't count a clip whose playhead is past its loop end", () => {
    const past = (position: number): SyncedLaunch =>
      plan(
        {
          songTime: 3,
          loops: [{ track: 0, length: 8, position: 0, rawPosition: position }],
        },
        [1],
      );

    expect(past(8.5)).toStrictEqual({});
    // Right at the end, it is about to loop
    expect(past(8).reference).toBe("t0/s0");
  });

  it("syncs to the other tracks, and ignores a fired track's loop", () => {
    const launch = plan(
      {
        songTime: 3,
        loops: [
          { track: 0, length: 8, position: 3 },
          // Out of step, but about to be replaced
          { track: 1, length: 8, position: 5 },
        ],
      },
      [1],
    );

    expect(launch.reference).toBe("t0/s0");
  });

  it("syncs to the fired tracks' own loops when no other track loops", () => {
    const launch = plan(
      { songTime: 3, loops: [{ track: 0, length: 8, position: 3 }] },
      [0],
    );

    expect(launch).toStrictEqual({
      startBeat: 8,
      loopBeats: 8,
      reference: "t0/s0",
      waitEndsAt: Date.now() + 30_000,
    });
  });

  it("says so when the loop start is on no launch grid", () => {
    const launch = plan(
      { songTime: 3, loops: [{ track: 0, length: 8, position: 3.3 }] },
      [1],
    );

    expect(launch).toStrictEqual({
      unsynced:
        "t0/s0 doesn't loop on Live's launch grid, so nothing can start exactly with it",
    });
  });

  it("is unsynced when a loop start is only on grids the guard rules out", () => {
    // 0.15 s is 0.3 beats at 120 BPM: a 1/16 (0.25 beats) and finer never fit.
    // The loop restarts at 8.25, on no grid longer than that.
    const launch = plan(
      { songTime: 3, loops: [{ track: 0, length: 8, position: 2.75 }] },
      [1],
    );

    expect(launch).toStrictEqual({
      unsynced:
        "t0/s0 doesn't loop on Live's launch grid, so nothing can start exactly with it",
    });
  });

  it("still syncs to a loop start that is on a 1/8 at 120 BPM", () => {
    const launch = plan(
      { songTime: 3, loops: [{ track: 0, length: 8, position: 2.5 }] },
      [1],
    );

    expect(launch.startBeat).toBe(8.5);
    expect(launch.unsynced).toBeUndefined();
  });

  it("refuses a loop start too far off to wait for", () => {
    expect(() =>
      plan(
        { songTime: 3, loops: [{ track: 0, length: 128, position: 3 }] },
        [1],
      ),
    ).toThrow(
      "t0/s0 next loops in 62.5s, too long for this call to wait; use play-session-clips to fire without sync",
    );
  });

  it("waits up to what the request deadline leaves, less a margin", () => {
    const world = {
      songTime: 3,
      loops: [{ track: 0, length: 64, position: 3 }],
    };

    expect(() => plan(world, [1], Date.now() + 10_000)).toThrow(
      "t0/s0 next loops in 30.5s, too long",
    );
    expect(plan(world, [1], Date.now() + 60_000).reference).toBe("t0/s0");
    // No deadline at all: the default of 30 s still covers 18.5 s
    expect(plan(world, [1], null).reference).toBe("t0/s0");
  });

  // Only a wait counts against the deadline: a fire that lands now goes ahead
  // however little time is left.
  it.each([
    ["inside the margin", 1000],
    ["already past", -1000],
  ])("fires in sync with a deadline %s when no wait is needed", (_how, ms) => {
    const launch = plan(
      { songTime: 3, loops: [{ track: 0, length: 8, position: 3 }] },
      [1],
      Date.now() + ms,
    );

    expect(launch.reference).toBe("t0/s0");
    expect(launch.waitEndsAt).toBeLessThanOrEqual(Date.now());
  });

  it("refuses a wait the deadline has no room for, even one already past", () => {
    const world = {
      songTime: 2,
      loops: [{ track: 0, length: 8, position: 0 }],
    };

    expect(() => plan(world, [1], Date.now() + 1000)).toThrow(
      "next loops in 4s, too long",
    );
    expect(() => plan(world, [1], Date.now() - 1000)).toThrow("too long");
  });
});

describe("fireSynced", () => {
  // [grid, loop length, playhead (= song time), tempo, quantization value]
  const GRIDS: Array<[string, number, number, number, number]> = [
    ["8 bars", 32, 3, 120, 2],
    ["4 bars", 16, 3, 120, 3],
    ["2 bars", 8, 3, 120, 4],
    ["1 bar", 8, 5, 120, 5],
    ["1/2", 8, 6.5, 120, 6],
    ["1/4", 8, 7.25, 120, 8],
    ["1/8", 8, 7.6, 120, 10],
    // Slow enough that the 0.15 s guard is shorter than the grid
    ["1/16", 8, 7.8, 60, 12],
    ["1/32", 8, 7.89, 40, 14],
  ];

  it.each(GRIDS)(
    "fires with a %s grid when it is the smallest with no line before the loop start",
    (_name, length, position, tempo, value) => {
      const world = setupSyncedWorld({
        tempo,
        songTime: position,
        loops: [{ track: 0, length, position }],
        fires: FIRE_T1,
      });
      const startsIn = fireT1();

      expect(world.log).toStrictEqual([
        `quant ${value}`,
        "fire t1/s0",
        `quant ${OWN_QUANTIZATION}`,
      ]);
      expect(startsIn).toBeGreaterThan(0);
    },
  );

  it("reports the seconds until the loop start", () => {
    setupSyncedWorld({
      songTime: 3,
      loops: [{ track: 0, length: 8, position: 3 }],
      fires: FIRE_T1,
    });

    // 5 beats at 120 BPM
    expect(fireT1()).toBe(2.5);
  });

  it.each([
    ["4/4", 4, 4, 6, 4.5, 6],
    ["3/4", 3, 4, 6, 4.5, 5],
    ["4/4 again", 4, 4, 7, 6.25, 8],
    ["7/8", 7, 8, 7, 6.25, 5],
    ["6/8", 6, 8, 6, 4.5, 5],
    ["5/4", 5, 4, 10, 8.5, 5],
    ["2/2", 2, 2, 8, 6.5, 6],
  ])(
    "only offers the grids that divide the bar in %s",
    (_meter, numerator, denominator, length, position, value) => {
      const world = setupSyncedWorld({
        numerator,
        denominator,
        songTime: position,
        loops: [{ track: 0, length, position }],
        fires: FIRE_T1,
      });

      fireT1();

      expect(world.log[0]).toBe(`quant ${value}`);
    },
  );

  it("aims past a loop start too near to hit", () => {
    const world = setupSyncedWorld({
      songTime: 7.8,
      loops: [{ track: 0, length: 8, position: 7.8 }],
      fires: FIRE_T1,
    });
    const launch = syncedLaunch(LiveAPI.from(livePath.liveSet), [1]);
    const startsIn = fireT1(launch);

    // 0.2 beats is 0.1 s: the fire could land after it. So it is the start
    // after that one, 8.2 beats away on a 4 bar line.
    expect(launch.startBeat).toBe(8);
    expect(world.log[0]).toBe("quant 3");
    expect(startsIn).toBe(4.1);
  });

  it("puts the quantization back even when the fire throws", () => {
    const world = setupSyncedWorld({
      songTime: 3,
      loops: [{ track: 0, length: 8, position: 3 }],
      fires: [{ track: 1, scene: 0, throws: true }],
    });

    expect(() => fireT1()).toThrow("fire failed");
    expect(world.log).toStrictEqual([
      "quant 4",
      "fire t1/s0",
      `quant ${OWN_QUANTIZATION}`,
    ]);
  });

  it("fires a slot with no clip of its own as it is", () => {
    const world = setupSyncedWorld({
      songTime: 3,
      loops: [{ track: 0, length: 8, position: 3 }],
      fires: [{ track: 1, scene: 0, clip: false }],
    });

    expect(fireT1()).toBeNull();
    expect(world.log).toStrictEqual(["fire t1/s0"]);
  });

  it("fires as it is when the transport has stopped since", () => {
    const world = setupSyncedWorld({
      songTime: 3,
      loops: [{ track: 0, length: 8, position: 3 }],
      fires: FIRE_T1,
    });
    const launch = syncedLaunch(LiveAPI.from(livePath.liveSet), [1]);

    world.liveSet.properties.is_playing = 0;

    expect(fireT1(launch)).toBeNull();
    expect(world.log).toStrictEqual(["fire t1/s0"]);
  });

  it("fires as it is when no grid reaches the loop start yet", () => {
    const world = setupSyncedWorld({
      loops: [{ track: 0, length: 8, position: 0 }],
      fires: FIRE_T1,
    });

    expect(fireT1()).toBeNull();
    expect(world.log).toStrictEqual(["fire t1/s0"]);
  });

  it("fires as it is when there is no loop start to aim at", () => {
    const world = setupSyncedWorld({ fires: FIRE_T1 });

    expect(fireT1({})).toBeNull();
    expect(world.log).toStrictEqual(["fire t1/s0"]);
  });
});

describe("awaitLaunchWindow", () => {
  // The loop came round at song time 2, so it restarts at 10: a line of the
  // 2 beat grid only. It fits once the loop start is under 2 beats away.
  const LOOP_AT_START = {
    songTime: 2,
    loops: [{ track: 0, length: 8, position: 0 }],
    fires: FIRE_T1,
  };

  it("returns at once, with no promise, when a fire would already land", () => {
    setupSyncedWorld({
      songTime: 3,
      loops: [{ track: 0, length: 8, position: 3 }],
    });
    const liveSet = LiveAPI.from(livePath.liveSet);

    expect(
      awaitLaunchWindow(liveSet, syncedLaunch(liveSet, [1])),
    ).toBeUndefined();
  });

  it("returns at once when there is no loop start", () => {
    setupSyncedWorld({});

    expect(
      awaitLaunchWindow(LiveAPI.from(livePath.liveSet), {}),
    ).toBeUndefined();
  });

  it("waits until a grid fits the loop start, and then the fire syncs", async () => {
    const world = setupSyncedWorld(LOOP_AT_START);
    const liveSet = LiveAPI.from(livePath.liveSet);
    const launch = syncedLaunch(liveSet, [1]);
    const waited = awaitLaunchWindow(liveSet, launch);

    expect(waited).toBeInstanceOf(Promise);
    await waited;

    expect(world.songTime()).toBeGreaterThanOrEqual(8);
    expect(world.songTime()).toBeLessThan(8.1);

    const startsIn = fireT1(launch) as number;

    expect(startsIn).toBeGreaterThan(0.9);
    expect(startsIn).toBeLessThanOrEqual(1);
    expect(world.log[0]).toBe("quant 6");
  });

  it("stops waiting when the transport stops, and the fire goes plain", async () => {
    const world = setupSyncedWorld(LOOP_AT_START);
    const liveSet = LiveAPI.from(livePath.liveSet);
    const launch = syncedLaunch(liveSet, [1]);

    stopTransportAfter(world, 3);

    await awaitLaunchWindow(liveSet, launch);

    expect(world.songTime()).toBeLessThan(2.5);
    expect(fireT1(launch)).toBeNull();
    expect(world.log).toStrictEqual(["fire t1/s0"]);
  });

  it("stops waiting when the loop start is no longer one to aim at", async () => {
    const world = setupSyncedWorld(LOOP_AT_START);
    const liveSet = LiveAPI.from(livePath.liveSet);
    const launch = syncedLaunch(liveSet, [1]);

    world.onTick(() => {
      delete launch.startBeat;
    });

    await awaitLaunchWindow(liveSet, launch);

    expect(world.songTime()).toBeLessThan(2.1);
  });

  it("gives up when the clock reaches the end of the wait, however song time moves", async () => {
    const world = setupSyncedWorld(LOOP_AT_START);
    const liveSet = LiveAPI.from(livePath.liveSet);
    let ticks = 0;

    // Each poll is 20 ms: 0.04 beats at 120 BPM. Undo it.
    world.onTick(() => {
      ticks++;
      world.advance(-0.04);
    });

    await awaitLaunchWindow(liveSet, syncedLaunch(liveSet, [1]));

    // The default wait of 30 s, in 20 ms polls
    expect(ticks).toBe(1500);
  });

  it("waits at most the default 30 s for a launch with no end time", async () => {
    const world = setupSyncedWorld(LOOP_AT_START);
    const liveSet = LiveAPI.from(livePath.liveSet);
    const { waitEndsAt: _ends, ...launch } = syncedLaunch(liveSet, [1]);
    let ticks = 0;

    world.onTick(() => {
      ticks++;
      world.advance(-0.04);
    });

    await awaitLaunchWindow(liveSet, launch);

    expect(ticks).toBe(1500);
  });

  it("gives up at the deadline's share when the tempo drops mid-wait", async () => {
    const world = setupSyncedWorld(LOOP_AT_START);
    const liveSet = LiveAPI.from(livePath.liveSet);
    // 3 s of waiting at 120 BPM fits the 3.2 s the deadline leaves
    const launch = syncedLaunch(liveSet, [1], Date.now() + 8200);
    let ticks = 0;

    world.onTick(() => {
      if (++ticks === 5) {
        world.liveSet.properties.tempo = 30;
      }
    });

    await awaitLaunchWindow(liveSet, launch);

    expect(ticks).toBe(160);
    expect(world.songTime()).toBeLessThan(8);
    expect(fireT1(launch)).toBeNull();
    expect(world.log).toStrictEqual(["fire t1/s0"]);
  });
});
