// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Counts the LiveAPI objects one tool call resolves, and warns the totals into
 * that call's response.
 *
 * Only in a build made with ENABLE_BUILD_STATS=true. Every other build gets
 * live-api-build-stats-disabled.ts in its place, so none of this reaches a
 * release. IMPORTANT: renaming or moving this file means updating its entry in
 * config/rolldown-plugin-stub-modules.mjs (BUILD_STATS_STUBS).
 *
 * It ships at all because a test that counts against the mock is measuring the
 * mock. A fixture missing a property the tools read makes a walk stop early and
 * the count comes out low — green, and wrong in the flattering direction. Only
 * running the same call against real Live catches that, and only if both sides
 * count with the same instrument, so tests read liveApiBuildStats() directly
 * rather than hooking the mock.
 *
 * Two numbers, and the difference matters:
 *
 *   - RESOLVED is how many times the call asked for an object. It depends on
 *     the tool and the Live Set and nothing else, so this is the one to compare
 *     against a test. The redundant work is resolved minus distinct.
 *   - CONSTRUCTED is how many of those had to build one, which is the expensive
 *     part (live-api-release.ts). It depends on how full the pool was, so it
 *     moves run to run and compares to nothing.
 *
 * Neither sees the other kind of waste: distinct objects built once, correctly,
 * and then thrown away. A drum-map read of a rack holding no drum rack built
 * 174 objects, returned no drum map, and scored zero repeats. Read a repeat
 * count as a floor, and check what the call returned against what it built.
 *
 * Targets are reported by shape, indices replaced with `*`, because a big Live
 * Set has a target per clip and the raw list is unreadable. Shapes also compare
 * directly between a real Set and a fixture.
 */

import * as console from "#src/shared/max/v8-max-console.ts";

/** Shapes listed in the report before the rest collapse into a count. */
const MAX_REPORTED_SHAPES = 20;

let resolvedCount = 0;
let constructedCount = 0;
const targetCounts = new Map<string, number>();

/** What one tool call asked the Live API for. */
export interface LiveApiBuildStats {
  /** How many times the call asked for an object */
  resolved: number;
  /** How many distinct targets those asks named */
  distinct: number;
  /** How many asks had to build an object instead of reusing one */
  constructed: number;
  /** Resolutions per target shape, most-resolved first */
  byShape: [string, number][];
}

/** Start counting again, for one tool call. */
export function beginLiveApiBuildStats(): void {
  resolvedCount = 0;
  constructedCount = 0;
  targetCounts.clear();
}

/**
 * Record that a target was resolved.
 * @param target - Path or "id N" string, already normalized
 */
export function recordLiveApiResolve(target: string): void {
  resolvedCount++;
  targetCounts.set(target, (targetCounts.get(target) ?? 0) + 1);
}

/** Record that a resolution had to build an object rather than reuse one. */
export function recordLiveApiConstruct(): void {
  constructedCount++;
}

/**
 * Read the counts for the call so far.
 * @returns The totals and the per-shape breakdown
 */
export function liveApiBuildStats(): LiveApiBuildStats {
  return {
    resolved: resolvedCount,
    distinct: targetCounts.size,
    constructed: constructedCount,
    byShape: shapeCounts(),
  };
}

/**
 * Warn the counts into the tool response.
 *
 * Has to run before the response is assembled: the patch appends whatever is on
 * outlet 1 at that moment, so reporting any later files the numbers under some
 * other call.
 */
export function reportLiveApiBuildStats(): void {
  if (resolvedCount === 0) return;

  const shapes = shapeCounts();
  const shown = shapes
    .slice(0, MAX_REPORTED_SHAPES)
    .map(([shape, count]) => `${shape}: ${String(count)}`);

  if (shapes.length > shown.length) {
    shown.push(`+${String(shapes.length - shown.length)} more shapes`);
  }

  // One line on purpose: the warning crosses to Node as a single Max symbol.
  console.warn(
    `LiveAPI stats: ${String(resolvedCount)} resolved, ` +
      `${String(targetCounts.size)} distinct, ` +
      `${String(constructedCount)} constructed | ${shown.join("; ")}`,
  );
}

/**
 * Collapse the targets to shapes and order them by count.
 * @returns Shape and count pairs, most-resolved first, then alphabetical
 */
function shapeCounts(): [string, number][] {
  const shapes = new Map<string, number>();

  for (const [target, count] of targetCounts) {
    const shape = targetShape(target);

    shapes.set(shape, (shapes.get(shape) ?? 0) + count);
  }

  return [...shapes].toSorted(
    ([aShape, aCount], [bShape, bCount]) =>
      bCount - aCount || aShape.localeCompare(bShape),
  );
}

/**
 * Replace every index in a target with `*`, so one line stands for every clip.
 * @param target - Path or "id N" string
 * @returns The target with its numbers replaced
 */
function targetShape(target: string): string {
  return target.replaceAll(/\d+/g, "*");
}
