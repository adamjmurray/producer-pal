// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  DRIFTING_LOOP,
  LATE_LOOP,
  OWN_QUANTIZATION,
  setupSyncedWorld,
  slowDownAfter,
  stopTransportAfter,
  type WorldOptions,
} from "./synced-launch-test-helpers.ts";
import { playback } from "#src/tools/session/playback.ts";

const SYNCED = "play-session-clips-synced" as const;
const NO_CLIP_TO_SYNC = "a group or return slot has no clip to sync";

// The reference loop came round at song time 0, so its playhead is its song
// time. Loop start 8 is on the 2 bar grid: a fire 5 beats before it fits.
const REFERENCE = { track: 0, length: 8, position: 3 };

/**
 * @param options - What the Set holds, over a reference loop on t0 and the
 *   slot t1/s0 to fire
 * @returns The world
 */
function world(
  options: WorldOptions = {},
): ReturnType<typeof setupSyncedWorld> {
  return setupSyncedWorld({
    songTime: 3,
    loops: [REFERENCE],
    fires: [{ track: 1, scene: 0 }],
    ...options,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * A Live 13 return track with a clip in s0, which logs its fire.
 * @param log - The world's log
 * @returns The slot's clip
 */
function registerReturnSlot(log: string[]): RegisteredMockObject {
  const slot = livePath.returnTrack(0).clipSlot(0);

  registerMockObject("live_app", {
    path: "live_app",
    methods: { get_version_string: () => "13.0" },
  });
  registerMockObject("rt0", { path: livePath.returnTrack(0), type: "Track" });
  registerMockObject(slot, {
    path: slot,
    properties: { has_clip: 1 },
    methods: { fire: () => log.push("fire rt0/s0") },
  });

  return registerMockObject("rt-clip", {
    path: slot.clip(),
    properties: { launch_quantization: OWN_QUANTIZATION },
  });
}

describe("playback play-session-clips-synced", () => {
  it("fires the clip in sync and says when it starts", async () => {
    const { log } = world();

    const result = await playback({ action: SYNCED, path: "t1/s0" });

    expect(result).toStrictEqual({
      playing: true,
      sync: "starts in 2.5s, when t0/s0 loops",
      clip: { id: "clip-1-0", path: "t1/s0" },
    });
    expect(log).toStrictEqual([
      "quant 4",
      "fire t1/s0",
      `quant ${OWN_QUANTIZATION}`,
    ]);
  });

  it("answers at once, with no promise, when no wait is needed", () => {
    world();

    expect(playback({ action: SYNCED, path: "t1/s0" })).not.toBeInstanceOf(
      Promise,
    );
  });

  it("waits for the loop start to come within a launch grid", async () => {
    // The loop came round at song time 2 and restarts at 10: a 2 beat line only
    const { log, songTime } = world({
      songTime: 2,
      loops: [{ track: 0, length: 8, position: 0 }],
    });

    const pending = playback({ action: SYNCED, path: "t1/s0" });

    expect(pending).toBeInstanceOf(Promise);

    const result = await pending;

    expect(result.sync).toBe("starts in 1s, when t0/s0 loops");
    expect(songTime()).toBeGreaterThanOrEqual(8);
    expect(log[0]).toBe("quant 6");
  });

  it("fires several clips, each synced, and never restarts the transport", async () => {
    const { liveSet, log } = world({
      fires: [
        { track: 1, scene: 0 },
        { track: 2, scene: 0 },
      ],
    });

    const result = await playback({ action: SYNCED, path: "t1/s0,t2/s0" });

    expect(log).toStrictEqual([
      "quant 4",
      "fire t1/s0",
      `quant ${OWN_QUANTIZATION}`,
      "quant 4",
      "fire t2/s0",
      `quant ${OWN_QUANTIZATION}`,
    ]);
    expect(result.clip).toStrictEqual([
      { id: "clip-1-0", path: "t1/s0" },
      { id: "clip-2-0", path: "t2/s0" },
    ]);
    expect(liveSet.call).not.toHaveBeenCalledWith("stop_playing");
    expect(liveSet.call).not.toHaveBeenCalledWith("start_playing");
  });

  describe("when song time moves past the guard between clips", () => {
    const DRIFTING = {
      ...DRIFTING_LOOP,
      fires: [
        { track: 1, scene: 0 },
        { track: 2, scene: 0 },
        { track: 3, scene: 0 },
      ],
    };

    it("aims every clip at the same loop start", async () => {
      const { log } = world({ ...DRIFTING, driftPerFire: 0.02 });

      const result = await playback({
        action: SYNCED,
        path: "t1/s0,t2/s0,t3/s0",
      });

      expect(log).toStrictEqual(
        ["t1", "t2", "t3"].flatMap((track) => [
          "quant 10",
          `fire ${track}/s0`,
          `quant ${OWN_QUANTIZATION}`,
        ]),
      );
      expect(result.sync).toBe("starts in 0.2s, when t0/s0 loops");
      expect(result.clip).toStrictEqual([
        { id: "clip-1-0", path: "t1/s0" },
        { id: "clip-2-0", path: "t2/s0" },
        { id: "clip-3-0", path: "t3/s0" },
      ]);
    });

    it("fires a clip plainly, and says so, once the loop start has passed", async () => {
      const { log } = world({ ...DRIFTING, driftPerFire: 0.2 });

      const result = await playback({
        action: SYNCED,
        path: "t1/s0,t2/s0,t3/s0",
      });

      expect(log).toStrictEqual([
        "quant 10",
        "fire t1/s0",
        `quant ${OWN_QUANTIZATION}`,
        "quant 10",
        "fire t2/s0",
        `quant ${OWN_QUANTIZATION}`,
        "fire t3/s0",
      ]);
      expect(result.sync).toBe("starts in 0.2s, when t0/s0 loops");
      expect(result.clip).toStrictEqual([
        { id: "clip-1-0", path: "t1/s0" },
        { id: "clip-2-0", path: "t2/s0" },
        { id: "clip-3-0", path: "t3/s0", detail: "fired without sync" },
      ]);
    });
  });

  it("syncs to the fired tracks' own loops when no other track loops", async () => {
    const { log } = world({
      loops: [{ track: 1, scene: 0, length: 8, position: 3 }],
      fires: [{ track: 1, scene: 1 }],
    });

    const result = await playback({ action: SYNCED, path: "t1/s1" });

    expect(result.sync).toBe("starts in 2.5s, when t1/s0 loops");
    expect(log[0]).toBe("quant 4");
  });

  it("leaves a skipped slot's track out of the fired ones", async () => {
    world({
      loops: [REFERENCE, { track: 2, scene: 1, length: 16, position: 3 }],
      // t2/s0 holds no clip: skipped, so t2's loop is still one to sync to
      fires: [
        { track: 1, scene: 0 },
        { track: 2, scene: 0, clip: false },
      ],
    });

    const result = await playback({ action: SYNCED, path: "t1/s0,t2/s0" });

    expect(result.sync).toBe("starts in 6.5s, when t2/s1 loops");
  });

  it.each([
    ["nothing is playing", { loops: [] }],
    ["the transport is stopped", { playing: false }],
  ])("fires plainly and says so when %s", async (_why, options) => {
    const { log } = world(options);

    const result = await playback({ action: SYNCED, path: "t1/s0" });

    expect(result).toStrictEqual({
      playing: true,
      sync: "no loop playing to sync to",
      clip: { id: "clip-1-0", path: "t1/s0" },
    });
    expect(log).toStrictEqual(["fire t1/s0"]);
  });

  it("fires plainly and says so when the loop start is on no launch grid", async () => {
    const { log } = world({
      loops: [{ track: 0, length: 8, position: 3.3 }],
    });

    const result = await playback({ action: SYNCED, path: "t1/s0" });

    expect(result.sync).toBe(
      "t0/s0 doesn't loop on Live's launch grid, so nothing can start exactly with it",
    );
    expect(log).toStrictEqual(["fire t1/s0"]);
  });

  it("refuses loops that restart apart, before firing anything", () => {
    const { log, liveSet } = world({
      loops: [REFERENCE, { track: 2, length: 8, position: 5 }],
    });

    expect(() => playback({ action: SYNCED, path: "t1/s0" })).toThrow(
      "t0/s0 and t2/s0 loop out of step, so there is no one loop start to sync to; use play-session-clips to fire without sync",
    );
    expect(log).toStrictEqual([]);
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("refuses a loop start too far off to wait for", () => {
    const { log } = world({
      loops: [{ track: 0, length: 128, position: 3 }],
    });

    expect(() => playback({ action: SYNCED, path: "t1/s0" })).toThrow(
      "t0/s0 next loops in 62.5s, too long for this call to wait",
    );
    expect(log).toStrictEqual([]);
  });

  it("holds the wait to what the request deadline leaves", async () => {
    world({ loops: [{ track: 0, length: 64, position: 3 }] });

    expect(() =>
      playback(
        { action: SYNCED, path: "t1/s0" },
        { deadline: Date.now() + 10_000 },
      ),
    ).toThrow("t0/s0 next loops in 30.5s, too long");

    // 18.5 s of waiting fits in what a minute leaves
    const result = await playback(
      { action: SYNCED, path: "t1/s0" },
      { deadline: Date.now() + 60_000 },
    );

    expect(result.sync).toMatch(/^starts in \d+\.?\d*s, when t0\/s0 loops$/);
  });

  it("fires a group track's slot plainly, with no wait and no note on its entry", async () => {
    const { log } = world({
      fires: [{ track: 1, scene: 0, clip: false, group: true }],
    });

    registerMockObject("t1", {
      path: livePath.track(1),
      type: "Track",
      properties: { is_foldable: 1, playing_slot_index: -1 },
    });

    const result = await playback({ action: SYNCED, path: "t1/s0" });

    // Nothing in the call can sync, so there is no wait and no per-slot note
    expect(result.clip).toStrictEqual({ path: "t1/s0" });
    expect(result.sync).toBe(NO_CLIP_TO_SYNC);
    expect(log).toStrictEqual(["fire t1/s0"]);
  });

  it("says what a group slot launches inside it, and nothing of sync", async () => {
    world({
      fires: [
        { track: 1, scene: 0, clip: false, group: true },
        { track: 2, scene: 0 },
      ],
    });

    registerMockObject("t1", {
      path: livePath.track(1),
      type: "Track",
      properties: { is_foldable: 1, playing_slot_index: -1 },
    });
    registerMockObject("t2", {
      path: livePath.track(2),
      type: "Track",
      properties: { group_track: ["id", "t1"], playing_slot_index: -1 },
    });

    const result = await playback({ action: SYNCED, path: "t1/s0" });

    expect(result.clip).toStrictEqual({
      path: "t1/s0",
      detail: "launched t2/s0 (id clip-2-0)",
    });
    expect(result.sync).toBe(NO_CLIP_TO_SYNC);
  });

  it("fires a clip alongside a group slot, and only the group slot goes plain", async () => {
    const { log } = world({
      fires: [
        { track: 1, scene: 0 },
        { track: 2, scene: 0, clip: false, group: true },
      ],
    });

    registerMockObject("t2", {
      path: livePath.track(2),
      type: "Track",
      properties: { is_foldable: 1, playing_slot_index: -1 },
    });

    const result = await playback({ action: SYNCED, path: "t1/s0,t2/s0" });

    expect(result.sync).toBe("starts in 2.5s, when t0/s0 loops");
    expect(result.clip).toStrictEqual([
      { id: "clip-1-0", path: "t1/s0" },
      { path: "t2/s0", detail: "fired without sync" },
    ]);
    expect(log.filter((entry) => entry.startsWith("fire"))).toStrictEqual([
      "fire t1/s0",
      "fire t2/s0",
    ]);
  });

  it("adds the fired-without-sync note to what a group slot launches beside a clip", async () => {
    world({
      fires: [
        { track: 1, scene: 0 },
        { track: 2, scene: 0, clip: false, group: true },
        { track: 3, scene: 0 },
      ],
    });

    registerMockObject("t2", {
      path: livePath.track(2),
      type: "Track",
      properties: { is_foldable: 1, playing_slot_index: -1 },
    });
    registerMockObject("t3", {
      path: livePath.track(3),
      type: "Track",
      properties: { group_track: ["id", "t2"], playing_slot_index: -1 },
    });

    const result = await playback({ action: SYNCED, path: "t1/s0,t2/s0" });

    expect(result.clip).toStrictEqual([
      { id: "clip-1-0", path: "t1/s0" },
      {
        path: "t2/s0",
        detail: "launched t3/s0 (id clip-3-0); fired without sync",
      },
    ]);
  });

  it("fires plainly when the transport stops while it waits", async () => {
    const synced = world(LATE_LOOP);
    const { log } = synced;

    stopTransportAfter(synced, 3);

    const result = await playback({ action: SYNCED, path: "t1/s0" });

    expect(result.clip).toStrictEqual({
      id: "clip-1-0",
      path: "t1/s0",
      detail: "fired without sync",
    });
    expect(result.sync).toBe("nothing fired in sync");
    expect(log).toStrictEqual(["fire t1/s0"]);
  });

  it("fires a return track's slot plainly, with no wait and no note on its entry", async () => {
    const { log } = world({
      songTime: 2,
      loops: [{ track: 0, length: 8, position: 0 }],
      fires: [],
    });
    const rtClip = registerReturnSlot(log);

    const result = await playback({ action: SYNCED, path: "rt0/s0" });

    expect(result.clip).toStrictEqual({ id: "rt-clip", path: "rt0/s0" });
    expect(result.sync).toBe(NO_CLIP_TO_SYNC);
    expect(log).toStrictEqual(["fire rt0/s0"]);
    expect(rtClip.set).not.toHaveBeenCalled();
  });

  it("fires a return track's slot plainly beside a clip that syncs", async () => {
    const { log } = world();
    const rtClip = registerReturnSlot(log);

    const result = await playback({ action: SYNCED, path: "t1/s0,rt0/s0" });

    expect(result.sync).toBe("starts in 2.5s, when t0/s0 loops");
    expect(result.clip).toStrictEqual([
      { id: "clip-1-0", path: "t1/s0" },
      { id: "rt-clip", path: "rt0/s0", detail: "fired without sync" },
    ]);
    expect(rtClip.set).not.toHaveBeenCalled();
  });

  // Both calls below would otherwise refuse or wait: the loops are out of step
  // in the first, and in the second the loop start is 4 s off.
  it("neither plans nor refuses when every target is skipped", async () => {
    const { log, songTime } = world({
      songTime: 2,
      loops: [REFERENCE, { track: 2, length: 8, position: 5 }],
      fires: [
        { track: 1, scene: 0, clip: false },
        { track: 3, scene: 0, clip: false },
      ],
    });

    const result = playback({ action: SYNCED, path: "t1/s0,t3/s0" });

    expect(result).not.toBeInstanceOf(Promise);
    expect(await result).toStrictEqual({
      playing: true,
      clip: [
        { path: "t1/s0", ok: false, detail: "no clip to play" },
        { path: "t3/s0", ok: false, detail: "no clip to play" },
      ],
    });
    expect(log).toStrictEqual([]);
    expect(songTime()).toBe(2);
  });

  it("doesn't wait or refuse for a call that has only a group slot", () => {
    const { songTime } = world({
      songTime: 2,
      loops: [
        { track: 0, length: 8, position: 0 },
        { track: 2, length: 8, position: 3 },
      ],
      fires: [{ track: 1, scene: 0, clip: false, group: true }],
    });

    const result = playback({ action: SYNCED, path: "t1/s0" });

    expect(result).not.toBeInstanceOf(Promise);
    expect((result as { sync: string }).sync).toBe(NO_CLIP_TO_SYNC);
    expect(songTime()).toBe(2);
  });

  // A deadline already past is the pipeline's own refusal, before any slot.
  it("fires in sync with a deadline inside the margin when no wait is needed", () => {
    const { log } = world();

    const result = playback(
      { action: SYNCED, path: "t1/s0" },
      { deadline: Date.now() + 1000 },
    );

    expect(result).not.toBeInstanceOf(Promise);
    expect((result as { sync: string }).sync).toBe(
      "starts in 2.5s, when t0/s0 loops",
    );
    expect(log[0]).toBe("quant 4");
  });

  it("says nothing fired in sync when the wait ran out of time", async () => {
    const synced = world(LATE_LOOP);
    const { log } = synced;

    slowDownAfter(synced, 5);

    // 3 s of waiting at 120 BPM fits the 3.2 s the deadline leaves; the tempo
    // drop makes it longer than that.
    const result = await playback(
      { action: SYNCED, path: "t1/s0" },
      { deadline: Date.now() + 8200 },
    );

    expect(result.sync).toBe("nothing fired in sync");
    expect(result.clip).toStrictEqual({
      id: "clip-1-0",
      path: "t1/s0",
      detail: "fired without sync",
    });
    expect(log).toStrictEqual(["fire t1/s0"]);
  });

  describe("on a stopped transport", () => {
    const TWO_CLIPS = [
      { track: 1, scene: 0 },
      { track: 2, scene: 0 },
    ];

    it("restarts the transport for two clips, like play-session-clips", async () => {
      const { liveSet } = world({
        playing: false,
        loops: [],
        fires: TWO_CLIPS,
      });

      await playback({ action: SYNCED, path: "t1/s0,t2/s0" });

      expect(liveSet.call).toHaveBeenCalledWith("stop_playing");
      expect(liveSet.call).toHaveBeenCalledWith("start_playing");
    });

    it("doesn't restart it for one clip", async () => {
      const { liveSet } = world({ playing: false, loops: [] });

      await playback({ action: SYNCED, path: "t1/s0" });

      expect(liveSet.call).not.toHaveBeenCalledWith("start_playing");
    });
  });

  it("puts the clip's quantization back when the fire throws", () => {
    const { log } = world({
      fires: [{ track: 1, scene: 0, throws: true }],
    });

    expect(() => playback({ action: SYNCED, path: "t1/s0" })).toThrow(
      "fire failed",
    );
    expect(log).toStrictEqual([
      "quant 4",
      "fire t1/s0",
      `quant ${OWN_QUANTIZATION}`,
    ]);
  });

  it("takes only clip slots, and points a scene at play-scene", () => {
    world();

    expect(() => playback({ action: SYNCED, path: "s3" })).toThrow(
      'invalid path "s3" - names a scene; action "play-session-clips-synced" takes ' +
        'clip slots "t<track>/s<scene>" (e.g., "t0/s3"), or use ' +
        'action "play-scene" for the whole scene',
    );
  });

  it("needs a clip to fire", () => {
    world();

    expect(() => playback({ action: SYNCED })).toThrow(
      'id or path is required for action "play-session-clips-synced"',
    );
  });

  it("leaves the plain action answering without a sync line", () => {
    world();

    expect(
      playback({ action: "play-session-clips", path: "t1/s0" }),
    ).toStrictEqual({
      playing: true,
      clip: { id: "clip-1-0", path: "t1/s0" },
    });
  });
});
