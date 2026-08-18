// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reading path params, and narrowing a parsed path to what a caller can act on.
// A path parses the same everywhere; what a tool accepts differs by what can
// occupy the location, so the rejection names the caller's own concept.

import * as console from "#src/shared/max/v8-max-console.ts";
import {
  livePath,
  type TrackPath,
} from "#src/shared/live-api-path-builders.ts";
import {
  hiddenParamNamesSomething,
  parseCommaSeparatedIds,
} from "#src/tools/shared/utils.ts";
import {
  formatObjectPath,
  parseObjectPath,
  pathError,
  type DeviceSegment,
  type ObjectPath,
  type TrackSegment,
} from "#src/tools/shared/validation/object-path.ts";

/**
 * Where a clip can go: a session slot, or a track's arrangement — its main lane
 * (`t0`), one of its take lanes (`t0/l0`), or a fresh one (`t0/l+`).
 */
export type ClipPath = Extract<
  ObjectPath,
  { kind: "track" | "slot" | "take-lane" | "new-take-lane" }
>;

/** A track or device-chain location, which is what can hold a device. */
export interface DeviceContainerPath {
  root: TrackSegment;
  segments: DeviceSegment[];
}

/**
 * Parses a comma-separated list of paths.
 * @param input - Comma-separated paths (e.g., "t7" or "t7,t8")
 * @param label - Param name for error messages
 * @returns One entry per path, in order
 */
export function parseObjectPathList(
  input?: string | null,
  label = "path",
): ObjectPath[] {
  return pathEntries(input, label).map((entry) =>
    parseObjectPath(entry, label),
  );
}

/**
 * Splits a path param into its entries without parsing them: a blank value
 * reads as omitted, one that names nothing is refused, and dropped entries are
 * announced.
 * @param input - Comma-separated paths (e.g., "t1/d0" or "t1/d0,t2/d0")
 * @param label - Param name for error messages
 * @returns One trimmed entry per path, in order
 */
export function pathEntries(input?: string | null, label = "path"): string[] {
  const named = namedPath(input ?? undefined);

  if (named == null) return [];

  const entries = parseCommaSeparatedIds(named);

  // "," names nothing but was still sent. An empty list means "wherever the
  // caller didn't say" downstream — the source's own track — so accepting it
  // here is the silent wrong-destination this param exists to prevent.
  if (entries.length === 0) {
    throw new Error(`invalid ${label} "${input}" - it names no destination`);
  }

  // Entries are positional — a clip's are cycled against its positions, a
  // device's against its names — so a dropped one shifts every later copy
  // instead of just making one fewer.
  if (entries.length < named.split(",").length) {
    console.warn(
      `${label} "${input}" has empty entries, which were dropped; later destinations shift up`,
    );
  }

  return entries;
}

/**
 * Normalizes a path param: a blank value reads the same as an omitted param
 * rather than as a path that failed to parse. Anything else is kept, including
 * "null" — z.coerce.string() produces that for a JSON null, and reading it as
 * unset sends the copy to the source's own track without a word about it.
 * @param value - Raw param value
 * @returns The trimmed value, or undefined when it names nothing
 */
export function namedPath(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed == null || trimmed === "" ? undefined : trimmed;
}

/**
 * Normalizes a hidden (deprecated or alias) path param. Like {@link namedPath},
 * except a coerced null also reads as unset: a caller moving off the old param
 * may send null for it, and that must not count as a second destination.
 * @param value - Raw param value
 * @returns The trimmed value, or undefined when it names nothing
 */
export function namedHiddenPath(value: string | undefined): string | undefined {
  return hiddenParamNamesSomething(value) ? namedPath(value) : undefined;
}

/**
 * The path a session clip's slot spells.
 * @param trackIndex - 0-based track index
 * @param sceneIndex - 0-based scene index
 * @returns The path (e.g. "t0/s3")
 */
export function slotPath(trackIndex: number, sceneIndex: number): string {
  return formatObjectPath({ kind: "slot", trackIndex, sceneIndex });
}

/**
 * The path an arrangement clip's lane spells — the track itself for the main
 * lane, or the take lane it sits on.
 * @param trackIndex - 0-based track index
 * @param takeLane - 0-based lane index, "new" for an unresolved `l+`, or null
 *   for the main lane
 * @returns The path (e.g. "t0", "t0/l0", or "t0/l+")
 */
export function arrangementPath(
  trackIndex: number,
  takeLane?: number | "new" | null,
): string {
  if (takeLane == null) return formatObjectPath({ kind: "track", trackIndex });

  return formatObjectPath(
    takeLane === "new"
      ? { kind: "new-take-lane", trackIndex }
      : { kind: "take-lane", trackIndex, laneIndex: takeLane },
  );
}

/**
 * Rejects a path a clip can't occupy, so a clip caller gets a message about
 * clips rather than one about devices.
 * @param path - Parsed path
 * @param label - Param name for error messages
 * @returns The path, narrowed to the shapes a clip can use
 */
export function requireClipPath(path: ObjectPath, label = "path"): ClipPath {
  if (
    path.kind === "track" ||
    path.kind === "slot" ||
    path.kind === "take-lane" ||
    path.kind === "new-take-lane"
  ) {
    return path;
  }

  throw pathError(
    label,
    formatObjectPath(path),
    `${describeNonClipPath(path)}; clips go to a track ("t0"), a take lane on it ("t0/l0"), or a session slot ("t0/s1")`,
  );
}

/**
 * Narrows a path to a session position, for callers that can only act on one —
 * reading, selecting, or launching a clip in the grid.
 * @param path - Parsed path
 * @param label - Param name for error messages
 * @returns The track and scene the path names
 */
export function requireSessionSlot(
  path: ObjectPath,
  label = "path",
): { trackIndex: number; sceneIndex: number } {
  const clip = requireClipPath(path, label);

  if (clip.kind !== "slot") {
    const problem =
      clip.kind === "track"
        ? "a track has no one clip"
        : "take lanes hold arrangement clips";

    throw pathError(
      label,
      formatObjectPath(clip),
      `${problem}; name a session position as "t<track>/s<scene>" ` +
        `(e.g., "t${clip.trackIndex}/s0")`,
    );
  }

  return { trackIndex: clip.trackIndex, sceneIndex: clip.sceneIndex };
}

/**
 * Parses a comma-separated list of session positions.
 * @param input - Comma-separated paths (e.g., "t0/s1" or "t0/s1,t2/s3")
 * @param label - Param name for error messages
 * @returns One track/scene pair per path, in order
 */
export function parseSessionSlotList(
  input: string | null | undefined,
  label = "path",
): Array<{ trackIndex: number; sceneIndex: number }> {
  return parseObjectPathList(input, label).map((path) =>
    requireSessionSlot(path, label),
  );
}

/**
 * Narrows a path to something that can hold a device — a track, or a spot down
 * its device chain.
 * @param path - Parsed path
 * @param label - Param name for error messages
 * @returns The track root and any device-chain segments below it
 */
export function requireDeviceContainer(
  path: ObjectPath,
  label = "path",
): DeviceContainerPath {
  if (path.kind === "device") {
    return { root: path.root, segments: path.segments };
  }

  if (
    path.kind === "track" ||
    path.kind === "return-track" ||
    path.kind === "master-track"
  ) {
    return { root: path, segments: [] };
  }

  throw pathError(
    label,
    formatObjectPath(path),
    `${describeNonDevicePath(path)}; devices live on a track ("t0") or down its device chain ("t0/d0")`,
  );
}

/**
 * Narrows a path to a device or chain, for callers that need one to exist
 * rather than a place to put one.
 * @param path - Parsed path
 * @param label - Param name for error messages
 * @returns The track root and its device-chain segments, at least one
 */
export function requireDevicePath(
  path: ObjectPath,
  label = "path",
): DeviceContainerPath {
  const container = requireDeviceContainer(path, label);

  if (container.segments.length === 0) {
    throw pathError(
      label,
      formatObjectPath(path),
      `a track is not a device; add a device index (e.g. "${formatObjectPath(path)}/d0")`,
    );
  }

  return container;
}

/**
 * Maps a track root onto its Live API path.
 * @param track - A parsed track root
 * @returns The Live API path builder for that track
 */
export function trackSegmentPath(track: TrackSegment): TrackPath {
  if (track.kind === "master-track") return livePath.masterTrack();

  if (track.kind === "return-track") {
    return livePath.returnTrack(track.returnIndex);
  }

  return livePath.track(track.trackIndex);
}

// --- Helpers below main exports ---

/**
 * Says why a path holds no clip, in the caller's terms.
 * @param path - A path that isn't a clip destination
 * @returns The reason, as a sentence fragment
 */
function describeNonClipPath(path: ObjectPath): string {
  switch (path.kind) {
    case "device":
      return "device paths hold no clips";
    case "scene":
      return "a scene alone names no track";
    default:
      return "return and master tracks have no clips";
  }
}

/**
 * Says why a path holds no device, in the caller's terms.
 * @param path - A path that can't hold a device
 * @returns The reason, as a sentence fragment
 */
function describeNonDevicePath(path: ObjectPath): string {
  switch (path.kind) {
    case "scene":
      return "a scene holds no devices";
    case "slot":
      return "a session slot holds no devices";
    default:
      return "a take lane holds no devices";
  }
}
