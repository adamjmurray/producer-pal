// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type InsertionSpot } from "#src/tools/shared/validation/lists/insertion-plan.ts";
import {
  type InsertionRun,
  startInsertionRun,
} from "#src/tools/shared/validation/lists/insertion-run.ts";
import {
  type PairedLabels,
  pairLabels,
} from "#src/tools/shared/validation/lists/labeled-targets.ts";
import {
  type ListEntries,
  splitList,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import { type Target } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { validateSceneIndexCap } from "../scene-slots.ts";
import { validateTimeSignatures } from "../scene-tempo-signature.ts";
import {
  type CreateSceneCall,
  type ScenePayload,
} from "./parse-create-scene-call.ts";

/** What the check found, shared by every target's write. */
export interface CreateSceneChecked extends PairedLabels {
  liveSet: LiveAPI;
  call: CreateSceneCall;
  /** The scenes' inserts; null for a capture */
  run: InsertionRun | null;
  /** The timeSignature list, one per scene, or null when it is one value */
  timeSignatures: ListEntries | null;
}

/**
 * Stage 3: plan where the scenes go, refuse a call past the scene cap, and pair
 * names, colors and time signatures with the scenes. Reads only.
 * @param call - The create-scene call
 * @param targets - The call's targets
 * @returns What every write shares
 * @throws Error when a scene would land past the cap, or a list or time
 *   signature can't be used
 */
export function checkCreateSceneCall(
  call: CreateSceneCall,
  targets: Array<Target<ScenePayload>>,
): CreateSceneChecked {
  const { name, color, timeSignature } = call.args;
  const liveSet = LiveAPI.from(livePath.liveSet);

  if (call.capture) {
    // Checked before capturing: they're only applied once the scene exists.
    const labels = pairLabels({ noun: "scene", count: 1, color });

    validateTimeSignatures(timeSignature, null);

    return { ...labels, liveSet, call, run: null, timeSignatures: null };
  }

  const spots = targets.map(
    ({ data }) => (data as { spot: InsertionSpot }).spot,
  );

  // Checked before planning too: a huge index would fill the plan with that
  // many empty scenes first.
  validateSceneIndexCap(
    spots.filter((spot): spot is number => spot !== "end"),
    spots.length,
  );

  const run = startInsertionRun(spots, liveSet.getChildIds("scenes"), true);

  validateSceneIndexCap(run.plan.map((insertion) => insertion.finalIndex));

  const labels = pairLabels({
    noun: "scene",
    count: spots.length,
    name,
    color,
  });
  const timeSignatures = splitList(
    timeSignature ?? undefined,
    spots.length,
    "timeSignature",
  );

  validateTimeSignatures(timeSignature, timeSignatures);

  return { ...labels, liveSet, call, run, timeSignatures };
}
