// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Where a clip lands. An arrangement address has two halves, the lane and the
// time, and a destination may name either or both: `t0[5|1]` is both, `t0`
// keeps the clip's position, and `[5|1]` keeps its lane. Sources take neither
// partial; see dev/specs/tool-behavior/object-paths/README.md, "Complete and partial".

import {
  RETURN_CLIPS_NEED_LIVE_13,
  returnClipsExist,
} from "#src/tools/shared/clip/slot-contents/return-track-clips.ts";
import { refuseNamedTwice } from "#src/tools/shared/helpers/param-presence.ts";
import {
  formatObjectPath,
  parseObjectPath,
  type ObjectPath,
} from "../object-path.ts";
import { pathError } from "./object-path-lexer.ts";
import {
  parseObjectPathList,
  pathEntries,
  requireClipPath,
  type ClipPath,
  type ReturnSlotPath,
} from "./object-paths.ts";

/** The param name a path is sent under when the caller doesn't say. */
const PATH = "path";

/** The path kind a return track's clip slot has. */
const RETURN_SLOT = "return-slot";

/** One destination: the lane it named, the position it named, or both. */
export interface ClipDestinationPath<Lane = ClipPath> {
  /** The lane, or null when the entry is a bare `[5|1]`. */
  lane: Lane | null;
  /** The song position from the coordinate, or null when it carried none. */
  position: string | null;
}

/** A destination that may also name a Live 13 return track's clip slot. */
export type EnvelopeAwareDestination = ClipDestinationPath<
  ClipPath | ReturnSlotPath
>;

/**
 * Reads a destination path as its two halves.
 * @param path - Parsed path
 * @param label - Param name for error messages
 * @returns The lane and the position the path names
 */
export function requireClipDestinationPath(
  path: ObjectPath,
  label = PATH,
): ClipDestinationPath {
  if (path.kind === "arrangement-position") {
    return { lane: path.lane, position: path.position };
  }

  return { lane: requireClipPath(path, label), position: null };
}

/**
 * Reads a destination path as its two halves, for a tool that can send an
 * envelope clip to a return track's clip slot. Which clips may go where is the
 * tool's to say, per clip.
 * @param path - Parsed path
 * @param label - Param name for error messages
 * @returns The lane and the position the path names
 * @throws Error naming a return-track slot on a Live that has none
 */
export function requireEnvelopeAwareDestination(
  path: ObjectPath,
  label = PATH,
): EnvelopeAwareDestination {
  if (path.kind !== RETURN_SLOT) {
    return requireClipDestinationPath(path, label);
  }

  if (!returnClipsExist()) {
    throw pathError(label, formatObjectPath(path), RETURN_CLIPS_NEED_LIVE_13);
  }

  return { lane: path, position: null };
}

/**
 * Parses a comma-separated destination list for a tool that can send an
 * envelope clip to a return track's clip slot.
 * @param input - Comma-separated paths (e.g. "t0[5|1],rt1/s2")
 * @param label - Param name for error messages
 * @returns One entry per path, in order
 */
export function parseEnvelopeAwareDestinationList(
  input: string | null | undefined,
  label = PATH,
): EnvelopeAwareDestination[] {
  return parseObjectPathList(input, label).map((path) =>
    requireEnvelopeAwareDestination(path, label),
  );
}

/**
 * Parses a comma-separated destination list.
 * @param input - Comma-separated paths (e.g. "t0[5|1],[9|1],t2")
 * @param label - Param name for error messages
 * @returns One entry per path, in order
 */
export function parseClipDestinationList(
  input: string | null | undefined,
  label = PATH,
): ClipDestinationPath[] {
  return parseObjectPathList(input, label).map((path) =>
    requireClipDestinationPath(path, label),
  );
}

/**
 * Refuses a destination list naming a return track's clip slot, for a tool that
 * can never put a clip there. A tool that can send an envelope clip there reads
 * its destinations with {@link requireEnvelopeAwareDestination} instead.
 * @param input - Comma-separated destinations, already known to name something
 * @param label - Param name for error messages
 * @param reason - Says why no clip can go there; asked only when one is named
 * @throws Error naming the first return-track slot
 */
export function refuseReturnSlotDestinations(
  input: string,
  label: string,
  reason: () => string,
): void {
  for (const entry of pathEntries(input, label)) {
    const path = parseObjectPath(entry, label, true);

    if (path.kind === RETURN_SLOT) {
      throw pathError(label, formatObjectPath(path), reason());
    }
  }
}

/**
 * The lane or slot one destination entry names: null for a bare `[5|1]`, which
 * leaves each clip on its own lane, and for an entry that doesn't parse — the
 * code that resolves it reports that.
 * @param entry - One destination path entry
 * @param label - Param name for error messages
 * @returns The lane, or null
 */
export function destinationLane(
  entry: string,
  label = PATH,
): ClipPath | ReturnSlotPath | null {
  try {
    return requireEnvelopeAwareDestination(parseObjectPath(entry, label), label)
      .lane;
  } catch {
    return null;
  }
}

/**
 * What a toPath of one entry names: a bare `[5|1]` (or an entry that doesn't
 * parse, which is reported where it's resolved), or a track or take lane with
 * no position. A slot is neither — arrangementStart doesn't move it.
 * @param paths - toPath's entries, in call order
 * @returns Whether the lone entry is bare, or a track or lane alone
 */
export function loneToPath(paths: string[]): {
  bare: boolean;
  trackOrLane: boolean;
} {
  const only = paths.length === 1 ? (paths[0] as string) : null;

  if (only == null) {
    return { bare: false, trackOrLane: false };
  }

  const lane = destinationLane(only, "toPath");

  return {
    bare: lane == null,
    trackOrLane:
      lane != null &&
      lane.kind !== "slot" &&
      lane.kind !== RETURN_SLOT &&
      !pathCarriesPosition(only),
  };
}

/**
 * Whether a path param carries a `[song position]`. A "[" is only ever the
 * start of one — anything else the parser reports itself.
 * @param value - Raw path param value
 * @returns True when some entry names a position
 */
export function pathCarriesPosition(value: string | null | undefined): boolean {
  return value?.includes("[") ?? false;
}

/**
 * Refuses a call that spells one position twice, once in a path coordinate and
 * once in arrangementStart. They name the same thing, so honoring either is the
 * silent wrong-target bug the grammar exists to prevent — and nothing has run,
 * so the model can retry with one of them dropped.
 * @param rawPath - The destination path param as the caller sent it
 * @param arrangementStart - The position param as the caller sent it
 * @param label - The destination param's name
 * @param startParam - The param the position was sent in, if not arrangementStart
 */
export function refuseDoubledPosition(
  rawPath: string | null | undefined,
  arrangementStart: string | null | undefined,
  label: string,
  startParam = "arrangementStart",
): void {
  refuseNamedTwice({
    param: label,
    value: pathCarriesPosition(rawPath) ? rawPath : undefined,
    noun: "song position",
    also: { [startParam]: arrangementStart },
  });
}
