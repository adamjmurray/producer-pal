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
  namedParam,
  paramNamesSomething,
  parseCommaSeparatedIds,
  targetEntries,
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
 * Where a clip can go: a clip slot, or a track's arrangement — its main lane
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
 * Splits a path param into its entries without parsing them. A blank value
 * reads as omitted; everything else follows the target-list rule.
 * @param input - Comma-separated paths (e.g., "t1/d0" or "t1/d0,t2/d0")
 * @param label - Param name for error messages
 * @returns One trimmed entry per path, in order
 */
export function pathEntries(input?: string | null, label = "path"): string[] {
  return targetEntries(namedParam(input, label), label);
}

/**
 * Whether a path param names at least one entry. Silent, for a second read of
 * a param {@link namedHiddenPath} already reported on.
 * @param value - Raw param value
 * @returns True when the value names something
 */
export function pathNamesSomething(value: string | null | undefined): boolean {
  return paramNamesSomething(value) && parseCommaSeparatedIds(value).length > 0;
}

/**
 * Normalizes a hidden (deprecated or alias) path param. Like
 * {@link namedParam}, except a coerced null passes without a word: a caller
 * moving off the old param may send null for it, and there is nothing to tell
 * them about a param they were already meant to stop sending.
 *
 * A value whose entries are all empty (`","`) names nothing, so it reads as
 * unset — every caller pairs this with a published param and asks "were both
 * sent?", and counting an empty value as sent refuses a call that had no
 * conflict, or reports a move that never happened.
 * @param value - Raw param value
 * @param label - Param name, for the warning
 * @returns The trimmed value, or undefined when it names nothing
 */
export function namedHiddenPath(
  value: string | undefined,
  label: string,
): string | undefined {
  if (pathNamesSomething(value)) return value?.trim();

  // Unlike a coerced null, a comma is something the caller typed, so say the
  // value went nowhere. Silent otherwise, per the note above.
  if (paramNamesSomething(value)) {
    console.warn(`${label} "${value?.trim()}" names nothing`);
  }

  return undefined;
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
    `${describeNonClipPath(path)}; clips go to a track ("t0"), a take lane on it ("t0/l0"), or a clip slot ("t0/s1")`,
  );
}

/**
 * Narrows a path to a clip slot, for callers that can only act on one —
 * reading, selecting, or launching a clip in the grid.
 * @param path - Parsed path
 * @param label - Param name for error messages
 * @returns The track and scene the path names
 */
export function requireClipSlotPath(
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
      `${problem}; name a clip slot as "t<track>/s<scene>" ` +
        `(e.g., "t${clip.trackIndex}/s0")`,
    );
  }

  return { trackIndex: clip.trackIndex, sceneIndex: clip.sceneIndex };
}

/**
 * Parses a comma-separated list of clip slots.
 * @param input - Comma-separated paths (e.g., "t0/s1" or "t0/s1,t2/s3")
 * @param label - Param name for error messages
 * @returns One track/scene pair per path, in order
 */
export function parseClipSlotPathList(
  input: string | null | undefined,
  label = "path",
): Array<{ trackIndex: number; sceneIndex: number }> {
  return parseObjectPathList(input, label).map((path) =>
    requireClipSlotPath(path, label),
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
      return "return and main tracks have no clips";
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
      return "a clip slot holds no devices";
    default:
      return "a take lane holds no devices";
  }
}
