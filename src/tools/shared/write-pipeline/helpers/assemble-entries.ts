// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type TargetSkip } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  type AnyEntry,
  type Outcome,
  type PipelineResult,
} from "../write-pipeline-types.ts";

/**
 * Stage 5's answer: one entry per target in the order named, each target's
 * extra entries right after its own, or the lone entry on its own. A lone
 * target that was skipped throws its detail, since there is no list for its
 * entry to hold a place in. A lone target that made several entries returns
 * them as a list.
 * @param entries - One per target, in the order named
 * @param pieces - The extra entries each target made
 * @param outcomes - What happened to each
 * @returns The call's result
 * @throws Error with the detail of a lone skipped target
 */
export function assembleEntries<E extends object>(
  entries: Array<AnyEntry<E>>,
  pieces: E[][],
  outcomes: Outcome[],
): PipelineResult<E> {
  const all = entries.flatMap((entry, index) => [
    entry,
    ...(pieces[index] as E[]),
  ]);

  if (all.length !== 1) {
    return all;
  }

  const only = all[0] as AnyEntry<E>;

  if (outcomes[0] === "skipped") {
    throw new Error((only as TargetSkip).detail);
  }

  return only as E;
}
