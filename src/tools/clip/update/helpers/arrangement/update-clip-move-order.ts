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
 * the 1:1 pairing exists to prevent. Shifting a row of clips hits it every
 * time: each destination sits on the next clip's current position.
 *
 * Dependency order fixes the row — a later shift runs back-to-front, an earlier
 * one front-to-back. Clips trading positions are a cycle with no such order, so
 * both their move and their resize are refused instead, since either clears.
 *
 * A clip the call moves nowhere is refused the same way, for the same reason:
 * it takes its turn in the order, but its span never comes free, so anything
 * aimed at that span would run over a clip that is still sitting there.
 *
 * Spans are keyed by lane, not just by track: a take-lane clip is only ever in
 * the way of another clip on that same lane. It clears its destination like any
 * other move — `create_midi_clip` wipes the range it writes to.
 */

import { shortensArrangementClip } from "#src/tools/clip/arrangement/arrangement-operations.ts";
import {
  type ArrangementTrack,
  takeLaneIndexOfClip,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { type ClipPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { refuseClipWork, type ClipReasons } from "../entries/clip-reasons.ts";
import { type ClipMoves } from "./update-clip-arrangement-overwrite-plan.ts";

/** A span on one arrangement lane: a track's main lane, or a take lane on it. */
interface LaneSpan extends ArrangementTrack {
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
  /** The destination lane, or null for the clip's own. */
  landing: ArrangementTrack | null;
  /** The position it lands at, or null to keep the one it has. */
  startBeats: number | null;
  /** The arrangement span it is resized to, or null when the call sets none. */
  lengthBeats: number | null;
}

/** How to run a call's moves, and which of them it can't run at all. */
export interface ArrangementMoveOrder {
  /** Positions in the clip list, in the order the clips must be processed. */
  order: number[];
  /** Ids whose move and resize are both refused: nothing clears their span. */
  blockedIds: Set<string>;
  /** Which clips each waits for. Kept past the sort: Live can refuse a move. */
  dependencies: Array<Set<number>>;
  /** Whether each clip's move was expected to free the span it sits on. */
  vacates: boolean[];
}

/**
 * Work out the order to process a call's clips in, so each move's destination
 * is already empty of the batch's own clips by the time it runs.
 * @param clips - The clips to update, in the order the caller named them
 * @param moves - Where each clip is headed
 * @param reasons - What each clip has to say beyond its result, added to
 * @returns The processing order, and the moves that have to be refused
 */
export function orderArrangementMoves(
  clips: LiveAPI[],
  moves: ClipMoves,
  reasons: ClipReasons,
): ArrangementMoveOrder {
  // No graph: nothing waits on anything, and the executor re-decides nothing.
  const inOrder = {
    order: clips.map((_, index) => index),
    blockedIds: new Set<string>(),
    dependencies: clips.map(() => new Set<number>()),
    vacates: clips.map(() => false),
  };

  // One clip can't be in its own way.
  if (clips.length < 2) {
    return inOrder;
  }

  // From the params alone, before anything asks Live where the clips are: a
  // call that moves none of them can't be in anyone's way either.
  const intents = clips.map((clip) => moveIntent(clip, moves));

  if (intents.every((intent) => intent == null)) {
    return inOrder;
  }

  const spans = clips.map((clip, index) =>
    clipSpan(clip, intents[index] ?? null),
  );
  const dependencies = buildDependencies(spans);

  if (dependencies == null) {
    return inOrder;
  }

  const vacates = clips.map((clip) => freesCurrentSpan(clip, moves));

  return {
    ...resolveOrder(clips, dependencies, intents, vacates, reasons),
    dependencies,
    vacates,
  };
}

// --- Helpers below main exports ---

/**
 * What the call does to a clip's span on an arrangement lane, or null when it
 * clears nothing there: the call leaves the clip alone, or sends it to a clip
 * slot.
 * @param clip - The clip being updated
 * @param moves - Where each clip is headed
 * @returns The destination and span, or null
 */
function moveIntent(clip: LiveAPI, moves: ClipMoves): MoveIntent | null {
  const destination = moves.destinationById?.get(clip.id);
  const lengthBeats = moves.lengthBeatsFor(clip);

  // A clip slot is off the timeline entirely — except alongside an arrangement
  // length, which makes update-clip ignore the slot and tile where it stands.
  if (destination?.kind === "slot" && lengthBeats == null) {
    return null;
  }

  const startBeats = moves.startBeatsFor(clip);

  if (startBeats == null && destination == null && lengthBeats == null) {
    return null;
  }

  return { landing: landingLane(destination), startBeats, lengthBeats };
}

/**
 * The lane a destination sends a clip to. An ignored slot lands nowhere of its
 * own, so it reads as the clip's own lane, same as no destination at all.
 * @param destination - Where the call named the clip to go, if anywhere
 * @returns The lane, or null for the clip's own
 */
function landingLane(
  destination: ClipPath | undefined,
): ArrangementTrack | null {
  if (destination == null || destination.kind === "slot") {
    return null;
  }

  return {
    trackIndex: destination.trackIndex,
    takeLane: destination.kind === "take-lane" ? destination.laneIndex : null,
  };
}

/**
 * Whether the call takes this clip off the span it holds now. True for a move
 * to a slot or a take lane too: the clip is re-created there and the original
 * deleted, so the arrangement span it held comes free. A take-lane source is
 * only emptied, but whatever lands there next clears the muted leftover.
 *
 * False means a permanent occupant: nothing can wait for it to move aside.
 * @param clip - The clip being updated
 * @param moves - Where each clip is headed
 * @returns True when the clip's current span comes free
 */
function freesCurrentSpan(clip: LiveAPI, moves: ClipMoves): boolean {
  if (moves.startBeatsFor(clip) != null) {
    return true;
  }

  const destination = moves.destinationById?.get(clip.id);

  if (destination == null) {
    return false;
  }

  // A slot alongside an arrangement length is ignored: update-clip tiles the
  // clip where it stands, so it goes nowhere.
  return !(destination.kind === "slot" && moves.lengthBeatsFor(clip) != null);
}

/**
 * Where a clip sits and where its move lands, or null when the clip is off the
 * arrangement timeline — a session clip, which no arrangement clear touches.
 * @param clip - The clip being updated
 * @param intent - Where the call sends it, or null when it stays put
 * @returns The clip's spans, or null when it takes no part
 */
function clipSpan(clip: LiveAPI, intent: MoveIntent | null): ClipSpan | null {
  if ((clip.getProperty("is_arrangement_clip") as number) <= 0) {
    return null;
  }

  const trackIndex = clip.trackIndex;

  if (trackIndex == null) {
    return null;
  }

  const takeLane = takeLaneIndexOfClip(clip);
  const start = clip.getProperty("start_time") as number;
  const end = clip.getProperty("end_time") as number;
  const current = { trackIndex, takeLane, start, end };

  if (intent == null) {
    return { current, target: null };
  }

  // No position of its own means "same place, other lane".
  const targetStart = intent.startBeats ?? start;
  const landing = intent.landing ?? { trackIndex, takeLane };
  const cleared = clearedLength(start, end, takeLane, landing, intent);

  return {
    current,
    target: { ...landing, start: targetStart, end: targetStart + cleared },
  };
}

/**
 * How much of the destination a clip's move and resize clear.
 * @param start - The clip's start_time
 * @param end - The clip's end_time
 * @param takeLane - The clip's take lane, or null for the main lane
 * @param landing - The lane it lands on
 * @param intent - What the call does to its span
 * @returns The cleared length in beats, from the landing position
 */
function clearedLength(
  start: number,
  end: number,
  takeLane: number | null,
  landing: ArrangementTrack,
  intent: MoveIntent,
): number {
  const { lengthBeats } = intent;

  // update-clip never tiles on a take lane.
  if (landing.takeLane != null || lengthBeats == null) {
    return end - start;
  }

  // Main lane to main lane, a shortened clip is shortened before it moves, so
  // the move clears only the new length.
  if (takeLane == null && shortensArrangementClip(start, end, lengthBeats)) {
    return lengthBeats;
  }

  // A longer arrangementLength tiles forward and clears the span it fills.
  return Math.max(end - start, lengthBeats);
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

    if (target == null) {
      continue;
    }

    for (const [victim, other] of spans.entries()) {
      if (victim === mover || other == null) {
        continue;
      }

      if (!overlaps(target, other.current)) {
        continue;
      }

      // Both headed for one spot: that overwrite is what the call asked for,
      // and the survivor plan already picks which clip wins it.
      if (landsAt(other.target, target)) {
        continue;
      }

      (dependencies[mover] as Set<number>).add(victim);
      any = true;
    }
  }

  return any ? dependencies : null;
}

/**
 * Whether two spans share any beat of one lane.
 * @param a - One span
 * @param b - The other
 * @returns True when they overlap
 */
function overlaps(a: LaneSpan, b: LaneSpan): boolean {
  return sameLane(a, b) && a.start < b.end && a.end > b.start;
}

/**
 * Whether a clip is headed for the same lane and position as another move.
 * @param target - The clip's own destination, if it has one
 * @param other - The destination to compare against
 * @returns True when both land in the same place
 */
function landsAt(
  target: LaneSpan | null | undefined,
  other: LaneSpan,
): boolean {
  return (
    target != null && sameLane(target, other) && target.start === other.start
  );
}

/**
 * Whether two spans sit on one lane.
 * @param a - One span
 * @param b - The other
 * @returns True when they share a track and a take lane (or both the main one)
 */
function sameLane(a: LaneSpan, b: LaneSpan): boolean {
  return a.trackIndex === b.trackIndex && a.takeLane === b.takeLane;
}

/**
 * Emit the clips in dependency order, taking the earliest one whose waits have
 * all vacated their spans.
 *
 * Emitting a clip and freeing its span are two different things: a clip the
 * call moves nowhere still takes its turn (its name, color and notes land) but
 * never gets out of anyone's way. Whatever can't be reached — a cycle, or a
 * permanent occupant and everything behind it — can't move at all.
 * @param clips - The clips to update, in the order the caller named them
 * @param dependencies - Which clips each clip has to wait for
 * @param intents - What the call does to each clip's span
 * @param vacates - Whether each clip's current span comes free
 * @param reasons - What each clip has to say beyond its result, added to
 * @returns The processing order, and the operations that have to be refused
 */
function resolveOrder(
  clips: LiveAPI[],
  dependencies: Array<Set<number>>,
  intents: Array<MoveIntent | null>,
  vacates: boolean[],
  reasons: ClipReasons,
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

    if (vacates[next]) {
      vacated.add(next);
    }

    order.push(next);
  }

  const blocked = clips
    .map((_, index) => index)
    .filter((index) => !emitted.has(index));

  order.push(...blocked);

  return {
    order,
    blockedIds: noteBlockedMoves(
      clips,
      dependencies,
      blocked,
      intents,
      vacated,
      reasons,
    ),
  };
}

/**
 * Say on each clip's own entry which operation the call gave up on, and name a
 * clip standing in its way. A blocked clip always waits on a clip that never
 * vacated — that is what made it unorderable — so there is always one to name.
 * @param clips - The clips to update
 * @param dependencies - Which clips each clip has to wait for
 * @param blocked - Positions of the clips whose moves are refused
 * @param intents - What the call does to each clip's span
 * @param vacated - Positions of the clips whose spans came free
 * @param reasons - What each clip has to say beyond its result, added to
 * @returns The blocked clips' ids
 */
function noteBlockedMoves(
  clips: LiveAPI[],
  dependencies: Array<Set<number>>,
  blocked: number[],
  intents: Array<MoveIntent | null>,
  vacated: Set<number>,
  reasons: ClipReasons,
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
        ? "not moved"
        : "not moved or resized";
    // Two ways a span never comes free: the clip in the way is itself blocked,
    // or the call sends it nowhere at all.
    const why = blockedSet.has(blockerIndex)
      ? "which this call can't move out of the way first; move them in separate calls"
      : "which this call leaves where it is; move that clip out of the way too, or use separate calls";

    refuseClipWork(
      reasons,
      clip.id,
      `${skipped}: it would land on clip ${targetLabel(blocker)}, ${why}`,
    );
  }

  return new Set(blocked.map((index) => (clips[index] as LiveAPI).id));
}
