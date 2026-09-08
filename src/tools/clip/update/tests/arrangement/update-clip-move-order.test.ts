// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  lookupMockObject,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type ClipMoves } from "#src/tools/clip/update/helpers/arrangement/update-clip-arrangement-optimizer.ts";
import { orderArrangementMoves } from "#src/tools/clip/update/helpers/arrangement/update-clip-move-order.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { type ClipPath } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";

/** One clip in a row, and where the call sends it. */
interface RowClip {
  id: string;
  /** Start in beats */
  start: number;
  /** End in beats */
  end: number;
}

const BAR = 4;

/**
 * Register an arrangement MIDI clip on a track's main lane.
 * @param clipId - Clip id
 * @param trackIndex - The track it sits on
 * @param clipIndex - Its position in arrangement_clips
 * @param start - Start in beats
 * @param end - End in beats
 * @returns The registered mock
 */
function registerArrangementClip(
  clipId: string,
  trackIndex: number,
  clipIndex: number,
  start: number,
  end: number,
): RegisteredMockObject {
  return registerMockObject(clipId, {
    path: livePath.track(trackIndex).arrangementClip(clipIndex),
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      is_midi_clip: 1,
      start_time: start,
      end_time: end,
      signature_numerator: 4,
      signature_denominator: 4,
    },
  });
}

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

/**
 * Register a row of clips on one track and hand back their LiveAPI handles.
 * @param row - The clips, in call order
 * @param trackIndex - The track they sit on
 * @returns The clips as the update loop sees them
 */
function registerRow(row: RowClip[], trackIndex = 0): LiveAPI[] {
  return row.map((clip, index) => {
    registerArrangementClip(clip.id, trackIndex, index, clip.start, clip.end);

    return LiveAPI.from(`id ${clip.id}`);
  });
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

    const { order, blockedIds } = orderArrangementMoves(
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

    const { order, blockedIds } = orderArrangementMoves(
      clips,
      moves({ "113": 0, "114": 16, "115": 32 }),
    );

    expect(order).toStrictEqual([0, 1, 2]);
    expect(blockedIds).toStrictEqual(new Set());
  });

  it("blocks both moves when two clips trade positions", () => {
    const clips = registerRow([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 16, end: 32 },
    ]);

    const { blockedIds } = orderArrangementMoves(
      clips,
      moves({ "113": 16, "114": 0 }),
    );

    expect(blockedIds).toStrictEqual(new Set(["113", "114"]));
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        "clip t0[1|1] (id 113) was not moved: it would land on clip t0[5|1] (id 114)",
      ),
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        "clip t0[5|1] (id 114) was not moved: it would land on clip t0[1|1] (id 113)",
      ),
    );
  });

  // The clip behind the swap can never move either: the pair in its way stays.
  it("blocks a move waiting on a blocked one", () => {
    const clips = registerRow([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 16, end: 32 },
      { id: "115", start: 32, end: 48 },
    ]);

    const { blockedIds } = orderArrangementMoves(
      clips,
      moves({ "113": 16, "114": 0, "115": 0 }),
    );

    expect(blockedIds).toStrictEqual(new Set(["113", "114", "115"]));
  });

  it("keeps call order for clips landing on one position", () => {
    const clips = registerRow(row);

    const { order, blockedIds } = orderArrangementMoves(
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

    const { order } = orderArrangementMoves(
      clips,
      moves({ "113": 16, "114": 16 }),
    );

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

    const { order } = orderArrangementMoves(
      clips,
      moves({ "113": 16, "400": 48 }),
    );

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

    const { order, blockedIds } = orderArrangementMoves(
      clips,
      moves({ "115": 16 }),
    );

    expect(order).toStrictEqual([1, 0]);
    expect(blockedIds).toStrictEqual(new Set(["115"]));
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        "clip t0[9|1] (id 115) was not moved: it would land on clip t0[5|1] (id 114), " +
          "which this call leaves where it is; move that clip out of the way too, " +
          "or use separate calls",
      ),
    );
  });

  // A short destination list pads the rest with nulls, so the clips past the
  // last one are sitting targets for the ones that did get a destination.
  it("refuses a move onto a clip the destination list ran out for", () => {
    const clips = registerRow([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 16, end: 32 },
    ]);
    const destinations = new Map<string, ClipPath>([
      ["113", { kind: "track", trackIndex: 0 }],
    ]);

    const { blockedIds } = orderArrangementMoves(
      clips,
      moves({ "113": 16 }, destinations),
    );

    expect(blockedIds).toStrictEqual(new Set(["113"]));
  });

  // moveIntent returns null for a slot destination the same way it does for a
  // clip going nowhere, but this clip does free its span: it is re-created in
  // the slot and the original deleted. Treating it as a permanent occupant
  // would refuse the move below for no reason.
  it("lets a move follow a clip leaving the arrangement for a slot", () => {
    const clips = registerRow([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 32, end: 48 },
    ]);
    const destinations = new Map<string, ClipPath>([
      ["113", { kind: "slot", trackIndex: 0, sceneIndex: 0 }],
    ]);

    const { order, blockedIds } = orderArrangementMoves(
      clips,
      moves({ "114": 0 }, destinations),
    );

    expect(order).toStrictEqual([0, 1]);
    expect(blockedIds).toStrictEqual(new Set());
  });

  it("lets a move follow a clip leaving for a take lane", () => {
    const clips = registerRow([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 32, end: 48 },
    ]);
    const destinations = new Map<string, ClipPath>([
      ["113", { kind: "take-lane", trackIndex: 0, laneIndex: 0 }],
    ]);

    const { order, blockedIds } = orderArrangementMoves(
      clips,
      moves({ "114": 0 }, destinations),
    );

    expect(order).toStrictEqual([0, 1]);
    expect(blockedIds).toStrictEqual(new Set());
  });

  it("cascades across tracks", () => {
    const source = registerRow([{ id: "113", start: 0, end: 16 }], 0);
    const victim = registerRow([{ id: "114", start: 16, end: 32 }], 1);
    const clips = [...source, ...victim];
    const destinations = new Map<string, ClipPath>([
      ["113", { kind: "track", trackIndex: 1 }],
      ["114", { kind: "track", trackIndex: 1 }],
    ]);

    const { order } = orderArrangementMoves(
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

    const { order } = orderArrangementMoves(
      clips,
      moves({ "114": 32 }, destinations),
    );

    expect(order).toStrictEqual([1, 0]);
  });

  it("ignores a slot destination", () => {
    const clips = registerRow(row);
    const destinations = new Map<string, ClipPath>([
      ["113", { kind: "slot", trackIndex: 0, sceneIndex: 0 }],
    ]);

    const { order } = orderArrangementMoves(
      clips,
      moves({ "113": 16 }, destinations),
    );

    expect(order).toStrictEqual([0, 1, 2]);
  });

  // arrangementLength runs after the move, at the destination, and tiles across
  // the span it clears. Dropping these clips as movers switched the whole guard
  // off — one broadcast length covers every id, so nothing was left to order.
  it("still orders a row shifted later when the call also resizes it", () => {
    const clips = registerRow(row);

    const { order } = orderArrangementMoves(
      clips,
      moves({ "113": 16, "114": 32, "115": 48 }, undefined, {
        "113": 16,
        "114": 16,
        "115": 16,
      }),
    );

    expect(order).toStrictEqual([2, 1, 0]);
  });

  it("refuses a resize that tiles over a clip staying put", () => {
    const clips = registerRow(row);

    // 113 stays at 1|1 but grows to 8 bars, which tiles over 114 at 5|1 — and
    // 114 is going nowhere, so nothing can clear that span first.
    const { blockedIds } = orderArrangementMoves(
      clips,
      moves({}, undefined, {
        "113": 32,
      }),
    );

    expect(blockedIds).toStrictEqual(new Set(["113"]));
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        "clip t0[1|1] (id 113) was not moved or resized: it would land on " +
          "clip t0[5|1] (id 114), which this call leaves where it is",
      ),
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
    const { blockedIds } = orderArrangementMoves(
      clips,
      moves({}, destinations, { "113": 32 }),
    );

    expect(blockedIds).toStrictEqual(new Set(["113"]));
  });

  it("refuses the resize too when it refuses the move", () => {
    const clips = registerRow([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 16, end: 32 },
    ]);

    const { blockedIds } = orderArrangementMoves(
      clips,
      moves({ "113": 16, "114": 0 }, undefined, { "113": 32 }),
    );

    expect(blockedIds).toStrictEqual(new Set(["113", "114"]));
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        "clip t0[1|1] (id 113) was not moved or resized:",
      ),
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("clip t0[5|1] (id 114) was not moved:"),
    );
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

    const { order } = orderArrangementMoves(
      clips,
      moves({ "114": 16, "200": 16 }),
    );

    expect(order).toStrictEqual([0, 1]);
  });

  it("ignores a take-lane clip in the batch", () => {
    registerMockObject("300", {
      path: livePath.track(0).takeLane(0).arrangementClip(0),
      properties: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: 16,
        end_time: 32,
      },
    });

    const clips = [
      ...registerRow([{ id: "113", start: 0, end: 16 }]),
      LiveAPI.from("id 300"),
    ];

    const { order } = orderArrangementMoves(
      clips,
      moves({ "113": 16, "300": 48 }),
    );

    expect(order).toStrictEqual([0, 1]);
  });

  it("asks Live nothing when the call moves no clip", () => {
    const clips = registerRow(row);
    const spies = clips.map((clip) => vi.spyOn(clip, "getProperty"));

    const { order } = orderArrangementMoves(clips, moves({}));

    expect(order).toStrictEqual([0, 1, 2]);

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("updateClip - moving a row of arrangement clips", () => {
  let copies: string[];
  let track: RegisteredMockObject;

  /**
   * A row of 4-bar clips on t0, with the copies Live hands back for each move.
   * @param row - The clips, in call order
   */
  function setupTrack(row: RowClip[]): void {
    registerMockObject("live-set", { path: "live_set", type: "Song" });
    registerRow(row);
    copies = [];

    let copyCount = 0;

    track = registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { track_index: 0, has_midi_input: 1, is_frozen: 0 },
      methods: {
        duplicate_clip_to_arrangement: (_sourceId, startTime) => {
          copyCount += 1;

          const copyId = `9${String(copyCount)}`;

          copies.push(copyId);
          registerArrangementClip(
            copyId,
            0,
            row.length + copyCount,
            startTime as number,
            (startTime as number) + 4 * BAR,
          );

          return `id ${copyId}`;
        },
        create_midi_clip: () => "id temp",
        delete_clip: () => null,
      },
    });
  }

  /**
   * Every position the track took a move at, in call order.
   * @returns The target positions in beats
   */
  function movedTo(): number[] {
    return vi
      .mocked(track.call)
      .mock.calls.filter(
        ([method]) => method === "duplicate_clip_to_arrangement",
      )
      .map((call) => call[2] as number);
  }

  beforeEach(() => {
    setupTrack([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 16, end: 32 },
      { id: "115", start: 32, end: 48 },
    ]);
  });

  it("keeps every clip when a row shifts four bars later", async () => {
    const result = await updateClip({
      id: "113,114,115",
      toPath: "t0[5|1],t0[9|1],t0[13|1]",
    });

    // Back-to-front, so no move clears a clip the loop has yet to reach.
    expect(movedTo()).toStrictEqual([48, 32, 16]);
    // The response still pairs 1:1 with the ids the caller named.
    expect(result).toStrictEqual([
      { id: copies[2], path: "t0[5|1]" },
      { id: copies[1], path: "t0[9|1]" },
      { id: copies[0], path: "t0[13|1]" },
    ]);
    // The middle clip used to be cleared before its turn, and the dead object
    // read as a session clip.
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("session clip"),
    );
  });

  // arrangementLength broadcasts, so one value covers every id. Reading it as
  // "these clips aren't moving" switched the ordering off for the whole batch
  // and the row-move loss came straight back.
  it("keeps every clip when the row shift also sets a length", async () => {
    const result = await updateClip({
      id: "113,114,115",
      toPath: "t0[5|1],t0[9|1],t0[13|1]",
      arrangementLength: "4bar",
    });

    expect(movedTo().slice(0, 3)).toStrictEqual([48, 32, 16]);
    expect(result).toStrictEqual([
      { id: copies[2], path: "t0[5|1]" },
      { id: copies[1], path: "t0[9|1]" },
      { id: copies[0], path: "t0[13|1]" },
    ]);
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("session clip"),
    );
  });

  it("keeps a row shifting four bars earlier working", async () => {
    setupTrack([
      { id: "113", start: 16, end: 32 },
      { id: "114", start: 32, end: 48 },
      { id: "115", start: 48, end: 64 },
    ]);

    const result = await updateClip({
      id: "113,114,115",
      toPath: "t0[1|1],t0[5|1],t0[9|1]",
    });

    expect(movedTo()).toStrictEqual([0, 16, 32]);
    expect(result).toStrictEqual([
      { id: copies[0], path: "t0[1|1]" },
      { id: copies[1], path: "t0[5|1]" },
      { id: copies[2], path: "t0[9|1]" },
    ]);
  });

  it("refuses both moves when two clips trade positions", async () => {
    const result = await updateClip({
      id: "113,114",
      toPath: "t0[5|1],t0[1|1]",
    });

    expect(movedTo()).toStrictEqual([]);
    // Each clip is reported where it still is.
    expect(result).toStrictEqual([
      { id: "113", path: "t0[1|1]" },
      { id: "114", path: "t0[5|1]" },
    ]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        "clip t0[1|1] (id 113) was not moved: it would land on clip t0[5|1] (id 114), " +
          "which this call can't move out of the way first",
      ),
    );
  });

  // The first id's toPath doesn't parse, so that clip goes nowhere — and the
  // second one's destination is the span it is sitting in.
  it("keeps a clip whose toPath entry didn't parse", async () => {
    const result = await updateClip({
      id: "113,114",
      toPath: "not-a-real-path,t0[1|1]",
    });

    expect(movedTo()).toStrictEqual([]);
    expect(result).toStrictEqual([
      { id: "113", path: "t0[1|1]" },
      { id: "114", path: "t0[5|1]" },
    ]);
  });

  // One destination for two clips pads the second with null, leaving it parked
  // on the span the first one is moving into.
  it("keeps a clip past the end of a short destination list", async () => {
    const result = await updateClip({ id: "114,113", toPath: "t0[1|1]" });

    expect(movedTo()).toStrictEqual([]);
    expect(result).toStrictEqual([
      { id: "114", path: "t0[5|1]" },
      { id: "113", path: "t0[1|1]" },
    ]);
  });

  it("refuses a swap written as arrangementStart too", async () => {
    await updateClip({ id: "113,114", arrangementStart: "5|1,1|1" });

    expect(movedTo()).toStrictEqual([]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("was not moved"),
    );
  });
});

describe("updateClip - a move Live turns down at write time", () => {
  /** Registered as audio, so a MIDI clip sent there is refused on arrival. */
  const AUDIO_TRACK = 1;

  /**
   * A row of clips on t0, plus an audio track for the moves that get refused.
   * @param row - The clips, in call order
   */
  function setupRefusingTrack(row: RowClip[]): void {
    registerMockObject("live-set", { path: "live_set", type: "Song" });
    registerRow(row);
    registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { track_index: 0, has_midi_input: 1, is_frozen: 0 },
      methods: {
        duplicate_clip_to_arrangement: (_sourceId, startTime) => {
          registerArrangementClip(
            "copy",
            0,
            row.length,
            startTime as number,
            0,
          );

          return "id copy";
        },
        delete_clip: () => null,
      },
    });
    registerMockObject("track-1", {
      path: livePath.track(AUDIO_TRACK),
      type: "Track",
      properties: {
        track_index: AUDIO_TRACK,
        has_midi_input: 0,
        is_frozen: 0,
      },
    });
  }

  /**
   * Every position t0 took a move at.
   * @returns The target positions in beats
   */
  function movedTo(): number[] {
    return vi
      .mocked(lookupMockObject("track-0")?.call as Mock)
      .mock.calls.filter(
        ([method]) => method === "duplicate_clip_to_arrangement",
      )
      .map((call) => call[2] as number);
  }

  // The planner puts 114 first because 113 is moving onto its span, and trusts
  // the declared move to clear it. Live refuses that move, so the span never
  // comes free and 113's move has to be called off — or it runs over a clip
  // that is still sitting there and the call reports both as updated.
  it("calls off the move that was waiting on it", async () => {
    setupRefusingTrack([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 16, end: 32 },
    ]);

    const result = await updateClip({
      id: "113,114",
      toPath: `t0[5|1],t${AUDIO_TRACK}[9|1]`,
    });

    expect(movedTo()).toStrictEqual([]);
    expect(result).toStrictEqual([
      { id: "113", path: "t0[1|1]" },
      { id: "114", path: "t0[5|1]" },
    ]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        "clip t0[1|1] (id 113) was not moved: it would land on clip t0[5|1] (id 114), which Live wouldn't move",
      ),
    );
  });

  // A clip called off here didn't vacate either, so whatever was waiting on it
  // has to go too — a sweep over the graph, not one hop.
  it("calls off the moves waiting behind that one", async () => {
    setupRefusingTrack([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 16, end: 32 },
      { id: "115", start: 32, end: 48 },
    ]);

    const result = await updateClip({
      id: "113,114,115",
      toPath: `t0[5|1],t0[9|1],t${AUDIO_TRACK}[13|1]`,
    });

    expect(movedTo()).toStrictEqual([]);
    expect(result).toStrictEqual([
      { id: "113", path: "t0[1|1]" },
      { id: "114", path: "t0[5|1]" },
      { id: "115", path: "t0[9|1]" },
    ]);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        "clip t0[1|1] (id 113) was not moved: it would land on clip t0[5|1] (id 114), whose own move this call gave up on",
      ),
    );
  });

  // The resize clears the span it tiles across just as the move clears its
  // destination, so a called-off move takes its arrangementLength with it.
  it("drops the resize of a called-off move too", async () => {
    setupRefusingTrack([
      { id: "113", start: 0, end: 16 },
      { id: "114", start: 16, end: 32 },
    ]);

    await updateClip({
      id: "113,114",
      toPath: `t0[5|1],t${AUDIO_TRACK}[9|1]`,
      arrangementLength: "8bar",
    });

    expect(movedTo()).toStrictEqual([]);
    expect(lookupMockObject("113")?.call).not.toHaveBeenCalledWith(
      "duplicate_region",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});
