// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Order a call's arrangement operations so none of them clears a range that
 * still holds a clip this call hasn't processed yet.
 *
 * Two things clear a span before writing to it: a move clears its whole
 * destination span before the copy lands, and an arrangementLength clears the
 * span it tiles across. When that span holds another clip in the same batch,
 * the batch later reaches a dead object and reports it as updated — the loss
 * the 1:1 pairing exists to prevent. Shifting a row of clips later hits this
 * every time: each destination sits on the next clip's current position.
 *
 * Running them in dependency order fixes the row — a later shift runs
 * back-to-front, an earlier one front-to-back. Clips trading positions are a
 * cycle with no such order, so those operations are refused instead: both the
 * move and the resize, since either one clears.
 *
 * A clip the call moves nowhere is refused the same way, for the same reason:
 * it takes its turn in the order, but its span never comes free, so anything
 * aimed at that span would run over a clip that is still sitting there.
 */

import * as console from "#src/shared/max/v8-max-console.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type ClipMoves } from "./update-clip-arrangement-optimizer.ts";

/** A span on one track's main arrangement lane. */
interface LaneSpan {
  trackIndex: number;
  start: number;
  end: number;
}

/** Where a clip sits now, and where this call sends it. */
interface ClipSpan {
  current: LaneSpan;
  /** The span the move clears, or null when the call moves the clip nowhere. */
  target: LaneSpan | null;
}

/** What the call does to a clip's span, before the clip's own is known. */
interface MoveIntent {
  /** The destination track, or null for the clip's own. */
  trackIndex: number | null;
  /** The position it lands at, or null to keep the one it has. */
  startBeats: number | null;
  /** The arrangement span it is resized to, or null when the call sets none. */
  lengthBeats: number | null;
}

/** How to run a call's moves, and which of them it can't run at all. */
export interface ArrangementMoveOrder {
  /** Positions in the clip list, in the order the clips must be processed. */
  order: number[];
  /**
   * Ids whose move and resize are both refused: nothing can clear the span
   * they ask for first, and either one would clear it themselves.
   */
  blockedIds: Set<string>;
  /**
   * Which clips each clip has to wait for. Kept past the sort so the executor
   * can re-decide: the order below assumes every move lands, and Live can turn
   * one down after the plan is made.
   */
  dependencies: Array<Set<number>>;
  /** Whether each clip's move was expected to free the span it sits on. */
  vacates: boolean[];
}

/**
 * Work out the order to process a call's clips in, so each move's destination
 * is already empty of the batch's own clips by the time it runs.
 * @param clips - The clips to update, in the order the caller named them
 * @param moves - Where each clip is headed
 * @returns The processing order, and the moves that have to be refused
 */
export function orderArrangementMoves(
  clips: LiveAPI[],
  moves: ClipMoves,
): ArrangementMoveOrder {
  // No graph means nothing waits on anything, so the executor has no move to
  // re-decide either.
  const inOrder = {
    order: clips.map((_, index) => index),
    blockedIds: new Set<string>(),
    dependencies: clips.map(() => new Set<number>()),
    vacates: clips.map(() => false),
  };

  // One clip can't be in its own way.
  if (clips.length < 2) return inOrder;

  // Read from the params alone, before anything asks Live where the clips are:
  // a call that moves none of them can't be in anyone's way either.
  const intents = clips.map((clip) => moveIntent(clip, moves));

  if (intents.every((intent) => intent == null)) return inOrder;

  const spans = clips.map((clip, index) =>
    clipSpan(clip, intents[index] ?? null),
  );
  const dependencies = buildDependencies(spans);

  if (dependencies == null) return inOrder;

  const vacates = clips.map((clip) => freesCurrentSpan(clip, moves));

  return {
    ...resolveOrder(clips, dependencies, intents, vacates),
    dependencies,
    vacates,
  };
}

// --- Helpers below main exports ---

/**
 * What the call does to a clip's span on a main arrangement lane, or null when
 * it clears nothing there: the call leaves the clip alone, or sends it to a
 * take lane or a clip slot.
 * @param clip - The clip being updated
 * @param moves - Where each clip is headed
 * @returns The destination and span, or null
 */
function moveIntent(clip: LiveAPI, moves: ClipMoves): MoveIntent | null {
  const destination = moves.destinationById?.get(clip.id);
  const lengthBeats = moves.lengthBeatsFor(clip);

  // A take lane is not the main lane a clear runs on, and a clip slot is off
  // the timeline entirely — except alongside an arrangement length, which makes
  // update-clip ignore the slot and tile the clip where it stands.
  const usesMainLane =
    destination == null ||
    destination.kind === "track" ||
    (destination.kind === "slot" && lengthBeats != null);

  if (!usesMainLane) return null;

  const startBeats = moves.startBeatsFor(clip);

  if (startBeats == null && destination == null && lengthBeats == null) {
    return null;
  }

  return {
    trackIndex: destination?.kind === "track" ? destination.trackIndex : null,
    startBeats,
    lengthBeats,
  };
}

/**
 * Whether the call takes this clip off the span it holds now. True for a move
 * to a slot or a take lane too: the clip is re-created there and the original
 * deleted, so the arrangement span it held comes free.
 *
 * False means a permanent occupant — no other clip's move can wait for it to
 * get out of the way, because it never does.
 * @param clip - The clip being updated
 * @param moves - Where each clip is headed
 * @returns True when the clip's current span comes free
 */
function freesCurrentSpan(clip: LiveAPI, moves: ClipMoves): boolean {
  if (moves.startBeatsFor(clip) != null) return true;

  const destination = moves.destinationById?.get(clip.id);

  if (destination == null) return false;

  // A slot alongside an arrangement length is ignored: update-clip tiles the
  // clip where it stands, so it goes nowhere.
  return !(destination.kind === "slot" && moves.lengthBeatsFor(clip) != null);
}

/**
 * Where a clip sits and where its move lands, or null when the clip is off the
 * main arrangement lane entirely — a session clip, or one on a take lane, which
 * a main-lane clear never touches.
 * @param clip - The clip being updated
 * @param intent - Where the call sends it, or null when it stays put
 * @returns The clip's spans, or null when it takes no part
 */
function clipSpan(clip: LiveAPI, intent: MoveIntent | null): ClipSpan | null {
  if ((clip.getProperty("is_arrangement_clip") as number) <= 0) return null;
  if (isTakeLaneClip(clip)) return null;

  const trackIndex = clip.trackIndex;

  if (trackIndex == null) return null;

  const start = clip.getProperty("start_time") as number;
  const end = clip.getProperty("end_time") as number;
  const current = { trackIndex, start, end };

  if (intent == null) return { current, target: null };

  // No position of its own means "same place, other lane".
  const targetStart = intent.startBeats ?? start;
  // A move clears the clip's own length. A longer arrangementLength tiles
  // copies forward and clears the whole span it fills, so the wider one wins.
  // Both happen at the destination: update-clip moves before it resizes.
  const cleared = Math.max(end - start, intent.lengthBeats ?? 0);

  return {
    current,
    target: {
      trackIndex: intent.trackIndex ?? trackIndex,
      start: targetStart,
      end: targetStart + cleared,
    },
  };
}

/**
 * Which clips each clip has to wait for: everything its move would clear away.
 * @param spans - Each clip's current and destination spans, null where it takes no part
 * @returns One dependency set per clip, or null when no move is in anyone's way
 */
function buildDependencies(
  spans: Array<ClipSpan | null>,
): Array<Set<number>> | null {
  const dependencies = spans.map(() => new Set<number>());
  let any = false;

  for (const [mover, span] of spans.entries()) {
    const target = span?.target;

    if (target == null) continue;

    for (const [victim, other] of spans.entries()) {
      if (victim === mover || other == null) continue;
      if (!overlaps(target, other.current)) continue;
      // Both headed for one spot: that overwrite is what the call asked for,
      // and the survivor plan already picks which clip wins it.
      if (landsAt(other.target, target)) continue;

      (dependencies[mover] as Set<number>).add(victim);
      any = true;
    }
  }

  return any ? dependencies : null;
}

/**
 * Whether two spans share any beat of the same track's main lane.
 * @param a - One span
 * @param b - The other
 * @returns True when they overlap
 */
function overlaps(a: LaneSpan, b: LaneSpan): boolean {
  return a.trackIndex === b.trackIndex && a.start < b.end && a.end > b.start;
}

/**
 * Whether a clip is headed for the same track and position as another move.
 * @param target - The clip's own destination, if it has one
 * @param other - The destination to compare against
 * @returns True when both land in the same place
 */
function landsAt(
  target: LaneSpan | null | undefined,
  other: LaneSpan,
): boolean {
  return (
    target != null &&
    target.trackIndex === other.trackIndex &&
    target.start === other.start
  );
}

/**
 * Emit the clips in dependency order, taking the earliest one whose waits have
 * all vacated their spans.
 *
 * Emitting a clip and freeing its span are two different things: a clip the
 * call moves nowhere still takes its turn (its name, color and notes land) but
 * never gets out of anyone's way. Whatever can't be reached is a cycle, a
 * permanent occupant's dependents, or clips waiting behind either: none of them
 * can move, because the clip in their way never leaves.
 * @param clips - The clips to update, in the order the caller named them
 * @param dependencies - Which clips each clip has to wait for
 * @param intents - What the call does to each clip's span
 * @param vacates - Whether each clip's current span comes free
 * @returns The processing order, and the operations that have to be refused
 */
function resolveOrder(
  clips: LiveAPI[],
  dependencies: Array<Set<number>>,
  intents: Array<MoveIntent | null>,
  vacates: boolean[],
): Pick<ArrangementMoveOrder, "order" | "blockedIds"> {
  const order: number[] = [];
  const emitted = new Set<number>();
  const vacated = new Set<number>();
  const nextReady = (): number =>
    clips.findIndex(
      (_, index) =>
        !emitted.has(index) &&
        [...(dependencies[index] as Set<number>)].every((wait) =>
          vacated.has(wait),
        ),
    );

  for (let next = nextReady(); next >= 0; next = nextReady()) {
    emitted.add(next);

    if (vacates[next]) vacated.add(next);

    order.push(next);
  }

  const blocked = clips
    .map((_, index) => index)
    .filter((index) => !emitted.has(index));

  order.push(...blocked);

  return {
    order,
    blockedIds: warnBlockedMoves(
      clips,
      dependencies,
      blocked,
      intents,
      vacated,
    ),
  };
}

/**
 * Say which operations the call gave up on, and name a clip standing in each
 * one's way. A blocked clip always waits on a clip that never vacated — that is
 * what made it unorderable — so there is always one to name.
 * @param clips - The clips to update
 * @param dependencies - Which clips each clip has to wait for
 * @param blocked - Positions of the clips whose moves are refused
 * @param intents - What the call does to each clip's span
 * @param vacated - Positions of the clips whose spans came free
 * @returns The blocked clips' ids
 */
function warnBlockedMoves(
  clips: LiveAPI[],
  dependencies: Array<Set<number>>,
  blocked: number[],
  intents: Array<MoveIntent | null>,
  vacated: Set<number>,
): Set<string> {
  const blockedSet = new Set(blocked);

  for (const index of blocked) {
    const clip = clips[index] as LiveAPI;
    const waits = [...(dependencies[index] as Set<number>)];
    const blockerIndex = waits.find((wait) => !vacated.has(wait)) as number;
    const blocker = clips[blockerIndex] as LiveAPI;
    // A resize clears the span it tiles across, so leaving it to run would
    // destroy the clip the refusal is protecting.
    const skipped =
      intents[index]?.lengthBeats == null
        ? "was not moved"
        : "was not moved or resized";
    // Two ways a span never comes free: the clip in the way is itself blocked,
    // or the call sends it nowhere at all.
    const why = blockedSet.has(blockerIndex)
      ? "which this call can't move out of the way first; move them in separate calls"
      : "which this call leaves where it is; move that clip out of the way too, or use separate calls";

    console.warn(
      `clip ${targetLabel(clip)} ${skipped}: it would land on clip ${targetLabel(blocker)}, ${why}`,
    );
  }

  return new Set(blocked.map((index) => (clips[index] as LiveAPI).id));
}
