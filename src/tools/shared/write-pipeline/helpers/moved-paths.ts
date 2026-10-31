// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { type TargetSkip } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  type AnyEntry,
  type Locate,
  type Outcome,
  type Target,
} from "../write-pipeline-types.ts";

/**
 * A skip entry keeps the caller's spelling of its path, but an earlier target in
 * the same call may have moved things since, so that path can now name another
 * object. Say so on the entry, in its `detail`: where the object the target was
 * found at sits now, or that the path was empty when the call began. An entry
 * whose path still names what it did is left untouched.
 *
 * Runs after the writes, which have already changed Live: a lookup that throws
 * leaves its entry as it was.
 * @param locate - The tool's lookups
 * @param run - What the call has to go on
 * @param run.targets - The call's targets, in the order named
 * @param run.checked - What the tool's check found
 * @param run.entries - One entry per target; changed in place
 * @param run.outcomes - What happened to each target
 */
export function noteMovedPaths<P, Checked, E>(
  locate: Locate<Checked> | undefined,
  run: {
    targets: Array<Target<P>>;
    checked: Checked;
    entries: Array<AnyEntry<E>>;
    outcomes: Outcome[];
  },
): void {
  const { targets, checked, entries, outcomes } = run;

  // Nothing written, nothing moved.
  if (locate == null || !outcomes.includes("written")) {
    return;
  }

  for (const [index, target] of targets.entries()) {
    const { named, atStart } = target;

    if (
      outcomes[index] !== "skipped" ||
      named.param !== "path" ||
      atStart === undefined
    ) {
      continue;
    }

    try {
      const clause = movedClause(locate, checked, named.value, atStart);

      if (clause != null) {
        appendDetail(entries[index] as TargetSkip, clause);
      }
    } catch {
      // The entry is right as far as it goes; the clause only adds to it.
    }
  }
}

// --- Helpers below main export ---

/**
 * What to add to a skip entry whose path may have moved on.
 * @param locate - The tool's lookups
 * @param checked - What the tool's check found
 * @param path - The path as the caller spelled it
 * @param atStart - What the path named when the call began: an id, or null
 * @returns The clause, or undefined when the path still names what it did
 */
function movedClause<Checked>(
  locate: Locate<Checked>,
  checked: Checked,
  path: string,
  atStart: string | null,
): string | undefined {
  const now = locate.idAt(path, checked);

  if (now === atStart) {
    return undefined;
  }

  if (atStart == null) {
    return "nothing was there when the call began";
  }

  // An object that is gone has nowhere to point to. One still at its path
  // moved nowhere, however the two lookups disagree.
  const where = locate.whereIs(atStart, path);

  return where == null || where.path === path
    ? undefined
    : `that ${where.noun} is now ${where.path} (id ${atStart})`;
}
