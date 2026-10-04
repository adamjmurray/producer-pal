// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A later write over the same ground: a slot two targets fill, or a stretch of
// lane one covers and the other overlaps.

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { type Cover } from "../write-pipeline-types.ts";

/** A later target that goes over an earlier one, and how an entry names it. */
export interface Coverer {
  index: number;
  as: string;
}

/** What later targets do to the earlier ones. */
export interface CoverClashes {
  /**
   * Targets whose whole write later targets go over: they need not run. Each
   * lists every target that was needed to cover it, latest first.
   */
  replaced: Map<number, Coverer[]>;
  /**
   * Targets later ones go over only part of: they run, cut short. Each lists
   * every target that touches it, latest first.
   */
  shortened: Map<number, Coverer[]>;
}

/** A cover, and the target that declared it. */
interface Claim {
  index: number;
  cover: Cover;
}

/**
 * Find what each target's write is covered by. Targets are weighed from the
 * last, and only ones that will be written count as covering: a target that
 * is itself replaced goes over nothing.
 * @param claims - What each target goes over, in the order named
 * @param unwritten - The targets nothing will write
 * @returns The targets later ones replace or cut short, and which ones
 */
export function coverClashes(
  claims: Array<Cover[] | undefined>,
  unwritten: ReadonlySet<number>,
): CoverClashes {
  const replaced = new Map<number, Coverer[]>();
  const shortened = new Map<number, Coverer[]>();
  // Latest target first, so the first match is the last to go over the ground.
  const later: Claim[] = [];

  for (const [index, covers = []] of [...claims.entries()].toReversed()) {
    if (unwritten.has(index) || covers.length === 0) {
      continue;
    }

    const whole = covers.map((cover) => coveredBy(later, cover));

    if (whole.every((found) => found != null)) {
      replaced.set(index, distinct(whole.flat()));
      continue;
    }

    const touching = covers.flatMap((cover) =>
      later.filter((other) => touches(other.cover, cover)),
    );

    if (touching.length > 0) {
      shortened.set(index, distinct(touching));
    }

    later.push(...covers.map((cover) => ({ index, cover })));
  }

  return { replaced, shortened };
}

// --- Helpers below main export ---

/**
 * The targets behind some claims, once each, latest first, with their words for
 * the ground.
 * @param claims - Claims by later targets
 * @returns One entry per target
 */
function distinct(claims: Claim[]): Coverer[] {
  const found = new Map<number, Coverer>();

  for (const { index, cover } of claims.toSorted((a, b) => b.index - a.index)) {
    if (!found.has(index)) {
      found.set(index, { index, as: "slot" in cover ? cover.slot : cover.as });
    }
  }

  return [...found.values()];
}

/**
 * The later claims that, between them, go over all of a cover. A stretch counts
 * as covered once what each later cover reaches has been taken away and nothing
 * is left, so two targets that go over a clip's halves replace it together. A
 * claim that adds nothing to what the others took away isn't needed.
 * @param later - What the later targets go over, latest first
 * @param cover - The earlier cover
 * @returns The claims it took, or undefined when some of the cover is left
 */
function coveredBy(later: Claim[], cover: Cover): Claim[] | undefined {
  if ("slot" in cover) {
    const same = later.find(
      (other) => "slot" in other.cover && other.cover.slot === cover.slot,
    );

    return same == null ? undefined : [same];
  }

  const needed: Claim[] = [];
  let left: Array<[number, number]> = [[cover.from, cover.to]];

  for (const claim of later.filter((other) => touches(other.cover, cover))) {
    const { from, to } = claim.cover as Extract<Cover, { lane: string }>;
    const after = left
      .flatMap(([start, end]): Array<[number, number]> => [
        [start, Math.min(end, from)],
        [Math.max(start, to), end],
      ])
      .filter(([start, end]) => end - start > SAME_TIME_EPSILON);

    if (span(after) < span(left) - SAME_TIME_EPSILON) {
      needed.push(claim);
    }

    left = after;
  }

  return left.length > 0 ? undefined : needed;
}

/**
 * How much ground some stretches add up to.
 * @param stretches - Stretches of a lane, in beats
 * @returns Their total length
 */
function span(stretches: Array<[number, number]>): number {
  return stretches.reduce((sum, [start, end]) => sum + (end - start), 0);
}

/**
 * Whether two covers share any ground.
 * @param outer - The later cover
 * @param inner - The earlier one
 * @returns True when they overlap by more than an edge
 */
function touches(outer: Cover, inner: Cover): boolean {
  if ("slot" in outer || "slot" in inner) {
    return "slot" in outer && "slot" in inner && outer.slot === inner.slot;
  }

  return (
    outer.lane === inner.lane &&
    outer.from < inner.to - SAME_TIME_EPSILON &&
    outer.to > inner.from + SAME_TIME_EPSILON
  );
}
