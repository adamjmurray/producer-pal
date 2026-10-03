// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { atomToString } from "#src/shared/max/max-atoms.ts";
import { joinDetails } from "#src/tools/shared/helpers/entry-details.ts";
import { landedColor } from "#src/tools/shared/helpers/landed-color.ts";
import { newTargetNotes } from "#src/tools/shared/helpers/target-notes.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { type Insertion } from "#src/tools/shared/validation/lists/insertion-plan.ts";
import {
  insertFailed,
  insertMade,
  insertionFor,
} from "#src/tools/shared/validation/lists/insertion-run.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import {
  type AppliedTarget,
  type Step,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { returnTrackRename } from "#src/tools/track/helpers/return-track-rename.ts";
import { applyTrackSwitches } from "#src/tools/track/update/helpers/track-switch-updates.ts";
import { type CreateTrackChecked } from "./check-create-track-call.ts";
import { type CreateTrackTarget } from "./create-track-targets.ts";

export interface CreatedTrackResult {
  id: string;
  path: string;
  /**
   * The name the track ended up with, when it isn't the one asked for. `detail`
   * says why, and there is no `ok` — the track was made.
   */
  name?: string;
  /** The palette color Live settled on, when it isn't the one asked for */
  color?: string;
  detail?: string;
}

/**
 * Stage 4: make one track, then name, color and switch it. A throw once the
 * track exists keeps its entry, with a detail for what didn't happen.
 * @param target - The target
 * @param step - The call's state for this target
 * @returns The target's entry
 * @throws Error when Live makes no track
 */
export function writeCreatedTrack(
  target: AppliedTarget<CreateTrackTarget>,
  step: Step<CreateTrackChecked>,
): CreatedTrackResult {
  const { checked, index } = step;
  const { liveSet, run, call } = checked;
  const entry = checked.entryOf[index];
  const insertion =
    run == null || entry == null
      ? null
      : insertionFor(run, entry, () => liveSet.getChildIds("tracks"));
  let id: string;

  try {
    id = createSingleTrack(liveSet, target.data, insertion);
  } catch (error) {
    // The tracks after this one were planned on the assumption it landed.
    if (run != null && entry != null) {
      insertFailed(run);
    }

    throw error;
  }

  const path = formatObjectPath(
    insertion == null
      ? {
          kind: "return-track",
          returnIndex: checked.returnBase + checked.returnsMade++,
        }
      : { kind: "track", trackIndex: insertion.finalIndex },
  );

  if (run != null && entry != null) {
    insertMade(run, entry, `id ${id}`);
  }

  step.landed("track created", { id, path });

  const track = LiveAPI.from(`id ${id}`);
  const rename = returnTrackRename(
    track.path,
    getNameForIndex(call.name, index, checked.parsedNames),
  );
  const trackColor = getColorForIndex(call.color, index, checked.parsedColors);
  const notes = newTargetNotes();

  track.setAll({ name: rename.write, color: trackColor });
  applyTrackSwitches(
    track,
    { mute: call.mute, solo: call.solo, arm: call.arm },
    notes,
  );

  const landed = trackColor == null ? {} : landedColor(track, trackColor);
  const detail = joinDetails([
    rename.landed.detail,
    landed.detail,
    ...notes.said,
  ]);

  return {
    id,
    path,
    ...rename.landed,
    ...landed,
    ...(detail == null ? {} : { detail }),
  };
}

// --- Helpers below main export ---

/**
 * Create a single track via Live API
 * @param liveSet - Live set object
 * @param target - Which Live call to make
 * @param insertion - Where a regular track goes; null for a return track
 * @returns Track ID
 * @throws Error when Live answers with no track
 */
function createSingleTrack(
  liveSet: LiveAPI,
  target: CreateTrackTarget,
  insertion: Insertion | null,
): string {
  let result: unknown;

  if (insertion == null) {
    result = liveSet.call("create_return_track");
  } else {
    const index = insertion.insertIndex === "end" ? -1 : insertion.insertIndex;

    result =
      target.type === "midi"
        ? liveSet.call("create_midi_track", index)
        : liveSet.call("create_audio_track", index);
  }

  // Live API returns ["id", 123] — the second element is a NUMBER (Live
  // 12.4.3). Every other tool's id comes from `api.id`, always a string, so
  // stringify to keep `id` one type across the whole tool surface.
  const id = Array.isArray(result) ? (result as unknown[])[1] : null;

  if (id == null) {
    throw new Error("Live did not create the track");
  }

  return atomToString(id);
}
