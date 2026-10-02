// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  arrangementLaneOf,
  type ClipSpan,
  describeWriteEffects,
} from "../arrangement-write-effects.ts";

const LANE = { kind: "track", trackIndex: 0 } as const;

/**
 * @param id - The clip's id
 * @param start - Where it begins, in beats
 * @param end - Where it ends, in beats
 * @returns The span
 */
function span(id: string, start: number, end: number): ClipSpan {
  return { id, start, end };
}

describe("arrangementLaneOf", () => {
  it("names the main lane for a destination with no take lane", () => {
    expect(arrangementLaneOf({ trackIndex: 2, takeLane: null })).toStrictEqual({
      kind: "track",
      trackIndex: 2,
    });
  });

  it("names the take lane a destination landed on", () => {
    expect(arrangementLaneOf({ trackIndex: 2, takeLane: 1 })).toStrictEqual({
      kind: "take-lane",
      trackIndex: 2,
      laneIndex: 1,
    });
  });
});

describe("describeWriteEffects", () => {
  it("says nothing when every clip is as it was", () => {
    const a = span("a", 0, 8);

    expect(
      describeWriteEffects(LANE, [a], new Map([["a", a]]), []),
    ).toBeUndefined();
  });

  it("names a clip that is gone, at the address it had", () => {
    expect(describeWriteEffects(LANE, [span("a", 12, 20)], new Map(), [])).toBe(
      "overwrote the clip at t0[4|1]",
    );
  });

  // Front trimming moves the start, so the clip answers to a new address.
  it("names a trimmed clip where it sits now", () => {
    expect(
      describeWriteEffects(
        LANE,
        [span("a", 8, 24)],
        new Map([["a", span("a", 16, 24)]]),
        [],
      ),
    ).toBe("shortened the clip at t0[5|1]");
  });

  // A write starting where a clip starts re-creates its rest under a new id.
  it("names the rest of a clip re-created under a new id", () => {
    expect(
      describeWriteEffects(LANE, [span("a", 8, 24)], new Map(), [
        span("rest", 16, 24),
      ]),
    ).toBe("shortened the clip at t0[5|1]");
  });

  // A new clip that isn't the written one, inside the old span, is the tail.
  it("names both pieces of a split clip", () => {
    expect(
      describeWriteEffects(
        LANE,
        [span("a", 0, 32)],
        new Map([["a", span("a", 0, 12)]]),
        [span("tail", 16, 32)],
      ),
    ).toBe("split the clip at t0[1|1] into t0[1|1] and t0[5|1]");
  });

  it("ignores a new clip outside the old span", () => {
    expect(
      describeWriteEffects(
        LANE,
        [span("a", 0, 8)],
        new Map([["a", span("a", 0, 8)]]),
        [span("tail", 16, 32)],
      ),
    ).toBeUndefined();
  });

  it("joins what it did to several clips", () => {
    expect(
      describeWriteEffects(
        LANE,
        [span("a", 0, 16), span("b", 16, 24)],
        new Map([["a", span("a", 0, 8)]]),
        [],
      ),
    ).toBe("shortened the clip at t0[1|1]; overwrote the clip at t0[5|1]");
  });
});
