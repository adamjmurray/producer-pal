// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { cutPieceCount } from "#src/tools/shared/arrangement/arrangement-splitting-rescan.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  type Plan,
  type Superseded,
  type Target,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  type ClipMoves,
  orderArrangementMoves,
} from "../arrangement/update-clip-move-order.ts";
import { newClipReasons } from "../entries/clip-reasons.ts";
import { cutBlocker } from "./cut-clip.ts";
import { type ClipCall } from "./parse-clip-call.ts";
import { type ClipPayload } from "./resolve-clip-targets.ts";

/** What the plan worked out for one target. */
export interface ClipPlanned {
  /** Why its move and resize are given up on before any write, if they are */
  blocked: string | null;
  /** The targets whose moves have to free their spans first */
  waitsFor: Array<{ index: number; label: string }>;
  /** Whether its move is meant to free the span it sits on */
  vacates: boolean;
  /**
   * The number its clip, or its first piece when a cut makes several, has in
   * the call: every target takes one per clip it will have, an empty one too.
   */
  firstIndex: number;
  /** How many clips the call numbers, whatever order they are written in */
  clipCount: number;
}

/**
 * Order the call's targets so no move clears a span that still holds a clip the
 * call hasn't reached, and say which moves can't run at all. Targets that will
 * not be written are out of it: they neither move nor stand in anyone's way.
 * A target a later one lands only part of is written first, or it would land on
 * top of the clip that cut it.
 * @param targets - The call's targets, in the order named
 * @param call - The update-clip call
 * @param superseded - The targets nothing will write, and the ones cut short
 * @returns The order to write in, and what each target is to know
 */
export function planClipMoves(
  targets: Array<Target<ClipPayload>>,
  call: ClipCall,
  superseded: Superseded,
): Plan<ClipPlanned> {
  const { unwritten } = superseded;
  const effective = targets.flatMap((target, index) =>
    target.skip == null && !unwritten.has(index)
      ? [{ index, payload: target.data }]
      : [],
  );
  const clips = effective.map(({ payload }) => payload.clip);
  const byId = new Map(
    effective.map(({ payload }) => [payload.clip.id, payload]),
  );
  const moves: ClipMoves = {
    startBeatsFor: (clip) => byId.get(clip.id)?.startBeats ?? null,
    lengthBeatsFor: (clip) => byId.get(clip.id)?.lengthBeats ?? null,
    destinationById: new Map(
      effective.flatMap(({ payload }) =>
        payload.destination == null
          ? []
          : [[payload.clip.id, payload.destination] as const],
      ),
    ),
  };
  // The ordering says why it gave up on a move the way an entry does; the plan
  // hands each reason to the clip it is about.
  const reasons = newClipReasons();
  const positionOf = new Map(effective.map(({ index }, at) => [index, at]));
  const after = clips.map(() => new Set<number>());

  for (const [earlier, coverers] of superseded.shortenedBy) {
    for (const later of coverers) {
      const first = positionOf.get(earlier);
      const second = positionOf.get(later);

      if (first != null && second != null) {
        (after[second] as Set<number>).add(first);
      }
    }
  }

  const ordered = orderArrangementMoves(clips, moves, reasons, after);
  const numbers = clipNumbers(targets, call, unwritten);
  const each = targets.map((_, index): ClipPlanned => ({
    blocked: null,
    waitsFor: [],
    vacates: false,
    ...(numbers[index] as Pick<ClipPlanned, "firstIndex" | "clipCount">),
  }));

  for (const [position, { index }] of effective.entries()) {
    const clip = clips[position] as LiveAPI;

    each[index] = {
      ...(each[index] as ClipPlanned),
      blocked: ordered.blockedIds.has(clip.id)
        ? (reasons.said.get(clip.id)?.[0] ?? null)
        : null,
      waitsFor: [...(ordered.dependencies[position] as Set<number>)].map(
        (wait) => ({
          index: (effective[wait] as { index: number }).index,
          label: targetLabel(clips[wait] as LiveAPI),
        }),
      ),
      vacates: ordered.vacates[position] as boolean,
    };
  }

  return {
    order: ordered.order.map(
      (position) => (effective[position] as { index: number }).index,
    ),
    each,
  };
}

/**
 * Number the clips the call updates, across its targets in the order named. A
 * target with no clip still takes one number, so the clips after it keep the
 * place the name and the other per-target lists pair them with; a clip a split
 * cuts takes one per piece.
 * @param targets - The call's targets
 * @param call - The update-clip call
 * @param unwritten - The targets nothing will write
 * @returns Each target's first number, and how many numbers there are
 */
function clipNumbers(
  targets: Array<Target<ClipPayload>>,
  call: ClipCall,
  unwritten: ReadonlySet<number>,
): Array<Pick<ClipPlanned, "firstIndex" | "clipCount">> {
  const { split } = call;
  const pieces = targets.map((target, index) =>
    split == null ||
    target.skip != null ||
    unwritten.has(index) ||
    cutBlocker(target.data.clip, split) != null
      ? 1
      : cutPieceCount(target.data.clip, split.points, split.mode),
  );
  const total = pieces.reduce((sum, count) => sum + count, 0);
  let first = 0;

  return pieces.map((count) => {
    const numbered = { firstIndex: first, clipCount: total };

    first += count;

    return numbered;
  });
}
