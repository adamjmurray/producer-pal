// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The half of the move ordering that only the executor can decide.
 *
 * `orderArrangementMoves` sorts a call's moves so none of them clears a range
 * still holding a clip the call hasn't reached, assuming every move lands. Live
 * turns some down at write time — a missing destination track, an audio clip
 * with no sample, a take lane past the cap — none of it knowable at plan time.
 *
 * A move that didn't land leaves its span occupied, so the clips sorted after
 * it would run over a clip that never left. They're skipped here instead,
 * transitively: a skipped clip didn't vacate either.
 */

import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { refuseClipWork, type ClipReasons } from "../entries/clip-reasons.ts";

/** What the executor needs to re-decide a move after the one before it ran. */
export interface MoveSkipTracker {
  /**
   * Take stock after a clip's turn, and call off whatever was waiting for it to
   * get out of the way.
   * @param index - The clip's position in the call
   * @param results - What the clip's turn wrote into the response
   */
  settle: (index: number, results: ClipResult[]) => void;
}

interface MoveSkipArgs {
  clips: LiveAPI[];
  /** Which clips each clip has to wait for, from the planner. */
  dependencies: Array<Set<number>>;
  /** Whether each clip's move was expected to free the span it sits on. */
  vacates: boolean[];
  /** What each clip has to say beyond its result, added to. */
  reasons: ClipReasons;
  /** Positions the plan already refused, and already reported. */
  refusedMoves: Set<number>;
  /**
   * Clips the call leaves in place on purpose, to clear once the clip that
   * overwrites them has landed. They stayed put, but not because Live said no.
   */
  heldBackIds?: ReadonlySet<string>;
  /** Called with the id of every clip whose move is called off. */
  refuseMove: (clipId: string) => void;
}

/**
 * Watch each move's outcome and call off the ones that can no longer run.
 * @param args - The planner's graph and the executor's hook
 * @param args.clips - The clips to update, in the order the caller named them
 * @param args.dependencies - Which clips each clip has to wait for
 * @param args.vacates - Whether each clip's move was expected to free its span
 * @param args.reasons - What each clip has to say beyond its result
 * @param args.refusedMoves - Positions the plan already refused and reported
 * @param args.heldBackIds - Clips the call clears only once their overwrite lands
 * @param args.refuseMove - Drops a clip's move and resize before its turn comes
 * @returns The tracker the update loop drives
 */
export function trackMoveSkips({
  clips,
  dependencies,
  vacates,
  reasons,
  refusedMoves,
  heldBackIds,
  refuseMove,
}: MoveSkipArgs): MoveSkipTracker {
  // Seeded with the plan's own refusals: each of those clips has already said
  // why on its entry, and nothing waiting on one got past the plan either.
  const skipped = new Set(refusedMoves);
  const waiters = buildWaiters(dependencies);

  return {
    settle: (index, results) => {
      // Only a clip something is waiting on can strand anyone, and only one
      // that was meant to move: a clip the call leaves alone was already
      // settled at plan time, and its dependents are in blockedIds.
      if (!vacates[index] || moveLanded(clips[index] as LiveAPI, results)) {
        return;
      }

      skipStranded(index, {
        clips,
        waiters,
        skipped,
        reasons,
        heldBackIds,
        refuseMove,
      });
    },
  };
}

// --- Helpers below main exports ---

/**
 * Whether the clip's move actually happened, read off what it reported.
 *
 * Every route that moves a clip re-creates it and deletes the original, so the
 * entry names the new clip; every route that turns the move down reports the id
 * it came in with. Arrangement lanes, take lanes and clip slots alike — which
 * is why the outcome is read here rather than asked of Live, where a re-read
 * would have to tell a deleted source from one Live merely re-indexed. An
 * arrangementLength tiles copies after the move, so only the first entry is the
 * moved clip.
 * @param clip - The clip whose turn just finished
 * @param results - What its turn wrote into the response
 * @returns True when its span came free
 */
function moveLanded(clip: LiveAPI, results: ClipResult[]): boolean {
  const moved = results[0];

  return moved != null && moved.id !== clip.id;
}

/**
 * Invert the dependency sets: who is waiting on each clip.
 * @param dependencies - Which clips each clip has to wait for
 * @returns The clips waiting on each clip, by position
 */
function buildWaiters(dependencies: Array<Set<number>>): Map<number, number[]> {
  const waiters = new Map<number, number[]>();

  for (const [waiter, waits] of dependencies.entries()) {
    for (const blocker of waits) {
      waiters.set(blocker, [...(waiters.get(blocker) ?? []), waiter]);
    }
  }

  return waiters;
}

interface SkipSweepArgs {
  clips: LiveAPI[];
  waiters: Map<number, number[]>;
  skipped: Set<number>;
  reasons: ClipReasons;
  heldBackIds?: ReadonlySet<string>;
  refuseMove: (clipId: string) => void;
}

/**
 * Call off every move that was waiting on a span that never came free. A sweep,
 * not one hop: a clip skipped here doesn't vacate either, so whatever was
 * waiting on *it* is stranded too.
 * @param start - The clip that stayed put
 * @param sweep - The graph and the collectors the sweep writes to
 * @param sweep.clips - The clips to update
 * @param sweep.waiters - The clips waiting on each clip
 * @param sweep.skipped - Positions already called off, added to
 * @param sweep.reasons - What each clip has to say beyond its result
 * @param sweep.heldBackIds - Clips the call clears only once their overwrite lands
 * @param sweep.refuseMove - Drops a clip's move and resize
 */
function skipStranded(
  start: number,
  { clips, waiters, skipped, reasons, heldBackIds, refuseMove }: SkipSweepArgs,
): void {
  const queue = [start];

  for (let at = 0; at < queue.length; at++) {
    const blocker = queue[at] as number;

    for (const waiter of waiters.get(blocker) ?? []) {
      if (skipped.has(waiter)) {
        continue;
      }

      skipped.add(waiter);
      refuseMove((clips[waiter] as LiveAPI).id);
      noteSkipped(reasons, clips[waiter] as LiveAPI, {
        blocker: clips[blocker] as LiveAPI,
        skippedToo: at > 0,
        heldBack: heldBackIds?.has((clips[blocker] as LiveAPI).id) ?? false,
      });
      queue.push(waiter);
    }
  }
}

/** Why the clip in the way never left, in the words its entry uses. */
interface BlockerState {
  /** The clip that didn't get out of the way. */
  blocker: LiveAPI;
  /** Whether the blocker's own move was called off here too. */
  skippedToo: boolean;
  /** Whether the call is holding the blocker back to clear it at the end. */
  heldBack: boolean;
}

/**
 * Say on the clip's own entry which move the call gave up on, and name the clip
 * still standing in it.
 * @param reasons - What each clip has to say beyond its result, added to
 * @param clip - The clip whose move was called off
 * @param state - The clip in the way, and why it is still there
 */
function noteSkipped(
  reasons: ClipReasons,
  clip: LiveAPI,
  state: BlockerState,
): void {
  refuseClipWork(
    reasons,
    clip.id,
    `not moved: it would land on clip ${targetLabel(state.blocker)}, ${blockerReason(state)}`,
  );
}

/**
 * Why the blocker is still sitting there, and what to do about it. A clip the
 * call holds back stayed put by design, not because Live said no, and nothing
 * clears it until every move has run — so that case has no "move it first" to
 * offer.
 * @param state - The clip in the way, and why it is still there
 * @returns The clause naming it, for the waiting clip's entry
 */
function blockerReason(state: BlockerState): string {
  if (state.heldBack) {
    return "which this call clears only after every move has run; use separate calls";
  }

  const why = state.skippedToo
    ? "whose own move this call gave up on"
    : "which Live wouldn't move";

  return `${why}; move that clip first, or use separate calls`;
}
