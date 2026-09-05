// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The `[song position]` coordinate: which lanes may carry one, and building the
// path it makes. See dev/Object-Paths.md.

import { type ObjectPath } from "../object-path.ts";
import { pathError } from "./object-path-lexer.ts";

/**
 * An arrangement lane a coordinate can sit on — the subset of ObjectPath a
 * `[...]` accepts. Spelled out rather than Extract-ed, because ObjectPath
 * carries an ArrangementPosition and the two would refer to each other.
 * {@link isArrangementLane} is the runtime half, and TS rejects the predicate
 * if these members ever stop matching ObjectPath's.
 */
export type ArrangementLane =
  | { kind: "track"; trackIndex: number }
  | { kind: "take-lane"; trackIndex: number; laneIndex: number }
  | { kind: "new-take-lane"; trackIndex: number }
  | { kind: "same-take-lane"; trackIndex: number };

/** A lane that exists, so it can already hold clips. */
export type ExistingArrangementLane = Exclude<
  ArrangementLane,
  { kind: "new-take-lane" } | { kind: "same-take-lane" }
>;

/** A point on the song timeline, with the arrangement lane it sits on. */
export interface ArrangementPosition {
  kind: "arrangement-position";
  /** The lane, or null when the path is a bare `[5|1]`. */
  lane: ArrangementLane | null;
  /** The song position as the caller spelled it, bar|beat or `loc:`. */
  position: string;
}

/**
 * Both halves of an arrangement location, on a lane that exists — the one
 * shape that names a single clip. See dev/Object-Paths.md, "Complete and
 * partial".
 */
export interface CompleteArrangementPosition extends ArrangementPosition {
  lane: ExistingArrangementLane;
}

/**
 * Builds the path a `[...]` coordinate makes, once its lane has been parsed.
 *
 * Only a regular track's arrangement has a timeline to sit on: a session slot
 * already holds exactly one clip, a return or main track has no arrangement,
 * and a device has no place on the song timeline. A null lane is a bare
 * `[5|1]`, which leaves the lane open.
 * @param lane - What the path before the bracket named, or null when empty
 * @param position - The song position from inside the brackets
 * @param label - Param name for error messages
 * @param input - Full path, for error messages
 * @returns The lane and position the path names
 */
export function arrangementPosition(
  lane: ObjectPath | null,
  position: string,
  label: string,
  input: string,
): ArrangementPosition {
  if (lane != null && !isArrangementLane(lane)) {
    throw pathError(
      label,
      input,
      `a song position needs an arrangement lane; expected "t<track>", ` +
        `"t<track>/l<lane>", "t<track>/l+", "t<track>/l=", or ` +
        `"[${position}]" on its own`,
    );
  }

  return { kind: "arrangement-position", lane, position };
}

/**
 * Whether a path names a lane a song position can sit on.
 * @param path - A parsed path
 * @returns True for a track, a take lane, or a lane an "l+"/"l=" will make
 */
function isArrangementLane(path: ObjectPath): path is ArrangementLane {
  return (
    path.kind === "track" ||
    path.kind === "take-lane" ||
    path.kind === "new-take-lane" ||
    path.kind === "same-take-lane"
  );
}
