// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { requireMockTrack } from "#src/test/helpers/mock-registry-test-helpers.ts";
import { tileClipToRange } from "../arrangement-tiling.ts";
import {
  createQueuedMethod,
  mockContext,
  setupArrangementClip,
  setupClip,
  setupMidiSourceClip,
  setupTileClip,
  setupTrack,
  setupTrackWithQueuedMethods,
} from "./helpers/arrangement-tiling-test-helpers.ts";

/**
 * Register a track that both answers queued method calls and reports a fixed
 * list of arrangement clips, so the clearing scans see real clips.
 * @param clipIds - Arrangement clip IDs the track reports
 * @param queues - Per-method queued return values
 * @returns Track LiveAPI object
 */
function setupTrackWithClips(
  clipIds: string[],
  queues: Record<string, unknown[][]>,
): LiveAPI {
  setupTrack(0, {
    properties: {
      arrangement_clips: clipIds.flatMap((id) => ["id", id]),
    },
    methods: Object.fromEntries(
      Object.entries(queues).map(([method, values]) => [
        method,
        createQueuedMethod(values),
      ]),
    ),
  });

  return LiveAPI.from(livePath.track(0));
}

/**
 * How many times the track was asked to duplicate a clip to one position.
 * @param position - Arrangement position in beats
 * @returns Number of duplicate_clip_to_arrangement calls at that position
 */
function duplicatesTo(position: number): number {
  return requireMockTrack(0).call.mock.calls.filter(
    ([method, , target]: unknown[]) =>
      method === "duplicate_clip_to_arrangement" && target === position,
  ).length;
}

/** Two full tiles, the holding copy, then the partial tile's copy back. */
const HOLDING_AREA_QUEUES = {
  duplicate_clip_to_arrangement: [
    ["id", "200"],
    ["id", "201"],
    ["id", "300"],
    ["id", "302"],
  ],
  create_midi_clip: [["id", "301"]],
};

/**
 * Register the clips HOLDING_AREA_QUEUES hands back.
 * @param holdingEndTime - End of the holding copy, a full-length copy of the
 *   source before shortening
 */
function setupTilesAndHoldingCopy(holdingEndTime: number): void {
  setupTileClip("200");
  setupTileClip("201");
  setupTileClip("302");
  setupClip("300", { properties: { end_time: holdingEndTime } });
}

describe("tileClipToRange holding area", () => {
  it("keeps the holding area clear of the tiles it just placed", () => {
    // In Live the holding area is song_length, a few bars past the last event,
    // so it takes a long run to reach it. Here it is beat 4 — exactly where
    // tile 0 goes — which is the same collision without the 12 bars of tiles.
    const sourceClip = setupMidiSourceClip("100", 0, {
      is_arrangement_clip: 1,
      start_time: 0,
      end_time: 4,
    });
    const track = setupTrackWithQueuedMethods(0, HOLDING_AREA_QUEUES);

    setupTilesAndHoldingCopy(118);

    // Tiles at 4 and 8, a 2-beat partial at 12: the span ends at 14.
    const result = tileClipToRange(sourceClip, track, 4, 10, mockContext);

    expect(duplicatesTo(4)).toBe(1);
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 100",
      114,
    );
    expect(result).toStrictEqual([{ id: "200" }, { id: "201" }, { id: "302" }]);
  });

  it("keeps the holding area clear of what an earlier clip in the batch placed", () => {
    // A batch of clips on one track: the first ran past where the arrangement
    // ended, so a holding area fixed at request start now points inside its
    // clips. Clip 900 stands in for that placement.
    const sourceClip = setupMidiSourceClip("100", 0, {
      is_arrangement_clip: 1,
      start_time: 0,
      end_time: 4,
    });

    setupArrangementClip("900", 0, { start_time: 100, end_time: 600 }, 1);

    const track = setupTrackWithClips(["100", "900"], HOLDING_AREA_QUEUES);

    setupTilesAndHoldingCopy(704);

    tileClipToRange(sourceClip, track, 4, 10, mockContext);

    // Full tiles duplicate the source to their own positions first; the last
    // one is the partial tile's copy into the holding area.
    const holdingTarget = requireMockTrack(0).call.mock.calls.findLast(
      ([method, source]: unknown[]) =>
        method === "duplicate_clip_to_arrangement" && source === "id 100",
    )?.[2] as number;

    expect(holdingTarget).toBeGreaterThanOrEqual(600);
  });
});

/**
 * Tile a source that sits inside the span being tiled, so the pre-clear is off.
 *
 * Source [100,104) is tiled over [100,110): tile 0 lands on the source and is
 * skipped, tile 1 lands at 104, and a 2-beat partial routes through holding to
 * 108 — where clip 700 is sitting.
 * @returns The track mock
 */
function tileOverSource(): LiveAPI {
  const sourceClip = setupMidiSourceClip("100", 0, {
    is_arrangement_clip: 1,
    start_time: 100,
    end_time: 104,
  });

  setupArrangementClip("700", 0, { start_time: 108, end_time: 110 }, 1);
  setupTileClip("200");
  setupTileClip("302");
  setupClip("300", {
    properties: { is_arrangement_clip: 1, start_time: 1000, end_time: 1002 },
  });

  const track = setupTrackWithClips(["100", "700"], {
    duplicate_clip_to_arrangement: [
      ["id", "200"],
      ["id", "300"],
      ["id", "302"],
    ],
  });

  tileClipToRange(sourceClip, track, 100, 10, mockContext);

  return track;
}

describe("tileClipToRange clearing when the span was not pre-cleared", () => {
  it("clears the partial tile's target before moving the copy onto it", () => {
    // Without the pre-clear the partial tile cannot assume its target is empty:
    // duplicating onto an occupied span is the Ableton crash this whole
    // workaround exists to prevent.
    const track = tileOverSource();

    expect(track.call).toHaveBeenCalledWith("delete_clip", "id 700");
  });

  it("leaves the source alone when it sits inside the tiled span", () => {
    // One wide clear of the span would trim or delete the very clip being
    // tiled, so a source inside the span keeps the per-tile clearing.
    const track = tileOverSource();

    expect(track.call).not.toHaveBeenCalledWith("delete_clip", "id 100");
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id 100",
      104,
    );
  });

  it("keeps per-tile clearing when the source is longer than the tile spacing", () => {
    // Each tile is a full copy of the source, so a 16-beat source tiled every 4
    // beats runs past the span's end. Only the per-tile clear covers that, and
    // a tile landing on clip 700 uncleared crashes Live.
    const sourceClip = setupMidiSourceClip("100", 0, {
      is_arrangement_clip: 1,
      start_time: 100,
      end_time: 116,
      loop_end: 16,
      end_marker: 16,
    });

    setupArrangementClip("700", 0, { start_time: 124, end_time: 128 }, 1);
    setupTileClip("200");
    setupTileClip("201");

    const track = setupTrackWithClips(["100", "700"], {
      duplicate_clip_to_arrangement: [
        ["id", "200"],
        ["id", "201"],
      ],
    });

    // Two tiles at 116 and 120; tile 0's 16 beats reach 132.
    const result = tileClipToRange(sourceClip, track, 116, 8, mockContext, {
      tileLength: 4,
    });

    expect(track.call).toHaveBeenCalledWith("delete_clip", "id 700");
    expect(result).toStrictEqual([{ id: "200" }, { id: "201" }]);
  });
});
