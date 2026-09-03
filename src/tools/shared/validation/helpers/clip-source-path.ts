// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Narrowing a path to one clip that already exists. A clip slot holds one clip,
// and so does one position on one arrangement lane — everything else an
// arrangement path can spell names more than one, so a tool acting on a
// specific clip refuses it and shows the complete form. Destinations take those
// partials; see dev/Object-Paths.md, "Complete and partial".

import {
  type ArrangementPosition,
  type CompleteArrangementPosition,
  type ExistingArrangementLane,
} from "./object-path-coord.ts";
import { requireClipPath, type ClipPath } from "./object-path-helpers.ts";
import { pathError } from "./object-path-lexer.ts";
import { formatObjectPath, type ObjectPath } from "../object-path.ts";

/** Where a clip that already exists can be found. */
export type ClipSourcePath =
  | Extract<ClipPath, { kind: "slot" }>
  | CompleteArrangementPosition;

/**
 * Rejects a path that doesn't name one existing clip, so a caller acting on a
 * specific clip gets told which half of the address is missing.
 * @param path - Parsed path
 * @param label - Param name for error messages
 * @returns The slot or the arrangement position the path names
 */
export function requireClipSourcePath(
  path: ObjectPath,
  label = "path",
): ClipSourcePath {
  if (path.kind === "arrangement-position") {
    return requireCompletePosition(path, label);
  }

  const clip = requireClipPath(path, label);

  if (clip.kind === "slot") return clip;

  throw pathError(label, formatObjectPath(clip), laneNamesManyClips(clip));
}

/**
 * Checks a song position carries a lane that holds clips today.
 * @param path - A parsed `[...]` coordinate
 * @param label - Param name for error messages
 * @returns The position, with its lane
 */
export function requireCompletePosition(
  path: ArrangementPosition,
  label: string,
): CompleteArrangementPosition {
  const { lane, position } = path;

  if (lane == null) {
    throw pathError(
      label,
      formatObjectPath(path),
      `a song position with no lane names a clip on every track; ` +
        `name the lane too, as "t<track>[${position}]"`,
    );
  }

  if (lane.kind === "new-take-lane" || lane.kind === "same-take-lane") {
    throw pathError(label, formatObjectPath(path), newLaneHoldsNoClips(lane));
  }

  return { ...path, lane };
}

// --- Helpers below main exports ---

/**
 * Says which half of the address a partial path is missing.
 * @param clip - A lane the path named without a position
 * @returns The reason, and the complete form to write instead
 */
function laneNamesManyClips(clip: Exclude<ClipPath, { kind: "slot" }>): string {
  if (clip.kind === "new-take-lane" || clip.kind === "same-take-lane") {
    return newLaneHoldsNoClips(clip);
  }

  const holder =
    clip.kind === "track" ? "a track's arrangement" : "a take lane";

  return (
    `${holder} holds many clips; name the one to act on by where it ` +
    `starts, as "${formatObjectPath(clip)}[5|1]"`
  );
}

/**
 * Says why `l+` names no clip. Nothing has landed on a lane that doesn't exist
 * yet, so there is no position to complete it with either.
 * @param lane - The `l+` the path named
 * @returns The reason, and a lane that could hold a clip
 */
function newLaneHoldsNoClips(lane: { trackIndex: number }): string {
  const existing: ExistingArrangementLane = {
    kind: "take-lane",
    trackIndex: lane.trackIndex,
    laneIndex: 0,
  };

  return (
    `a new take lane holds no clips; name a lane that exists, as ` +
    `"${formatObjectPath(existing)}[5|1]"`
  );
}
