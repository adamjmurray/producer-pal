// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { type ClipMoves } from "#src/tools/clip/update/helpers/arrangement/update-clip-arrangement-overwrite-plan.ts";
import {
  type ArrangementMoveOrder,
  orderArrangementMoves,
} from "#src/tools/clip/update/helpers/arrangement/update-clip-move-order.ts";
import {
  type ClipReasons,
  newClipReasons,
} from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import { joinedClipReason } from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { type ClipPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  registerLaneRow,
  registerRow,
  type RowClip,
} from "./move-order-test-helpers.ts";

/**
 * Build the moves argument from per-clip destinations.
 * @param startBeatsById - Where each clip is headed, by clip id
 * @param destinationById - Lane destinations from toPath, by clip id
 * @param lengthBeatsById - Arrangement span each clip is resized to, by clip id
 * @returns The moves argument
 */
function moves(
  startBeatsById: Record<string, number | null>,
  destinationById?: Map<string, ClipPath>,
  lengthBeatsById?: Record<string, number>,
): ClipMoves {
  return {
    startBeatsFor: (clip) => startBeatsById[clip.id] ?? null,
    lengthBeatsFor: (clip) => lengthBeatsById?.[clip.id] ?? null,
    destinationById,
  };
}

/** A take-lane destination, spelled the way toPath resolves one. */
function lane(laneIndex: number, trackIndex = 0): ClipPath {
  return { kind: "take-lane", trackIndex, laneIndex };
}

/** What the clips had to say about the last ordering run here. */
let reasons: ClipReasons = newClipReasons();

/**
 * Order a call's moves, keeping what each clip had to say about its own.
 * @param clips - The clips to update, in call order
 * @param clipMoves - Where each clip is headed
 * @returns The processing order and the refused moves
 */
function orderMoves(
  clips: LiveAPI[],
  clipMoves: ClipMoves,
): ArrangementMoveOrder {
  reasons = newClipReasons();

  return orderArrangementMoves(clips, clipMoves, reasons);
}

const clipReason = (clipId: string): string =>
  joinedClipReason(reasons, clipId);

/**
 * Two adjacent 4-bar clips on t0, at 1|1 and 5|1.
 * @returns The clips as the update loop sees them
 */
function registerAdjacentPair(): LiveAPI[] {
  return registerRow([
    { id: "113", start: 0, end: 16 },
    { id: "114", start: 16, end: 32 },
  ]);
}

describe("orderArrangementMoves", () => {
  // Three 4-bar clips at 1|1, 5|1, 9|1.
  const row: RowClip[] = [
    { id: "113", start: 0, end: 16 },
    { id: "114", start: 16, end: 32 },
    { id: "115", start: 32, end: 48 },
  ];

  it("runs a row shifted later back-to-front", () => {
    const clips = registerRow(row);

    const { order, blockedIds } = orderMoves(
      clips,
      moves({ "113": 16, "114": 32, "115": 48 }),
    );

    expect(order).toStrictEqual([2, 1, 0]);
    expect(blockedIds).toStrictEqual(new Set());
  });

  it("leaves a row shifted earlier in call order", () => {
    const clips = registerRow([
      { id: "113", start: 16, end: 32 },
      { id: "114", start: 32, end: 48 },
      { id: "115", start: 48, end: 64 },
    ]);

    const { order, blockedIds } = orderMoves(
      clips,
      moves({ "113": 0, "114": 16, "115": 32 }),
    );

    expect(order).toStrictEqual([0, 1, 2]);
    expect(blockedIds).toStrictEqual(new Set());
  });

  it("blocks both moves when two clips trade positions", () => {
    const clips = registerAdjacentPair();

    const { blockedIds } = orderMoves(clips, moves({ "113": 16, "114": 0 }));

    expect(blockedIds).toStrictEqual(new Set(["113", "114"]));
    expect(clipReason("113")).toContain(
      "not moved: it would land on clip t0[5|1] (id 114)",
    );
    expect(clipReason("114")).toContain(
      "not moved: it would land on clip t0[1|1] (id 113)",
    );
  });

  // The clip behind the swap can never move either: the pair in its way stays.
  it("blocks a move waiting on a blocked one", () => {
    const clips = registerRow([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 16, end: 32 },
      { id: "115", start: 32, end: 48 },
    ]);

    const { blockedIds } = orderMoves(
      clips,
      moves({ "113": 16, "114": 0, "115": 0 }),
    );

    expect(blockedIds).toStrictEqual(new Set(["113", "114", "115"]));
  });

  it("keeps call order for clips landing on one position", () => {
    const clips = registerRow(row);

    const { order, blockedIds } = orderMoves(
      clips,
      moves({ "113": 64, "114": 64, "115": 64 }),
    );

    expect(order).toStrictEqual([0, 1, 2]);
    expect(blockedIds).toStrictEqual(new Set());
  });

  // Stacking one clip on another is what the caller asked for, and the survivor
  // plan decides which one wins it — so it's not a reason to reorder.
  it("keeps call order when a clip lands on the clip it stacks with", () => {
    const clips = registerRow(row);

    const { order } = orderMoves(clips, moves({ "113": 16, "114": 16 }));

    expect(order).toStrictEqual([0, 1, 2]);
  });

  it("ignores a clip with no track of its own", () => {
    registerMockObject("400", {
      properties: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: 16,
        end_time: 32,
      },
    });

    const clips = [
      ...registerRow([{ id: "113", start: 0, end: 16 }]),
      LiveAPI.from("id 400"),
    ];

    const { order } = orderMoves(clips, moves({ "113": 16, "400": 48 }));

    expect(order).toStrictEqual([0, 1]);
  });

  // The clip in the way isn't moving anywhere, so nothing can clear the span
  // for the mover — running the move would delete a clip the call reports as
  // updated. It still takes its turn, for its name, color and notes.
  it("refuses a move onto a clip the call leaves where it is", () => {
    const clips = registerRow([
      { id: "115", start: 32, end: 48 },
      { id: "114", start: 16, end: 32 },
    ]);

    const { order, blockedIds } = orderMoves(clips, moves({ "115": 16 }));

    expect(order).toStrictEqual([1, 0]);
    expect(blockedIds).toStrictEqual(new Set(["115"]));
    expect(clipReason("115")).toBe(
      "not moved: it would land on clip t0[5|1] (id 114), " +
        "which this call leaves where it is; move that clip out of the way too, " +
        "or use separate calls",
    );
  });

  // A short destination list pads the rest with nulls, so the clips past the
  // last one are sitting targets for the ones that did get a destination.
  it("refuses a move onto a clip the destination list ran out for", () => {
    const clips = registerAdjacentPair();
    const destinations = new Map<string, ClipPath>([
      ["113", { kind: "track", trackIndex: 0 }],
    ]);

    const { blockedIds } = orderMoves(
      clips,
      moves({ "113": 16 }, destinations),
    );

    expect(blockedIds).toStrictEqual(new Set(["113"]));
  });

  // moveIntent returns null for either destination the same way it does for a
  // clip going nowhere, but this clip does free its span: it is re-created at
  // the destination and the original deleted. Treating it as a permanent
  // occupant would refuse the move below for no reason.
  it.each<[string, ClipPath]>([
    ["a slot", { kind: "slot", trackIndex: 0, sceneIndex: 0 }],
    ["a take lane", lane(0)],
  ])(
    "lets a move follow a clip leaving the arrangement for %s",
    (_label, destination) => {
      const clips = registerRow([
        { id: "113", start: 0, end: 16 },
        { id: "114", start: 32, end: 48 },
      ]);
      const destinations = new Map<string, ClipPath>([["113", destination]]);

      const { order, blockedIds } = orderMoves(
        clips,
        moves({ "114": 0 }, destinations),
      );

      expect(order).toStrictEqual([0, 1]);
      expect(blockedIds).toStrictEqual(new Set());
    },
  );

  it("cascades across tracks", () => {
    const source = registerRow([{ id: "113", start: 0, end: 16 }], 0);
    const victim = registerRow([{ id: "114", start: 16, end: 32 }], 1);
    const clips = [...source, ...victim];
    const destinations = new Map<string, ClipPath>([
      ["113", { kind: "track", trackIndex: 1 }],
      ["114", { kind: "track", trackIndex: 1 }],
    ]);

    const { order } = orderMoves(
      clips,
      moves({ "113": 16, "114": 32 }, destinations),
    );

    expect(order).toStrictEqual([1, 0]);
  });

  // toPath with no position is "same place, other track", so the span it clears
  // is the one the clip already occupies.
  it("cascades from a lane change that keeps the clip's position", () => {
    const clips = [
      ...registerRow([{ id: "113", start: 16, end: 32 }], 0),
      ...registerRow([{ id: "114", start: 16, end: 32 }], 1),
    ];
    const destinations = new Map<string, ClipPath>([
      ["113", { kind: "track", trackIndex: 1 }],
    ]);

    const { order } = orderMoves(clips, moves({ "114": 32 }, destinations));

    expect(order).toStrictEqual([1, 0]);
  });

  it("ignores a slot destination", () => {
    const clips = registerRow(row);
    const destinations = new Map<string, ClipPath>([
      ["113", { kind: "slot", trackIndex: 0, sceneIndex: 0 }],
    ]);

    const { order } = orderMoves(clips, moves({ "113": 16 }, destinations));

    expect(order).toStrictEqual([0, 1, 2]);
  });

  // arrangementLength runs after the move, at the destination, and tiles across
  // the span it clears. Dropping these clips as movers switched the whole guard
  // off — one broadcast length covers every id, so nothing was left to order.
  it("still orders a row shifted later when the call also resizes it", () => {
    const clips = registerRow(row);

    const { order } = orderMoves(
      clips,
      moves({ "113": 16, "114": 32, "115": 48 }, undefined, {
        "113": 16,
        "114": 16,
        "115": 16,
      }),
    );

    expect(order).toStrictEqual([2, 1, 0]);
  });

  // Main lane to main lane, a shortened clip is cut down before it moves, so
  // its move clears only the new length.
  it("counts only the new length for a clip shortened on its way", () => {
    const clips = registerRow([
      { id: "113", start: 0, end: 16 },
      { id: "115", start: 40, end: 48 },
    ]);

    // 113 lands at 9|1 as 1 bar; 115 at 11|1 stays past its new end.
    const { blockedIds } = orderMoves(
      clips,
      moves({ "113": 32 }, undefined, { "113": 4 }),
    );

    expect(blockedIds).toStrictEqual(new Set());
  });

  it("counts the full length for a clip shortened on its way to a take lane", () => {
    const [main] = registerRow([{ id: "113", start: 0, end: 16 }]);
    const [onLane] = registerLaneRow([{ id: "115", start: 40, end: 48 }]);

    // A move onto a take lane re-creates the clip at its full length.
    const { blockedIds } = orderMoves(
      [main as LiveAPI, onLane as LiveAPI],
      moves({ "113": 32 }, new Map([["113", lane(0)]]), { "113": 4 }),
    );

    expect(blockedIds).toStrictEqual(new Set(["113"]));
  });

  it("refuses a resize that tiles over a clip staying put", () => {
    const clips = registerRow(row);

    // 113 stays at 1|1 but grows to 8 bars, which tiles over 114 at 5|1 — and
    // 114 is going nowhere, so nothing can clear that span first.
    const { blockedIds } = orderMoves(
      clips,
      moves({}, undefined, {
        "113": 32,
      }),
    );

    expect(blockedIds).toStrictEqual(new Set(["113"]));
    expect(clipReason("113")).toContain(
      "not moved or resized: it would land on " +
        "clip t0[5|1] (id 114), which this call leaves where it is",
    );
  });

  it("counts a slot destination the call will ignore for a resize", () => {
    const clips = registerRow(row);
    const destinations = new Map<string, ClipPath>([
      ["113", { kind: "slot", trackIndex: 0, sceneIndex: 0 }],
    ]);

    // update-clip warns the slot is ignored and tiles the clip where it is, so
    // the span it clears still runs over 114 — and the slot doesn't free 113's
    // own span either, so 114 has nothing to wait behind.
    const { blockedIds } = orderMoves(
      clips,
      moves({}, destinations, { "113": 32 }),
    );

    expect(blockedIds).toStrictEqual(new Set(["113"]));
  });

  it("refuses the resize too when it refuses the move", () => {
    const clips = registerAdjacentPair();

    const { blockedIds } = orderMoves(
      clips,
      moves({ "113": 16, "114": 0 }, undefined, { "113": 32 }),
    );

    expect(blockedIds).toStrictEqual(new Set(["113", "114"]));
    expect(clipReason("113")).toContain("not moved or resized:");
    expect(clipReason("114")).toContain("not moved:");
  });

  it("ignores a session clip in the batch", () => {
    registerMockObject("200", {
      path: livePath.track(0).clipSlot(0).clip(),
      properties: { is_arrangement_clip: 0 },
    });

    const clips = [
      ...registerRow([{ id: "114", start: 16, end: 32 }]),
      LiveAPI.from("id 200"),
    ];

    const { order } = orderMoves(clips, moves({ "114": 16, "200": 16 }));

    expect(order).toStrictEqual([0, 1]);
  });

  // A take lane is its own lane, so the main-lane move lands beside the
  // take-lane clip rather than on top of it.
  it("keeps clips on different lanes out of each other's way", () => {
    const clips = [
      ...registerRow([{ id: "113", start: 0, end: 16 }]),
      ...registerLaneRow([{ id: "313", start: 16, end: 32 }]),
    ];

    const { order, blockedIds } = orderMoves(
      clips,
      moves({ "113": 16, "313": 48 }, new Map([["313", lane(0)]])),
    );

    expect(order).toStrictEqual([0, 1]);
    expect(blockedIds).toStrictEqual(new Set());
  });

  // The take-lane row move: each create wipes the range it writes to, so
  // running these in call order deletes the second clip outright.
  it("runs a take-lane row shifted later back-to-front", () => {
    const clips = registerLaneRow([
      { id: "313", start: 0, end: 16 },
      { id: "314", start: 16, end: 32 },
    ]);
    const destinations = new Map([
      ["313", lane(0)],
      ["314", lane(0)],
    ]);

    const { order, blockedIds } = orderMoves(
      clips,
      moves({ "313": 16, "314": 32 }, destinations),
    );

    expect(order).toStrictEqual([1, 0]);
    expect(blockedIds).toStrictEqual(new Set());
  });

  it("waits for the clip sitting on the take lane it moves onto", () => {
    const clips = [
      ...registerLaneRow([{ id: "313", start: 0, end: 16 }], 0),
      ...registerLaneRow([{ id: "314", start: 0, end: 16 }], 1),
    ];
    const destinations = new Map([
      ["313", lane(1)],
      ["314", lane(1)],
    ]);

    const { order } = orderMoves(
      clips,
      moves({ "313": 0, "314": 16 }, destinations),
    );

    expect(order).toStrictEqual([1, 0]);
  });

  // A promote re-creates the clip on the main lane, clearing the range there.
  it("waits for the main-lane clip a promote lands on", () => {
    const clips = [
      ...registerLaneRow([{ id: "313", start: 0, end: 16 }]),
      ...registerRow([{ id: "114", start: 0, end: 16 }]),
    ];
    const destinations = new Map<string, ClipPath>([
      ["313", { kind: "track", trackIndex: 0 }],
    ]);

    const { order } = orderMoves(
      clips,
      moves({ "313": 0, "114": 16 }, destinations),
    );

    expect(order).toStrictEqual([1, 0]);
  });

  it("waits for the take-lane clip a main-lane move lands on", () => {
    const clips = [
      ...registerRow([{ id: "113", start: 0, end: 16 }]),
      ...registerLaneRow([{ id: "313", start: 0, end: 16 }]),
    ];
    const destinations = new Map([
      ["113", lane(0)],
      ["313", lane(0)],
    ]);

    const { order } = orderMoves(
      clips,
      moves({ "113": 0, "313": 16 }, destinations),
    );

    expect(order).toStrictEqual([1, 0]);
  });

  it("refuses a take-lane move onto a clip the call leaves where it is", () => {
    const clips = registerLaneRow([
      { id: "313", start: 32, end: 48 },
      { id: "314", start: 16, end: 32 },
    ]);

    const { blockedIds } = orderMoves(
      clips,
      moves({ "313": 16 }, new Map([["313", lane(0)]])),
    );

    expect(blockedIds).toStrictEqual(new Set(["313"]));
    expect(clipReason("313")).toContain(
      "not moved: it would land on clip t0/l0[5|1] (id 314)",
    );
  });

  it("asks Live nothing when the call moves no clip", () => {
    const clips = registerRow(row);
    const spies = clips.map((clip) => vi.spyOn(clip, "getProperty"));

    const { order } = orderMoves(clips, moves({}));

    expect(order).toStrictEqual([0, 1, 2]);

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});
