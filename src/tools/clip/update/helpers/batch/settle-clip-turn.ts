// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Whether a clip's turn keeps its entry or hands its target a skip. A clip
// where nothing the call asked of it happened gets a skip (`ok: false`); one
// where anything landed keeps its entry and the detail (ADR-0042).

import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import {
  type ClipReasons,
  clipLandedNothing,
  reportClipReasons,
} from "../entries/clip-reasons.ts";
import { type ClipTargets, refuseTarget } from "../entries/clip-targets.ts";

interface SettleClipTurnArgs {
  clip: LiveAPI;
  results: ClipResult[];
  /** Why the clip's update threw, or null when it ran to the end. */
  failure: string | null;
  reasons: ClipReasons;
  targets: ClipTargets;
  /** The target this clip belongs to, by its place in the call. */
  slot: number;
  /** Whether the call asked this clip for anything besides its position. */
  askedAnythingElse: boolean;
  /** Whether the clip was held back; {@link skipUnmovedClips} settles it. */
  heldBack: boolean;
}

/**
 * Settle what one clip's turn reports: its reasons go on the entry it wrote, and
 * a turn with nothing to report hands its target a skip instead.
 *
 * A throw partway leaves whatever landed before it in place, so it is reported on
 * the entry rather than as a refusal.
 * @param turn - The clip, what it wrote, and what went wrong
 * @param turn.clip - The clip whose turn just finished
 * @param turn.results - The entries its turn wrote
 * @param turn.failure - Why its update threw, or null
 * @param turn.reasons - What each clip has to say beyond its result
 * @param turn.targets - The targets the call named
 * @param turn.slot - The target this clip belongs to
 * @param turn.askedAnythingElse - Whether the call asked for more than a position
 * @param turn.heldBack - Whether the clip was held back, to be settled later
 * @returns The entries to keep for this clip, empty when its target took a skip
 */
export function settleClipTurn({
  clip,
  results,
  failure,
  reasons,
  targets,
  slot,
  askedAnythingElse,
  heldBack,
}: SettleClipTurnArgs): ClipResult[] {
  reportClipReasons(reasons, clip.id, results);

  const entry = results[0];

  if (failure != null && entry != null) {
    appendDetail(entry, `update stopped partway: ${failure}`);
  }

  if (entry == null) {
    refuseTarget(targets.unused, targets.named, slot, failure ?? "not updated");

    return [];
  }

  // Nothing the call asked of this clip happened, so where it still sits is not
  // worth an entry: the target keeps the detail as a skip instead. A moved clip
  // reports a new id — every route that moves one re-creates it — so an entry
  // that kept the id it came in with is one that stayed put. A held-back clip's
  // fate isn't known yet, so it waits for the flush.
  if (
    !heldBack &&
    results.length === 1 &&
    !askedAnythingElse &&
    entry.id === clip.id &&
    clipLandedNothing(reasons, clip.id)
  ) {
    refuseTarget(
      targets.unused,
      targets.named,
      slot,
      entry.detail ?? "not updated",
    );

    return [];
  }

  return results;
}

interface SkipUnmovedClipsArgs {
  clips: LiveAPI[];
  /** What each clip's turn wrote, in clip order; rewritten in place. */
  resultsPerClip: ClipResult[][];
  /** The entries of held-back clips that stayed where they were. */
  unmoved: ReadonlySet<ClipResult>;
  /** Whether the call asked this clip for anything besides its position. */
  askedAnythingElse: (clip: LiveAPI) => boolean;
  reasons: ClipReasons;
  targets: ClipTargets;
  slots: number[];
}

/**
 * Turn a held-back clip that stayed put into a skip when the move was all the
 * call asked of it. Runs after every turn: only then is it known whether the
 * clip due to land on it did.
 * @param batch - The clips, their entries, and what the call asked
 * @param batch.clips - Every clip in the batch
 * @param batch.resultsPerClip - What each clip's turn wrote; rewritten in place
 * @param batch.unmoved - The entries of held-back clips that stayed put
 * @param batch.askedAnythingElse - Whether the call asked a clip for more than a position
 * @param batch.reasons - What each clip has to say beyond its result
 * @param batch.targets - The targets the call named
 * @param batch.slots - The target each clip belongs to, in clip order
 */
export function skipUnmovedClips({
  clips,
  resultsPerClip,
  unmoved,
  askedAnythingElse,
  reasons,
  targets,
  slots,
}: SkipUnmovedClipsArgs): void {
  for (const [i, clip] of clips.entries()) {
    const results = resultsPerClip[i] as ClipResult[];
    const [entry] = results;

    if (
      results.length === 1 &&
      entry != null &&
      unmoved.has(entry) &&
      !reasons.landed.has(clip.id) &&
      !askedAnythingElse(clip)
    ) {
      refuseTarget(
        targets.unused,
        targets.named,
        slots[i] as number,
        entry.detail as string,
      );
      resultsPerClip[i] = [];
    }
  }
}
