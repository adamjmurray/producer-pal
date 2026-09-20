// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The `path` an index names, for errors and for the warnings that retire the
// index params. Kept free of imports so a tool schema can reach it.

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
