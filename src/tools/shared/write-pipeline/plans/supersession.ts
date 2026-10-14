// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Which targets a later one makes pointless, before anything is written: an
// object named again, and ground a later write goes over.

import { type Target } from "../write-pipeline-types.ts";
import { coverClashes, type Coverer } from "./covers.ts";
import { lastWinsTargets } from "./last-wins.ts";

/** Why a target is left unwritten. */
export type Replacement =
  | { kind: "named"; by: number }
  | {
      kind: "covered";
      /** Every target it took to cover it, latest first */
      coverers: Coverer[];
    };

/** What later targets make of earlier ones. */
export interface Supersession {
  /** Targets nothing will write, and what replaces each */
  replaced: Map<number, Replacement>;
  /** Targets that are written, then cut short by later ones that touch them */
  shortened: Map<number, Coverer[]>;
  /** Every target nothing will write: replaced, or skipped on its own */
  unwritten: Set<number>;
}

/**
 * Weigh the targets against each other.
 * @param targets - The call's targets, in the order named
 * @returns What each later target does to the earlier ones
 */
export function supersession<P>(targets: Array<Target<P>>): Supersession {
  const replaced = new Map<number, Replacement>();
  const unwritten = new Set<number>();

  for (const [index, target] of targets.entries()) {
    if (target.skip != null) {
      unwritten.add(index);
    }
  }

  for (const [index, by] of lastWinsTargets(targets)) {
    replaced.set(index, { kind: "named", by });
    unwritten.add(index);
  }

  const clashes = coverClashes(
    targets.map(({ covers }) => covers),
    unwritten,
  );

  for (const [index, coverers] of clashes.replaced) {
    replaced.set(index, { kind: "covered", coverers });
    unwritten.add(index);
  }

  return { replaced, shortened: clashes.shortened, unwritten };
}
