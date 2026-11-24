// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  LATE_LOOP,
  OWN_QUANTIZATION,
  setupSyncedWorld,
  slowDownAfter,
  stopTransportAfter,
  type WorldOptions,
} from "./synced-launch-test-helpers.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";
import { refuseUnknownAuto } from "#src/tools/clip/create/helpers/create-clip-validation.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

// The reference loop came round at song time 0, so its playhead is its song
// time. Loop start 8 is on the 2 bar grid: a fire 5 beats before it fits.
const REFERENCE = { track: 0, length: 8, position: 3 };
const CLIP = { track: 1, scene: 0, creating: true };

/**
 * @param options - What the Set holds, over a reference loop on t0 and an
 *   empty slot t1/s0 to create a clip in
 * @returns The world
 */
function world(
  options: WorldOptions = {},
): ReturnType<typeof setupSyncedWorld> {
  return setupSyncedWorld({
    songTime: 3,
    loops: [REFERENCE],
    fires: [CLIP],
    ...options,
  });
}

/** The writes and fire of a clip synced to the reference loop */
const SYNCED_FIRE = ["quant 4", "fire t1/s0", `quant ${OWN_QUANTIZATION}`];

/**
 * Create the clip in t1/s0 with `auto: "play-clip-synced"`, which must still
 * make it whatever auto does.
 * @param extra - More params
 * @param ctx - The request's context
 */
async function createSynced(
  extra: Record<string, unknown> = {},
  ctx?: { deadline: number },
): Promise<void> {
  const result = await createClip(
    { path: "t1/s0", auto: "play-clip-synced", ...extra },
    ctx,
  );

  expect(result).toStrictEqual(expect.objectContaining({ path: "t1/s0" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createClip auto: play-clip-synced", () => {
  it("is a value auto accepts", () => {
    expect(() => refuseUnknownAuto("play-clip-synced")).not.toThrow();
    expect(() => refuseUnknownAuto("synced")).toThrow(
      'unknown auto value "synced". Expected "play-scene", "play-clip" or "play-clip-synced"',
    );
  });

  it("fires the new clip in sync with the loops already playing", async () => {
    const { log } = world();

    await createSynced();
    expect(log).toStrictEqual(SYNCED_FIRE);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("waits for the loop start to come within a launch grid, then fires", async () => {
    // The loop came round at song time 2 and restarts at 10: a 2 beat line only
    const { log, songTime } = world({
      songTime: 2,
      loops: [{ track: 0, length: 8, position: 0 }],
    });

    await createSynced();

    expect(songTime()).toBeGreaterThanOrEqual(8);
    expect(log[0]).toBe("quant 6");
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("fires every new clip, each in sync", async () => {
    const { log } = world({
      fires: [CLIP, { track: 2, scene: 0, creating: true }],
    });

    await createClip({ path: "t1/s0,t2/s0", auto: "play-clip-synced" });

    expect(log.filter((entry) => entry.startsWith("fire"))).toStrictEqual([
      "fire t1/s0",
      "fire t2/s0",
    ]);
    expect(log.filter((entry) => entry === "quant 4")).toHaveLength(2);
  });

  it("fires plainly, and says nothing, when nothing is playing", async () => {
    const { log } = world({ loops: [] });

    await createSynced();

    expect(log).toStrictEqual(["fire t1/s0"]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("fires plainly and warns when the loop start is on no launch grid", async () => {
    const { log } = world({ loops: [{ track: 0, length: 8, position: 3.3 }] });

    await createSynced();

    expect(log).toStrictEqual(["fire t1/s0"]);
    expect(capturedWarnings()).toStrictEqual([
      "auto: t0/s0 doesn't loop on Live's launch grid, so nothing can start exactly with it; fired without sync",
    ]);
  });

  it("makes the clip and ignores auto when the loops restart apart", async () => {
    const { log } = world({
      loops: [REFERENCE, { track: 2, length: 8, position: 5 }],
    });

    await createSynced();
    expect(log).toStrictEqual([]);
    expect(capturedWarnings()).toStrictEqual([
      "auto ignored: t0/s0 and t2/s0 loop out of step, so there is no one loop start to sync to; use play-session-clips to fire without sync",
    ]);
  });

  it("makes the clip and ignores auto when the loop start is too far off", async () => {
    const { log } = world({ loops: [{ track: 0, length: 128, position: 3 }] });

    await createSynced();
    expect(log).toStrictEqual([]);
    expect(capturedWarnings()).toStrictEqual([
      expect.stringContaining("auto ignored: t0/s0 next loops in 62.5s"),
    ]);
  });

  it("holds the wait to what the request deadline leaves", async () => {
    const { log } = world({ loops: [{ track: 0, length: 64, position: 3 }] });

    await createSynced({}, { deadline: Date.now() + 10_000 });

    expect(log).toStrictEqual([]);
    expect(capturedWarnings()).toStrictEqual([
      expect.stringContaining("auto ignored: t0/s0 next loops in 30.5s"),
    ]);
  });

  it("fires in sync with a deadline inside the margin when no wait is needed", async () => {
    const { log } = world();

    await createSynced({}, { deadline: Date.now() + 1000 });

    expect(log).toStrictEqual(SYNCED_FIRE);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  // The clip is made and fires, but not at the loop start: say so.
  it("warns when the transport stops while it waits", async () => {
    const synced = world(LATE_LOOP);
    const { log } = synced;

    stopTransportAfter(synced, 3);

    await createSynced();

    expect(log).toStrictEqual(["fire t1/s0"]);
    expect(capturedWarnings()).toStrictEqual([
      "auto: the loop start was missed; fired without sync",
    ]);
  });

  it("warns when the wait ran out of time", async () => {
    const synced = world(LATE_LOOP);
    const { log } = synced;

    slowDownAfter(synced, 5);

    // 3 s of waiting fits the 3.2 s the deadline leaves, until the tempo drops
    await createSynced({}, { deadline: Date.now() + 8200 });

    expect(log).toStrictEqual(["fire t1/s0"]);
    expect(capturedWarnings()).toStrictEqual([
      "auto: the loop start was missed; fired without sync",
    ]);
  });

  it("ignores auto, and still makes the clip, when the fire throws", async () => {
    const { log } = world({
      fires: [{ ...CLIP, throws: true }],
    });

    await createSynced();
    expect(log).toStrictEqual(SYNCED_FIRE);
    expect(capturedWarnings()).toStrictEqual(["auto ignored: fire failed"]);
  });

  it("turns a fire that throws after a wait into the same warning", async () => {
    world({
      songTime: 2,
      loops: [{ track: 0, length: 8, position: 0 }],
      fires: [{ ...CLIP, throws: true }],
    });

    await createSynced();
    expect(capturedWarnings()).toStrictEqual(["auto ignored: fire failed"]);
  });

  it("moves the focus once the clip has fired, not before the wait", async () => {
    const { select } = await import("#src/tools/session/select.ts");
    const { log } = world({
      songTime: 2,
      loops: [{ track: 0, length: 8, position: 0 }],
    });

    vi.mocked(select).mockImplementation(() => {
      log.push("select");

      return {};
    });

    await createSynced({ focus: true });

    expect(log.at(-1)).toBe("select");
    expect(log).toContain("fire t1/s0");
  });
});
