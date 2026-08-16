// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One path grammar for every "where does this go" param. Device paths already
// spoke it (`t1/d0`, `t0/d0/pC1`); this adds the two shapes clips need — a bare
// track and a session slot — so `toPath` can name any destination.
//
// Parsing only: nothing here touches the Live API, so a bad path fails before
// anything is created.

import * as console from "#src/shared/max/v8-max-console.ts";
import {
  deprecatedParamNamesSomething,
  parseCommaSeparatedIds,
} from "#src/tools/shared/utils.ts";

export type TrackSegment =
  | { kind: "track"; trackIndex: number }
  | { kind: "return-track"; returnIndex: number }
  | { kind: "master-track" };

export type DestinationPath =
  // t7 — a regular track, which for a clip means its arrangement
  | { kind: "track"; trackIndex: number }
  // t7/s2 — a session clip slot
  | { kind: "slot"; trackIndex: number; sceneIndex: number }
  // Anything only a device can occupy: rt0, mt, t1/d0, t0/d0/pC1, ...
  | { kind: "device"; path: string };

const TRACK_SEGMENT = /^t(\d+)$/;
const RETURN_TRACK_SEGMENT = /^rt(\d+)$/;
const SCENE_SEGMENT = /^s(\d+)$/;
// A leftover trackIndex/sceneIndex from the old toSlot param, e.g. "0" or "0/1"
const LEGACY_SLOT = /^\d+(\/\d+)?$/;

/**
 * Parses a destination path into what it names. Does not check that the object
 * exists — callers resolve the result against the Live API.
 * @param path - Destination path (e.g., "t7", "t7/s2", "t1/d0")
 * @param label - Param name for error messages
 * @returns What the path names
 */
export function parseDestinationPath(
  path: string,
  label = "toPath",
): DestinationPath {
  const trimmed = path.trim();

  if (trimmed === "") {
    throw new Error(`invalid ${label}: path is empty`);
  }

  if (LEGACY_SLOT.test(trimmed)) {
    const [track, scene] = trimmed.split("/");

    throw new Error(
      `invalid ${label} "${trimmed}" - paths need segment prefixes; did you mean ` +
        (scene == null ? `"t${track}"` : `"t${track}/s${scene}"`) +
        "?",
    );
  }

  const segments = trimmed.split("/");

  // "t1/" is a typo, not a device path — without this it falls through to the
  // device branch and reports a problem with device paths.
  if (segments.some((segment) => segment === "")) {
    throw new Error(
      `invalid ${label} "${trimmed}" - it has an empty segment; drop the stray "/"`,
    );
  }

  const track = parseTrackSegment(segments[0] as string, label, trimmed);
  const sceneIndex = segments.findIndex(
    (segment, i) => i > 0 && SCENE_SEGMENT.test(segment),
  );

  if (sceneIndex !== -1) {
    return parseSlotPath(track, segments, sceneIndex, label, trimmed);
  }

  if (segments.length === 1 && track.kind === "track") {
    return { kind: "track", trackIndex: track.trackIndex };
  }

  return { kind: "device", path: trimmed };
}

/**
 * Parses a comma-separated list of destination paths.
 * @param input - Comma-separated paths (e.g., "t7" or "t7,t8")
 * @param label - Param name for error messages
 * @returns One entry per path, in order
 */
export function parseDestinationPathList(
  input?: string | null,
  label = "toPath",
): DestinationPath[] {
  const named = namedDestination(input ?? undefined);

  if (named == null) return [];

  const entries = parseCommaSeparatedIds(named);

  // "," names nothing but was still sent. An empty list means "wherever the
  // caller didn't say" downstream — the source clip's own track — so accepting
  // it here is the silent wrong-destination this param exists to prevent.
  if (entries.length === 0) {
    throw new Error(`invalid ${label} "${input}" - it names no destination`);
  }

  // Destinations are cycled against a position list, so a dropped entry shifts
  // every later copy onto the wrong track instead of just making one fewer.
  if (entries.length < named.split(",").length) {
    console.warn(
      `${label} "${input}" has empty entries, which were dropped; the remaining paths cycle across the positions`,
    );
  }

  return entries.map((entry) => parseDestinationPath(entry, label));
}

/**
 * Normalizes a destination param: a blank value reads the same as an omitted
 * param rather than as a destination that failed to parse. Anything else is
 * kept, including "null" — z.coerce.string() produces that for a JSON null,
 * and reading it as unset sends the copy to the source's own track without a
 * word about it.
 * @param value - Raw param value
 * @returns The trimmed value, or undefined when it names nothing
 */
export function namedDestination(
  value: string | undefined,
): string | undefined {
  const trimmed = value?.trim();

  return trimmed == null || trimmed === "" ? undefined : trimmed;
}

/**
 * Normalizes a deprecated destination param. Like {@link namedDestination},
 * except a coerced null also reads as unset: a caller moving off the old param
 * may send null for it, and that must not count as a second destination.
 * @param value - Raw param value
 * @returns The trimmed value, or undefined when it names nothing
 */
export function namedDeprecatedDestination(
  value: string | undefined,
): string | undefined {
  return deprecatedParamNamesSomething(value)
    ? namedDestination(value)
    : undefined;
}

/**
 * Parses a leading track segment.
 * @param segment - Track segment (e.g., "t0", "rt0", "mt")
 * @param label - Param name for error messages; required, because a default
 *   here names the wrong param for half the callers
 * @param input - Full path, for error messages
 * @returns Which track the segment names
 */
export function parseTrackSegment(
  segment: string,
  label: string,
  input = segment,
): TrackSegment {
  if (segment === "mt") {
    return { kind: "master-track" };
  }

  const returnTrack = RETURN_TRACK_SEGMENT.exec(segment);

  if (returnTrack) {
    return { kind: "return-track", returnIndex: Number(returnTrack[1]) };
  }

  const track = TRACK_SEGMENT.exec(segment);

  if (track) {
    return { kind: "track", trackIndex: Number(track[1]) };
  }

  throw new Error(
    `invalid ${label} "${input}" - "${segment}" is not a track; expected "t<index>", "rt<index>", or "mt"`,
  );
}

/**
 * Rejects a destination a clip can't occupy, so a clip caller gets a message
 * about clips rather than one about devices.
 * @param destination - Parsed destination path
 * @param label - Param name for error messages
 * @returns The destination, narrowed to the shapes a clip can use
 */
export function requireClipDestination(
  destination: DestinationPath,
  label = "toPath",
): Exclude<DestinationPath, { kind: "device" }> {
  if (destination.kind === "device") {
    throw new Error(
      `invalid ${label} "${destination.path}" - clips go to a track ("t0") or a session slot ("t0/s1"); ` +
        "device paths and return/master tracks hold no clips",
    );
  }

  return destination;
}

// --- Helpers below main exports ---

/**
 * Builds a session slot destination, rejecting scene segments anywhere a slot
 * can't be.
 * @param track - Parsed leading track segment
 * @param segments - All path segments
 * @param sceneIndex - Position of the scene segment within segments
 * @param label - Param name for error messages
 * @param input - Full path, for error messages
 * @returns The slot destination
 */
function parseSlotPath(
  track: TrackSegment,
  segments: string[],
  sceneIndex: number,
  label: string,
  input: string,
): DestinationPath {
  if (track.kind !== "track" || sceneIndex !== 1 || segments.length !== 2) {
    throw new Error(
      `invalid ${label} "${input}" - a session slot is "t<track>/s<scene>" (e.g., "t0/s1"); ` +
        "only regular tracks have scenes",
    );
  }

  const scene = SCENE_SEGMENT.exec(segments[1] as string);

  return {
    kind: "slot",
    trackIndex: track.trackIndex,
    // The regex matched, so the capture is a run of digits
    sceneIndex: Number((scene as RegExpExecArray)[1]),
  };
}
