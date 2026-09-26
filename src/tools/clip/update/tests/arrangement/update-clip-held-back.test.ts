// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { type OverwritePlan } from "../../helpers/arrangement/update-clip-arrangement-overwrite-plan.ts";
import { flushDeferredDeletions } from "../../helpers/arrangement/update-clip-deferred-deletion.ts";
import {
  moveGroupKey,
  type MoveGroup,
} from "../../helpers/arrangement/update-clip-move-groups.ts";

describe("a clip held back for an overwrite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears it once the clip that overwrites it has landed", async () => {
    const track = setupTwoClipsOnOneTrack();

    const result = await updateClip({
      id: `${FIRST},${SECOND}`,
      arrangementStart: "17|1",
    });

    expect(result).toStrictEqual([
      { id: FIRST, path: "t0[1|1]", deleted: true, detail: BURIED },
      { id: MOVED, path: "t0[17|1]" },
    ]);
    expect(deletedIds(track)).toStrictEqual([`id ${SECOND}`, `id ${FIRST}`]);
  });

  // The bug this guards: the first clip used to be cleared on the prediction
  // alone, so a refused second move left the caller with one clip destroyed and
  // nothing in the response naming it.
  it("keeps it when Live silently declines the move that would overwrite it", async () => {
    const track = setupTwoClipsOnOneTrack(true);

    const result = await updateClip({
      id: `${FIRST},${SECOND}`,
      arrangementStart: "17|1",
    });

    expect(deletedIds(track)).toStrictEqual([]);
    // The move was all it was asked, and it didn't happen.
    expect(result).toStrictEqual([
      { id: FIRST, ok: false, detail: HELD_BACK },
      {
        id: SECOND,
        ok: false,
        detail:
          "not moved: Live made no copy at the destination, so the original was kept",
      },
    ]);
    // Nothing landed, so nothing stacked.
    expect(capturedWarnings().join(" ")).not.toContain(
      "moved to the same position",
    );
  });

  it("keeps a normal entry when something else asked of it landed", async () => {
    setupTwoClipsOnOneTrack(true);

    const result = await updateClip({
      id: `${FIRST},${SECOND}`,
      arrangementStart: "17|1",
      name: "Kept,Lost",
    });

    expect((result as ClipResult[])[0]).toStrictEqual({
      id: FIRST,
      path: "t0[1|1]",
      detail: HELD_BACK,
    });
  });

  // An ignored param is no work done, but the clip's fate is still unknown on
  // its own turn: only the flush can say whether it was deleted or kept.
  it("reports a held-back clip deleted even when its only other param was ignored", async () => {
    const track = setupTwoClipsOnOneTrack();

    const result = await updateClip({
      id: `${FIRST},${SECOND}`,
      arrangementStart: "17|1",
      warping: true,
    });

    expect(deletedIds(track)).toContain(`id ${FIRST}`);
    expect((result as ClipResult[])[0]).toStrictEqual({
      id: FIRST,
      path: "t0[1|1]",
      deleted: true,
      detail: `warping ignored: the clip is MIDI; ${BURIED}`,
    });
  });

  it("skips a kept held-back clip with every reason when its only other param was ignored", async () => {
    setupTwoClipsOnOneTrack(true);

    const result = await updateClip({
      id: `${FIRST},${SECOND}`,
      arrangementStart: "17|1",
      warping: true,
    });

    expect((result as ClipResult[])[0]).toStrictEqual({
      id: FIRST,
      ok: false,
      detail: `warping ignored: the clip is MIDI; ${HELD_BACK}`,
    });
  });

  // 102 sits at 17|1 and its move fails, so the moves waiting on it are called
  // off: 100 was planned as held back, but is refused, never deferred.
  it("skips a clip whose move was called off before it could be held back", async () => {
    setupTwoClipsOnOneTrack(true);
    registerMockObject("102", {
      path: livePath.track(0).arrangementClip(2),
      type: "Clip",
      properties: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: TARGET_BEATS,
        end_time: TARGET_BEATS + 16,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = await updateClip({
      id: `${FIRST},${SECOND},102`,
      arrangementStart: "17|1,17|1,33|1",
    });

    const blocked =
      "not moved: it would land on clip t0[17|1] (id 102), which Live wouldn't move; move that clip first, or use separate calls";

    expect(result).toStrictEqual([
      { id: FIRST, ok: false, detail: blocked },
      { id: SECOND, ok: false, detail: blocked },
      {
        id: "102",
        ok: false,
        detail:
          "not moved: Live made no copy at the destination, so the original was kept",
      },
    ]);
  });

  it("does not clear it for a landing by a clip outside its group", () => {
    // A tiling clip can land on the same track and position without being one
    // of the clips whose length made this one a non-survivor.
    expectHeldClipKept(flushHeldBack("outsider", planBuryingFirst()));
  });

  it("skips the delete when the landing already cleared it away", () => {
    const { result, sourceTrack } = flushHeldBack(
      SECOND,
      planBuryingFirst(),
      false,
    );

    expect(result).toStrictEqual({
      id: FIRST,
      deleted: true,
      detail: BURIED,
    });
    expect(sourceTrack.call).not.toHaveBeenCalled();
  });

  // Survivors descend in length, but a non-survivor can outlast a later, shorter
  // one: lengths [20, 40, 12] leave the 20 a non-survivor while the 12 survives.
  // The 12 landing buries only 12 of its 20 beats, so it settles nothing.
  it("does not clear it for a landing too short to bury it", () => {
    expectHeldClipKept(flushHeldBack(SECOND, planBurying(20, 12)));
  });

  it("clears it for a landing exactly as long as it is", () => {
    const { result, sourceTrack } = flushHeldBack(SECOND, planBurying(20, 20));

    expect(result).toStrictEqual({
      id: FIRST,
      deleted: true,
      detail: BURIED,
    });
    expect(sourceTrack.call).toHaveBeenCalledWith(
      "delete_clip",
      expect.anything(),
    );
  });

  // The failed placement cleared the target range before the copy it never
  // made, and this clip was sitting in it.
  it("reports a held-back clip the failed placement destroyed anyway", () => {
    const { result, sourceTrack } = flushHeldBack(
      "outsider",
      planBuryingFirst(),
      false,
    );

    expect(result).toStrictEqual({
      id: FIRST,
      deleted: true,
      detail: "deleted: a move onto it failed after clearing its place",
    });
    expect(sourceTrack.call).not.toHaveBeenCalled();
  });

  it("clears nothing when the call planned no overwrite at all", () => {
    const { result, sourceTrack } = flushHeldBack(SECOND, undefined);

    expect(result).toStrictEqual({ id: FIRST, detail: HELD_BACK });
    expect(sourceTrack.call).not.toHaveBeenCalled();
  });
});

/** What a held-back clip nothing landed on says. */
const BURIED = "another clip in this call was moved onto it";

const HELD_BACK =
  "not moved: the clip due to land on top of it at t0[17|1] didn't, so the original was kept";

/** Same length as SECOND and named first, so it is the one held back. */
const FIRST = "100";
const SECOND = "101";
/** The clip Live hands back when the duplicate really happens. */
const MOVED = "moved-101";
/** 17|1 in beats: clear of both clips, so neither move self-overlaps. */
const TARGET_BEATS = 64;
/** The track and position both clips are headed for. */
const GROUP = moveGroupKey({ trackIndex: 0, takeLane: null }, TARGET_BEATS);

/**
 * Two equal-length arrangement clips on one track, both about to be moved to
 * one position — so the first is the clip the optimizer expects the second to
 * land on top of.
 * @param duplicateFails - Answer the duplicate with id 0, as a frozen track does
 * @returns The track mock, which records the deletes and the duplicate
 */
function setupTwoClipsOnOneTrack(duplicateFails = false): RegisteredMockObject {
  registerMockObject("live-set", {
    path: "live_set",
    type: "Song",
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  for (const [index, id] of [FIRST, SECOND].entries()) {
    registerMockObject(id, {
      path: livePath.track(0).arrangementClip(index),
      type: "Clip",
      properties: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        start_time: index * 16,
        end_time: index * 16 + 16,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });
  }

  return registerMockObject("held-back-track", {
    path: livePath.track(0),
    type: "Track",
    properties: { track_index: 0 },
    methods: {
      // Live answers a duplicate it silently declined — on a frozen track, say
      // — with an id that resolves to nothing.
      duplicate_clip_to_arrangement: () => {
        if (duplicateFails) {
          return ["id", 0];
        }

        registerMockObject(MOVED, {
          path: livePath.track(0).arrangementClip(2),
          type: "Clip",
          properties: {
            is_arrangement_clip: 1,
            is_midi_clip: 1,
            start_time: TARGET_BEATS,
            end_time: TARGET_BEATS + 16,
            signature_numerator: 4,
            signature_denominator: 4,
          },
        });

        return ["id", MOVED];
      },
      delete_clip: () => null,
    },
  });
}

/**
 * Every clip id the track was told to delete.
 * @param track - The track mock
 * @returns The ids, in call order
 */
function deletedIds(track: RegisteredMockObject): string[] {
  return vi
    .mocked(track.call)
    .mock.calls.filter(([method]) => method === "delete_clip")
    .map((call) => call[1] as string);
}

/**
 * A plan whose survivor is long enough to bury the held-back clip.
 * @returns The overwrite plan
 */
function planBuryingFirst(): OverwritePlan {
  return planBurying(8, 16);
}

/**
 * A plan where FIRST is the non-survivor and SECOND's landing is what decides
 * whether FIRST gets buried.
 * @param firstLength - FIRST's length, in beats
 * @param survivorLength - SECOND's landing length, in beats
 * @returns The overwrite plan
 */
function planBurying(
  firstLength: number,
  survivorLength: number,
): OverwritePlan {
  return {
    nonSurvivorIds: new Set([FIRST]),
    survivorLengthsByGroup: new Map([
      [GROUP, new Map([[SECOND, survivorLength]])],
    ]),
    lengthById: new Map([
      [FIRST, firstLength],
      [SECOND, survivorLength],
    ]),
  };
}

/**
 * The held clip survived the landing: its entry says so and nothing was
 * deleted.
 * @param flushed - What the flush left behind
 */
function expectHeldClipKept(flushed: ReturnType<typeof flushHeldBack>): void {
  expect(flushed.result).toStrictEqual({ id: FIRST, detail: HELD_BACK });
  expect(flushed.sourceTrack.call).not.toHaveBeenCalled();
}

/**
 * Flush the deferred deletes of a group holding FIRST back, and report what
 * the flush left behind.
 * @param landed - The clip that landed at the destination
 * @param plan - The overwrite plan, or undefined when the call planned none
 * @param clipExists - Whether the held clip survived the landing
 * @returns Its entry and its source track
 */
function flushHeldBack(
  landed: string,
  plan: OverwritePlan | undefined,
  clipExists = true,
) {
  const { movedClipGroups, result, sourceTrack } = groupHoldingOneClipBack(
    landed,
    clipExists,
  );

  flushDeferredDeletions(movedClipGroups, plan);

  return { result, sourceTrack };
}

/**
 * One group holding one clip back, with whatever landed on it.
 * @param landed - The id whose placement landed on this track and position
 * @param clipExists - Whether the held-back clip is still there
 * @returns The tally, the clip's entry, and the track it sits on
 */
function groupHoldingOneClipBack(landed: string, clipExists = true) {
  const sourceTrack = registerMockObject(`flush-track-${landed}`, {
    path: livePath.track(0),
    type: "Track",
    methods: { delete_clip: () => null },
  });
  const result: ClipResult = { id: FIRST };
  const movedClipGroups = new Map<string, MoveGroup>([
    [
      GROUP,
      {
        landing: { trackIndex: 0, takeLane: null },
        startBeats: TARGET_BEATS,
        landed: new Map([[landed, { id: MOVED, span: null }]]),
        deferred: [
          {
            clip: {
              id: FIRST,
              // The half that tells the truth about a held clip: a dead one
              // keeps its id and clears its path.
              path: clipExists ? livePath.track(0).arrangementClip(0) : "",
              exists: () => clipExists,
            } as unknown as LiveAPI,
            sourceTrack: sourceTrack as unknown as LiveAPI,
            result,
          },
        ],
        cleared: [],
      },
    ],
  ]);

  return { movedClipGroups, result, sourceTrack };
}
