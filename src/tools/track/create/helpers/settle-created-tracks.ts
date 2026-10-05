// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { placesAfter } from "#src/tools/shared/validation/lists/insertion-run.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { type Done } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { type CreateTrackChecked } from "./check-create-track-call.ts";
import { type CreateTrackTarget } from "./create-track-targets.ts";
import { type CreatedTrackResult } from "./write-created-track.ts";

/**
 * Stage 5: name each regular track where it sits now. A track that never got
 * made (a failed insert, the deadline) leaves the others where the plan did not
 * put them, so the Set is read then; while every insert landed, the plan is exact.
 * @param done - What the call did
 * @param done.checked - The checked call
 * @param done.entries - One entry per target
 * @param done.outcomes - What happened to each target
 */
export function settleCreatedTracks({
  checked,
  entries,
  outcomes,
}: Done<CreateTrackTarget, CreateTrackChecked, CreatedTrackResult>): void {
  const { run, entryOf, liveSet } = checked;

  if (run == null) {
    return;
  }

  const places = placesAfter(run, () => liveSet.getChildIds("tracks"));

  for (const [index, entry] of entries.entries()) {
    const place = places[entryOf[index] ?? -1];

    if (outcomes[index] === "written" && place != null) {
      (entry as CreatedTrackResult).path = formatObjectPath({
        kind: "track",
        trackIndex: place.finalIndex,
      });
    }
  }
}
