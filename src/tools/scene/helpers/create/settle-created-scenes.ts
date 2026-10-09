// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { withCreatedScenes } from "#src/tools/shared/clip/create-missing-scenes.ts";
import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import { createdRange } from "#src/tools/shared/helpers/created-range.ts";
import { placesAfter } from "#src/tools/shared/validation/lists/insertion-run.ts";
import { formatObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { type Done } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { leftScenesAt } from "../scene-slots.ts";
import { type CreateSceneChecked } from "./check-create-scene-call.ts";
import { type ScenePayload } from "./parse-create-scene-call.ts";
import {
  type CreatedSceneResult,
  type SceneEntry,
} from "./write-created-scene.ts";

/**
 * Stage 5: name each new scene where it sits now, and focus the last scene the
 * call made. A scene that never got made (a failed insert, the deadline) leaves
 * the others where the plan did not put them, so the Set is read then; while
 * every insert landed, the plan is exact. A failed insert's detail names the
 * empty scenes it left where they sit now, since later inserts can move them.
 * @param done - What the call did
 * @param done.checked - The checked call
 * @param done.entries - One entry per target
 * @param done.outcomes - What happened to each target
 */
export function settleCreatedScenes({
  checked,
  entries,
  outcomes,
}: Done<ScenePayload, CreateSceneChecked, SceneEntry>): void {
  const { run, liveSet, call } = checked;
  let ids: string[] | undefined;
  const readIds = (): string[] => (ids ??= liveSet.getChildIds("scenes"));
  const places = run == null ? [] : placesAfter(run, readIds);
  let last: string | undefined;

  for (const [index, entry] of entries.entries()) {
    const left = run?.left[index];

    if (left != null && "detail" in entry) {
      entry.detail = withCreatedScenes(
        left.reason,
        leftScenesAt(left.ids, readIds()),
      );
    }

    if (outcomes[index] !== "written" || !("id" in entry)) {
      continue;
    }

    last = entry.id;

    const place = places[index];

    if (place == null) {
      continue;
    }

    const scene = entry as CreatedSceneResult;

    scene.path = formatObjectPath({
      kind: "scene",
      sceneIndex: place.finalIndex,
    });

    if (place.emptyBelow === 0) {
      delete scene.created;
    } else {
      scene.created = createdRange(
        "s",
        place.finalIndex - place.emptyBelow,
        place.finalIndex - 1,
      );
    }
  }

  if (call.args.focus === true && last != null) {
    focusSelect({ view: "session", id: last });
  }
}
