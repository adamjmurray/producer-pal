// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  resolveTakeLane,
  takeLaneLabel,
  type ArrangementTrack,
  type ResolvedTakeLane,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { type Step } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { duplicateOneCopy } from "../clip/duplicate-one-copy.ts";
import { clearedCopy } from "../minimal-clip-info.ts";
import {
  type ArrangementCopy,
  type CopyLabel,
  type DuplicateCall,
  type DuplicateRun,
} from "./duplicate-call-types.ts";
import { liveObject, meterOf, trackFor } from "./duplicate-run.ts";

/**
 * Make one clip copy on the arrangement. A copy Live declined after clearing
 * clips still changed the Set, so it keeps its entry and says what was cleared;
 * one that cleared nothing is a skip.
 * @param body - The copy to make
 * @param label - Its name, color and length
 * @param named - Where it is headed, as a skip entry spells it
 * @param named.value - The destination's path
 * @param step - The copy's turn in the call
 * @param run - The call's shared state
 * @returns The copy's entry
 * @throws Error when no copy landed and nothing was cleared
 */
export async function writeArrangementCopy(
  body: ArrangementCopy,
  label: CopyLabel,
  named: { value: string },
  step: Step<DuplicateCall>,
  run: DuplicateRun,
): Promise<object> {
  const { target } = body;
  const { numerator, denominator } = meterOf(run);

  // One track serves every copy to it; the copy takes it from the call's.
  trackFor(run, target.trackIndex);

  const attempt = await duplicateOneCopy({
    target,
    startBeats: body.startBeats,
    laneFor: () => laneFor(target, step, run),
    object: liveObject(run, body.sourceId),
    id: body.sourceId,
    name: label.name,
    color: label.color,
    arrangementLength: label.length,
    songTimeSigNumerator: numerator,
    songTimeSigDenominator: denominator,
    context: run.context,
    tracks: run.tracks,
    ledger: run.ledger,
  });

  if (attempt.copy != null) {
    step.coverLanded();

    return attempt.copy;
  }

  // Live declined the copy after its landing cleared clips: the Set changed,
  // so the entry says so without `ok: false`, and it counts as landed.
  if (attempt.cleared != null) {
    step.coverLanded();

    return clearedCopy(named.value, `${attempt.refused}; ${attempt.cleared}`);
  }

  throw new Error(attempt.refused);
}

// --- Helpers below main export ---

/**
 * The take lane a copy lands on, made when it isn't there yet. A lane can't be
 * deleted, so one made is said to have landed whatever the copy then does.
 * @param target - The destination
 * @param step - The copy's turn in the call
 * @param run - The call's shared state
 * @returns The lane
 */
function laneFor(
  target: ArrangementTrack,
  step: Step<DuplicateCall>,
  run: DuplicateRun,
): ResolvedTakeLane {
  const key = takeLaneLabel(target);
  const known = run.lanes.get(key);

  if (known != null) {
    return known;
  }

  const track = trackFor(run, target.trackIndex);
  const before = track.getChildCount("take_lanes");
  let resolved: ResolvedTakeLane;

  try {
    resolved = resolveTakeLane(
      track,
      target.takeLane as number,
      run.takeLaneName,
    );
  } catch (error) {
    // Some of the lanes may have been made before Live stopped.
    if (track.getChildCount("take_lanes") > before) {
      step.landed(
        `take lanes made on ${takeLaneLabel({ ...target, takeLane: null })}`,
      );
    }

    throw error;
  }

  if (resolved.laneIndex >= before) {
    step.landed(`take lane ${key} made`);
  }

  run.lanes.set(key, resolved);

  return resolved;
}
