// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The one remainder look-up update-clip and duplicate share. Several landings
// can span one clip; each entry must name a piece of its own clip, or none —
// never another entry's clip or piece.

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  claimRemainders,
  nextLandingOrder,
  type LandedSpan,
  wholeLaneWrite,
} from "../clip-remainders.ts";

/**
 * Track 0's main lane holding these clips, each given as [start, end] in beats.
 * @param spans - Each clip's span, by id
 */
function registerLane(spans: Record<string, readonly [number, number]>): void {
  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  for (const [index, [id, [start, end]]] of Object.entries(spans).entries()) {
    registerMockObject(id, {
      path: livePath.track(0).arrangementClip(index),
      properties: { start_time: start, end_time: end },
    });
  }

  registerMockObject("track_0", {
    path: livePath.track(0),
    type: "Track",
    properties: { arrangement_clips: children(...Object.keys(spans)) },
  });
}

/**
 * Where a clip landed on track 0's main lane.
 * @param start - Where it started, in beats
 * @param end - Where it ended
 * @param order - When it landed; higher is later
 * @returns The landed span
 */
function span(start: number, end: number, order: number): LandedSpan {
  return { lane: { kind: "track", trackIndex: 0 }, start, end, order };
}

/**
 * Which clip id each gone entry was given.
 * @param gone - Where each gone entry's clip landed, by entry name
 * @param others - The call's other landings
 * @param taken - Ids other entries still name
 * @returns The id found per entry name
 */
function claimedIds(
  gone: Record<string, LandedSpan>,
  others: LandedSpan[] = [],
  taken: string[] = [],
): Record<string, string> {
  const found = claimRemainders({
    entries: Object.keys(gone),
    spanOf: (entry) => gone[entry],
    written: [...Object.values(gone), ...others],
    taken,
  });

  return Object.fromEntries(
    [...found].map(([entry, { clip }]) => [entry, clip.id]),
  );
}

describe("claimRemainders", () => {
  beforeEach(() => {
    clearMockRegistry();
    mockNonExistentObjects();
  });

  it("gives a clip two landings span to the one that landed later", () => {
    registerLane({ rest: [8, 32] });

    expect(
      claimedIds({ earlier: span(0, 32, 1), later: span(8, 32, 2) }),
    ).toStrictEqual({ later: "rest" });
  });

  it("passes over a clip another entry still names", () => {
    registerLane({ sibling: [8, 32] });

    expect(claimedIds({ gone: span(0, 32, 1) }, [], ["sibling"])).toStrictEqual(
      {},
    );
  });

  // "a" split by "b" landing inside it, then "c" took the front of both.
  it("gives each entry the piece of its own clip", () => {
    registerLane({ c: [0, 6], short: [6, 16], long: [16, 32] });

    expect(
      claimedIds(
        { a: span(0, 32, 1), b: span(4, 16, 2) },
        [span(0, 6, 3)],
        ["c"],
      ),
    ).toStrictEqual({ a: "long", b: "short" });
  });

  // A later landing cut the clip into pieces; which one the entry names.
  it.each([
    ["the piece ending where it landed", { a: [8, 12], b: [20, 32] }, "b"],
    ["else the earliest piece", { a: [20, 24], b: [12, 16] }, "b"],
  ] as const)("names %s", (_name, spans, expected) => {
    registerLane(spans);

    expect(claimedIds({ gone: span(0, 32, 1) })).toStrictEqual({
      gone: expected,
    });
  });

  it("leaves out a clip reaching past either end of the span", () => {
    registerLane({ before: [-4, 12], after: [28, 36] });

    expect(claimedIds({ gone: span(0, 32, 1) })).toStrictEqual({});
  });

  // A sibling landed inside this clip's span and was then split: the entry
  // names its front, and its tail must not pass for this clip's rest.
  it("never names a clip touching a span that landed later", () => {
    registerLane({ siblingFront: [4, 6], siblingTail: [8, 12] });

    expect(
      claimedIds({ gone: span(0, 16, 1) }, [span(4, 12, 2)], ["siblingFront"]),
    ).toStrictEqual({});
  });

  // A later write of unknown span could have cut anything on its lane.
  it("claims nothing for a landing older than a write of unknown span", () => {
    registerLane({ rest: [8, 32] });

    const unknown = {
      ...wholeLaneWrite({ kind: "track", trackIndex: 0 }),
      order: 2,
    };

    expect(claimedIds({ gone: span(0, 32, 1) }, [unknown])).toStrictEqual({});
    expect(claimedIds({ gone: span(0, 32, 3) }, [unknown])).toStrictEqual({
      gone: "rest",
    });
    expect(
      claimedIds({ gone: span(0, 32, 1) }, [
        { ...unknown, lane: { kind: "track", trackIndex: 1 } },
      ]),
    ).toStrictEqual({ gone: "rest" });
  });

  it("orders landings across calls to the counter", () => {
    expect(nextLandingOrder()).toBeLessThan(nextLandingOrder());
  });
});
