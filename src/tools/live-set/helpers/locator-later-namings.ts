// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Locators a call names more than once. The last target to name a locator acts
// on it: acting twice would toggle a cue off and back on, or create one where
// the first act deleted it. Worked out before anything is written, while every
// target can still be looked up.

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { findLocatorsByName } from "#src/tools/shared/locator/locators.ts";
import { namedLaterReason } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  type LocatorOperation,
  type LocatorTarget,
  type SongMeter,
  locateTarget,
} from "./locator-targets.ts";

/** The later target that acts on an earlier one's locators instead. */
export interface LaterNaming {
  /** The last target that names this one's locators again. */
  later: LocatorTarget;
  /** The one locator an id or time target found, to report it by. */
  id?: string;
}

/** What one target names. */
interface Claim {
  /** Locator ids, or, where no locator is there yet, a time or the spelling. */
  units: Array<string | number>;
  /** The one locator an id or time target found. */
  id?: string;
}

/**
 * For each target, the last later target naming its locators, or undefined when
 * none does. A later target always names all of them: ids and times name one
 * locator each, and a name target, the last kind in the call, overlaps another
 * only by naming the same name.
 * @param liveSet - The live_set LiveAPI object
 * @param targets - The call's targets, in order
 * @param meter - The song meter a bar|beat is read in
 * @returns One slot per target
 */
export function laterNamings(
  liveSet: LiveAPI,
  targets: LocatorTarget[],
  meter: SongMeter,
): Array<LaterNaming | undefined> {
  const claims = targets.map((target) => claimOf(liveSet, target, meter));

  return claims.map((claim, index) => {
    const offset = claims
      .slice(index + 1)
      .findLastIndex((other) =>
        claim.units.some((unit) => covers(other.units, unit)),
      );

    if (offset === -1) {
      return undefined;
    }

    return {
      later: targets[index + 1 + offset] as LocatorTarget,
      ...(claim.id != null && { id: claim.id }),
    };
  });
}

/**
 * The entry for a target whose locator a later target acts on instead.
 * @param operation - The call's operation
 * @param target - The earlier target
 * @param naming - What later targets name of it
 * @returns The entry, pointing at the one that does the work
 */
export function namedLaterEntry(
  operation: LocatorOperation,
  target: LocatorTarget,
  naming: LaterNaming,
): Record<string, unknown> {
  const key = { locatorId: "id", locatorTime: "time", locatorName: "name" };

  return {
    operation,
    ...(naming.id == null
      ? { [key[target.param as keyof typeof key]]: target.value }
      : { id: naming.id }),
    // The shared wording quotes any spelling that isn't an id.
    detail: namedLaterReason({
      param: naming.later.param === "locatorId" ? "id" : "path",
      value: naming.later.value as string,
    }),
  };
}

// --- Helpers below main exports ---

/**
 * What a target names.
 * @param liveSet - The live_set LiveAPI object
 * @param target - One target
 * @param meter - The song meter a bar|beat is read in
 * @returns The claim
 */
function claimOf(
  liveSet: LiveAPI,
  target: LocatorTarget,
  meter: SongMeter,
): Claim {
  const value = target.value as string;

  switch (target.param) {
    case "locatorName": {
      const matches = findLocatorsByName(liveSet, value);

      return {
        units:
          matches.length > 0
            ? matches.map((match) => match.locator.id)
            : [`name:${value}`],
      };
    }

    default: {
      const { beats, found } = locateTarget(liveSet, target, meter);

      if (found != null) {
        return { units: [found.locator.id], id: found.locator.id };
      }

      return {
        units: [
          target.param === "locatorId" ? `id:${value}` : (beats as number),
        ],
      };
    }
  }
}

/**
 * @param units - What a later target names
 * @param unit - One thing an earlier target names
 * @returns Whether the later target names it too
 */
function covers(units: Array<string | number>, unit: string | number): boolean {
  return units.some((other) =>
    typeof unit === "number" && typeof other === "number"
      ? Math.abs(unit - other) < SAME_TIME_EPSILON
      : unit === other,
  );
}
