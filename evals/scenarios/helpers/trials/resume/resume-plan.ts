// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * What a resumed run has left to do.
 */

import { type ResumedTrials } from "./resumed-trials.ts";

/**
 * Say how much of a resumed run is done and how much will run.
 *
 * @param runId - The run being resumed
 * @param resumed - The trials its folder already holds
 * @param plannedKeys - Every trial the run plans (see `plannedTrialKeys`)
 * @returns One line, e.g. "Resuming r: 790 of 792 done; 2 to run (2 errored, 0 not run)"
 */
export function describeResume(
  runId: string,
  resumed: ResumedTrials,
  plannedKeys: string[],
): string {
  const done = plannedKeys.filter((key) => resumed.done.has(key)).length;
  const errored = plannedKeys.filter(
    (key) => !resumed.done.has(key) && resumed.errored.has(key),
  ).length;
  const toRun = plannedKeys.length - done;

  return (
    `Resuming ${runId}: ${done} of ${plannedKeys.length} done; ` +
    `${toRun} to run (${errored} errored, ${toRun - errored} not run)`
  );
}
