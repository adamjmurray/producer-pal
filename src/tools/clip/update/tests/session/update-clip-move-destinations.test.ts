// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { type ClipPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { resolveMoveDestinations } from "../../helpers/move/move-destinations.ts";

describe("resolveMoveDestinations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The lanes alone: the positions half of the return value has its own tests.
  const moveLanes = (
    toPath: string | undefined,
    toSlot: string | undefined,
    clipCount: number,
  ): Array<ClipPath | null> =>
    resolveMoveDestinations(toPath, toSlot, clipCount).destinations;

  it("reads a slot from toPath", () => {
    expect(moveLanes("t2/s3", undefined, 1)).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
    ]);
  });

  it("reads an arrangement lane from toPath", () => {
    expect(moveLanes("t2,t4/l0,t6/l1", undefined, 3)).toStrictEqual([
      { kind: "track", trackIndex: 2 },
      { kind: "take-lane", trackIndex: 4, laneIndex: 0 },
      { kind: "take-lane", trackIndex: 6, laneIndex: 1 },
    ]);
  });

  it("still reads the deprecated toSlot", () => {
    expect(moveLanes(undefined, "2/3", 1)).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
    ]);
  });

  it("returns nothing when neither param is given", () => {
    expect(moveLanes(undefined, undefined, 2)).toStrictEqual([null, null]);
    expect(moveLanes("  ", undefined, 1)).toStrictEqual([null]);
    expect(moveLanes(undefined, "  ", 1)).toStrictEqual([null]);
  });

  it("refuses when toPath and toSlot both name a destination", () => {
    // Nothing has run yet, so the whole call is refused rather than moving
    // nowhere while the rest of the update succeeds.
    expect(() => moveLanes("t2/s3", "4/5", 1)).toThrow(
      "toPath and toSlot both name a destination; use toPath alone (toSlot is deprecated)",
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });

  // A toSlot of "," names no second destination, so it is not a conflict: the
  // move the caller asked for once still happens.
  it("moves to toPath when toSlot names nothing", () => {
    expect(moveLanes("t2/s3", ",", 1)).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
    ]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining('toSlot "," names nothing'),
    );
  });

  it("reports a destination no clip can occupy on the clip's entry", () => {
    // A scene names no track, so there is no one place the clip would go.
    const moves = resolveMoveDestinations("s3", undefined, 1);

    expect(moves.destinations).toStrictEqual([null]);
    expect(moves.refusals[0]).toContain("a scene alone names no track");
    expect(capturedWarnings()).toStrictEqual([]);
  });

  // The whole point of the fan-out: sending both clips to destinations[0] put
  // them in one slot, and the second copy overwrote the first.
  it("pairs each destination with the clip at the same position", () => {
    expect(moveLanes("t2/s3,t4/s5", undefined, 2)).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
      { kind: "slot", trackIndex: 4, sceneIndex: 5 },
    ]);
  });

  // A single name or color covers every clip; a single destination can't — the
  // second clip sent to a slot overwrites the first.
  it("does not spread a short destination list, and says which clips stayed", () => {
    expect(moveLanes("t2/s3", undefined, 3)).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
      null,
      null,
    ]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("1 destination for 3 clips"),
    );
  });

  it("warns about destinations with no clip to move", () => {
    expect(moveLanes("t2/s3,t4/s5", undefined, 1)).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
    ]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("the extra destinations went unused"),
    );
  });

  it("skips only the entries no clip can occupy", () => {
    expect(moveLanes("t2/s3,s4,t6/s7", undefined, 3)).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
      null,
      { kind: "slot", trackIndex: 6, sceneIndex: 7 },
    ]);
  });

  it("skips only the entry that won't parse", () => {
    // Regression: the whole list was parsed at once and one throw discarded all
    // of it, so a typo cost every move — while an entry that parsed but named
    // the wrong kind of place cost only its own. Which one you got depended on
    // nothing but which side of the grammar the typo fell on.
    const moves = resolveMoveDestinations("t2/s3,tX,t6/s7", undefined, 3);

    expect(moves.destinations).toStrictEqual([
      { kind: "slot", trackIndex: 2, sceneIndex: 3 },
      null,
      { kind: "slot", trackIndex: 6, sceneIndex: 7 },
    ]);
    // Only the bad entry's own clip hears about it.
    expect(moves.refusals[0]).toBeNull();
    expect(moves.refusals[1]).toContain("not moved:");
    expect(moves.refusals[2]).toBeNull();
  });

  it("moves no clip when toPath names nothing at all", () => {
    // Not the same as one bad entry: "," says a destination was meant and
    // failed to arrive, and moving a clip anywhere else is the wrong guess.
    expect(moveLanes(",", undefined, 2)).toStrictEqual([null, null]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("it names nothing"),
    );
  });
});
