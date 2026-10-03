// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  newLandingLog,
  recordLandedClip,
  recordResize,
} from "../landing-log.ts";
import {
  type ClearedClipEntry,
  reportClearedClips,
} from "../report-cleared-clips.ts";

const MAIN_LANE = { trackIndex: 0, takeLane: null };

/**
 * Two clips the call landed one after the other, 12 and 8 beats long, the
 * second starting inside the first, then the read-back over both. `end` is
 * where Live left the first one's end once the second landed.
 * @param end - The first clip's end now, in beats
 * @param said - Whether the first entry already says it was cut short
 * @returns The two entries, once reported on
 */
function reportTwo(
  end: number,
  said = false,
): { first: ClearedClipEntry; second: ClearedClipEntry } {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
  registerMockObject("first", {
    path: livePath.track(0).arrangementClip(0),
    type: "Clip",
    properties: { start_time: 16, end_time: end },
  });
  registerMockObject("second", {
    path: livePath.track(0).arrangementClip(1),
    type: "Clip",
    properties: { start_time: 24, end_time: 32 },
  });

  const log = newLandingLog();
  const first: ClearedClipEntry = { id: "first", path: "t0[5|1]" };
  const second: ClearedClipEntry = { id: "second", path: "t0[7|1]" };

  recordLandedClip(log, MAIN_LANE, 16, { id: "first", length: 12 });
  recordLandedClip(log, MAIN_LANE, 24, { id: "second", length: 8 });
  reportClearedClips({
    written: [
      { entry: first, said },
      { entry: second, said: false },
    ],
    spanOf: (entry) => log.landed.get(entry.id as string),
    log,
  });

  return { first, second };
}

describe("reportClearedClips - a clip a later write cut the tail off", () => {
  it("says it was shortened, and how long it is now", () => {
    const { first, second } = reportTwo(24);

    expect(first).toStrictEqual({
      id: "first",
      path: "t0[5|1]",
      arrangementLength: "2bar",
      detail: "shortened by t0[7|1] later in this call",
    });
    expect(second).toStrictEqual({ id: "second", path: "t0[7|1]" });
  });

  it("leaves a clip that still ends where it landed alone", () => {
    expect(reportTwo(28).first).toStrictEqual({
      id: "first",
      path: "t0[5|1]",
    });
  });

  it("doesn't say it again for an entry that already says so", () => {
    expect(reportTwo(24, true).first).toStrictEqual({
      id: "first",
      path: "t0[5|1]",
    });
  });
});

describe("reportClearedClips - a clip that ends sooner with no later write", () => {
  /**
   * A 16-beat clip lengthened by tiles: Live left the first tile 12 beats
   * long, and the tiles went in past its landed end. Nothing was written over
   * its span.
   * @param unnamed - Whether a later write that can't be named follows
   * @returns The first clip's entry, once reported on
   */
  function reportLengthened(unnamed = false): ClearedClipEntry {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    registerMockObject("tile", {
      path: livePath.track(0).arrangementClip(0),
      type: "Clip",
      properties: { start_time: 16, end_time: 28 },
    });
    registerMockObject("whole", {
      path: livePath.track(0).arrangementClip(1),
      type: "Clip",
      properties: { start_time: 16, end_time: 32 },
    });
    registerMockObject("other", {
      path: livePath.track(1).arrangementClip(0),
      type: "Clip",
      properties: { start_time: 0, end_time: 8 },
    });

    const log = newLandingLog();
    const tile: ClearedClipEntry = { id: "tile", path: "t0[5|1]" };
    const other: ClearedClipEntry = { id: "other", path: "t1[1|1]" };

    recordLandedClip(log, MAIN_LANE, 16, { id: "tile", length: 16 });
    recordResize(log, LiveAPI.from("whole"), 48);

    if (unnamed) {
      recordLandedClip(log, MAIN_LANE, 20, { id: "x", length: null });
    }

    recordLandedClip(log, { trackIndex: 1, takeLane: null }, 0, {
      id: "other",
      length: 8,
    });
    reportClearedClips({
      written: [
        { entry: tile, said: false },
        { entry: other, said: false },
      ],
      spanOf: (entry) => log.landed.get(entry.id as string),
      log,
    });

    return tile;
  }

  it("says nothing of a first tile cut to a whole loop", () => {
    expect(reportLengthened()).toStrictEqual({ id: "tile", path: "t0[5|1]" });
  });

  it("still says a clip was cut when a write that can't be named reached it", () => {
    expect(reportLengthened(true)).toStrictEqual({
      id: "tile",
      path: "t0[5|1]",
      arrangementLength: "3bar",
      detail: "shortened later in this call",
    });
  });
});
