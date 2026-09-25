// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The `path` an index names, for errors and for the warnings that retire the
// index params. Kept free of imports so a tool schema can reach it.

// Longer lists are too long for an example; count's warning says to repeat
// the path once per track or scene.
const MAX_LISTED = 5;

/**
 * The track path an index and category name.
 * @param category - "regular", "return" or "master"
 * @param trackIndex - Its 0-based index
 * @returns The path, e.g. "t2", "rt0", "mt"
 */
export function trackCategoryPath(
  category: string | undefined,
  trackIndex: number,
): string {
  if (category === "master") {
    return "mt";
  }

  const prefix = category === "return" ? "rt" : "t";

  // create-track spells "append" as -1, and a path spells it "+".
  return trackIndex < 0 ? `${prefix}+` : `${prefix}${String(trackIndex)}`;
}

/**
 * The track path a call's deprecated trackIndex/trackType named.
 * @param args - The args the call sent
 * @returns The path, or undefined when the args don't determine one
 */
export function trackPathFromIndex(
  args: Record<string, unknown>,
): string | undefined {
  if (args.trackType === "master") {
    return "mt";
  }

  return typeof args.trackIndex === "number"
    ? trackCategoryPath(args.trackType as string | undefined, args.trackIndex)
    : undefined;
}

/**
 * The path for where create-track's deprecated trackIndex put new tracks: one
 * entry per track when count is small, else the one place they all go.
 * @param args - The args the call sent
 * @returns The path, or undefined when no single path names the place
 */
export function newTrackPathFromIndex(
  args: Record<string, unknown>,
): string | undefined {
  return newTrackPathFromCount(args) ?? newTrackPlace(args);
}

/**
 * The path list that makes the same tracks as create-track's deprecated count.
 * It sends the same targets as the call did, so it fails wherever the call
 * would, the track cap included.
 * @param args - The args the call sent
 * @returns The list, or undefined when it would be too long to show
 */
export function newTrackPathFromCount(
  args: Record<string, unknown>,
): string | undefined {
  return repeatPerCount(args, newTrackPlace(args));
}

/**
 * The scene path a call's deprecated sceneIndex named.
 * @param args - The args the call sent
 * @returns The path, or undefined when no sceneIndex was sent
 */
export function scenePathFromIndex(
  args: Record<string, unknown>,
): string | undefined {
  const index = args.sceneIndex;

  return typeof index === "number" ? `s${String(index)}` : undefined;
}

/**
 * The path for where create-scene's deprecated sceneIndex put new scenes: one
 * entry per scene when count is small, else the one place they all go.
 * @param args - The args the call sent
 * @returns The path, or undefined when no single path names the place
 */
export function newScenePathFromIndex(
  args: Record<string, unknown>,
): string | undefined {
  return newScenePathFromCount(args) ?? newScenePlace(args);
}

/**
 * The path list that makes the same scenes as create-scene's deprecated count.
 * @param args - The args the call sent
 * @returns The list, or undefined when it would be too long to show, or when
 * capture ignored count
 */
export function newScenePathFromCount(
  args: Record<string, unknown>,
): string | undefined {
  return args.capture === true
    ? undefined
    : repeatPerCount(args, newScenePlace(args));
}

/**
 * A place repeated once per new target, as count asked for.
 * @param args - The args the call sent
 * @param place - The one place, or undefined when there is none
 * @returns The list, or undefined when it would be too long to show
 */
function repeatPerCount(
  args: Record<string, unknown>,
  place: string | undefined,
): string | undefined {
  const count = typeof args.count === "number" ? args.count : 1;

  if (place == null || count > MAX_LISTED) {
    return undefined;
  }

  return Array.from({ length: count }, () => place).join(",");
}

/**
 * The one place the call's own path names.
 * @param args - The args the call sent
 * @returns The path, "" when unsent, or undefined for a path list, which count
 * can't repeat
 */
function sentPlace(args: Record<string, unknown>): string | undefined {
  const path = typeof args.path === "string" ? args.path.trim() : "";

  // The tool reads a blank or coerced-null path as unsent.
  if (path === "null" || path === "undefined") {
    return "";
  }

  return path.includes(",") ? undefined : path;
}

/**
 * The one place create-track's args put a new track. create-track names the
 * kind `type`, not `trackType`, and Live always appends a return track, so a
 * return is "rt+" whatever the index.
 * @param args - The args the call sent
 * @returns The path, or undefined for a path list, which count can't repeat
 */
function newTrackPlace(args: Record<string, unknown>): string | undefined {
  const sent = sentPlace(args);

  if (sent !== "") {
    return sent;
  }

  if (args.type === "return") {
    return "rt+";
  }

  const index = typeof args.trackIndex === "number" ? args.trackIndex : -1;

  return trackCategoryPath("regular", index);
}

/**
 * The one place create-scene's args put a new scene.
 * @param args - The args the call sent
 * @returns The path, or undefined for a path list, which count can't repeat
 */
function newScenePlace(args: Record<string, unknown>): string | undefined {
  const sent = sentPlace(args);

  if (sent !== "") {
    return sent;
  }

  return scenePathFromIndex(args) ?? "s+";
}
