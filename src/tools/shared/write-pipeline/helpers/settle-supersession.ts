// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import {
  replacementFailedDetail,
  skipEntry,
  spelledAs,
  unreachedDetail,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { type Replacement, type Supersession } from "../plans/supersession.ts";
import { type Target } from "../write-pipeline-types.ts";
import { type TargetRun } from "./write-loop.ts";

/** A later target whose write didn't replace what it was to, and how to name it. */
interface Failed {
  by: string;
  unreached: boolean;
}

/**
 * Once every target has had its turn, correct what a later target's fate says
 * about an earlier one. A target left unwritten for a later one that then
 * failed, or whose ground it never wrote, was not replaced by anything, so it
 * says so. A target is only cut short by a later one when both really landed.
 * @param runs - What each target's turn came to, corrected in place
 * @param targets - The call's targets, in the order named
 * @param supersession - What each later target was to do to the earlier ones
 * @param rerun - What to re-run for after the deadline, e.g. "target"
 * @returns The targets that now say they were cut short
 */
export function settleSupersession<P, E extends object>(
  runs: Array<TargetRun<E>>,
  targets: Array<Target<P>>,
  supersession: Supersession,
  rerun: string,
): Set<number> {
  // From the last target back: a target left unwritten for a later one that
  // itself turned out unwritten is then seen as such by the targets before it.
  for (const index of [...supersession.replaced.keys()].toSorted(
    (a, b) => b - a,
  )) {
    const failed = replacerFailed(
      supersession.replaced.get(index) as Replacement,
      runs,
      targets,
    );

    if (failed != null) {
      runs[index] = {
        entry: skipEntry(
          (targets[index] as Target<P>).named,
          failed.unreached
            ? unreachedDetail(rerun)
            : replacementFailedDetail(failed.by),
        ),
        pieces: [],
        outcome: "skipped",
        covered: false,
        unreached: failed.unreached,
      };
    }
  }

  const noted = new Set<number>();

  for (const [index, touchers] of supersession.shortened) {
    const run = runs[index] as TargetRun<E>;
    const toucher = touchers.find((later) => landed(runs[later.index]));

    if (run.outcome === "written" && run.covered && toucher != null) {
      appendDetail(run.entry, `shortened by ${toucher.as} later in this call`);
      noted.add(index);
    }
  }

  return noted;
}

// --- Helpers below main export ---

/**
 * Whether a target's write landed the ground it declared.
 * @param run - The target's turn
 * @returns True when it was written and its cover landed
 */
function landed<E>(run: TargetRun<E> | undefined): boolean {
  return run?.outcome === "written" && run.covered;
}

/**
 * The later target whose write didn't do what the replaced one was left
 * unwritten for, if there is one.
 * @param replacement - What the target was left unwritten for
 * @param runs - What each target's turn came to so far
 * @param targets - The call's targets
 * @returns Which later target failed, or null when what replaced it landed
 */
function replacerFailed<P, E>(
  replacement: Replacement,
  runs: Array<TargetRun<E>>,
  targets: Array<Target<P>>,
): Failed | null {
  if (replacement.kind === "named") {
    const later = runs[replacement.by] as TargetRun<E>;

    return later.outcome === "skipped"
      ? {
          by: spelledAs((targets[replacement.by] as Target<P>).named),
          unreached: later.unreached === true,
        }
      : null;
  }

  // One that was itself left unwritten for a later target landed in its place.
  const missing = replacement.coverers.find(({ index }) => {
    const later = runs[index] as TargetRun<E>;

    return (
      later.outcome === "skipped" ||
      (later.outcome === "written" && !later.covered)
    );
  });

  return missing == null
    ? null
    : {
        by: missing.as,
        unreached: (runs[missing.index] as TargetRun<E>).unreached === true,
      };
}
