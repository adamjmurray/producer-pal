// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { newLandingLog, recordLandedClip } from "../landing-log.ts";
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
