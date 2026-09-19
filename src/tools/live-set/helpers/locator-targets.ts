// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The locators one call names. The three locator params are comma-separated
// lists that pair 1:1, so marking up a song structure is one call instead of
// one per section.

import { errorMessage } from "#src/shared/error-message.ts";
import {
  countListEntries,
  validateListLengths,
} from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  splitList,
  valueForIndex,
} from "#src/tools/shared/validation/lists/list-pairing.ts";

/** One locator a call names, in the caller's own spelling. */
export interface LocatorTarget {
  locatorId?: string;
  locatorTime?: string;
  locatorName?: string;
}

/** The locator params as the caller sent them. */
export interface LocatorArgs {
  locatorId?: string;
  locatorTime?: string;
  locatorName?: string;
}

/**
 * The locators a call names, one target per locator.
 *
 * Runs before anything is written: a length mismatch or a hole in a list is
 * refused here, while the Set is still untouched. A param with no comma in it
 * covers every locator, so a single-locator call splits nothing and a name with
 * a comma in it stays one name.
 * @param operation - "create", "delete", or "rename"
 * @param args - The locator params as the caller sent them
 * @returns One target per locator, always at least one
 * @throws Error when the lists name different numbers of locators
 */
export function locatorTargets(
  operation: string,
  args: LocatorArgs,
): LocatorTarget[] {
  validateListLengths([
    { param: "locatorId", value: args.locatorId, noun: "locator" },
    { param: "locatorTime", value: args.locatorTime, noun: "locator" },
    { param: "locatorName", value: args.locatorName, noun: "locator" },
  ]);

  const count = targetCount(operation, args);
  const ids = splitList(args.locatorId, count, "locatorId");
  const times = splitList(args.locatorTime, count, "locatorTime");
  const names = splitList(args.locatorName, count, "locatorName");

  return Array.from({ length: count }, (_unused, index) => ({
    locatorId: valueForIndex(args.locatorId, index, ids),
    locatorTime: valueForIndex(args.locatorTime, index, times),
    locatorName: valueForIndex(args.locatorName, index, names),
  }));
}

/**
 * Runs one locator of a list, turning a throw into that locator's skip entry so
 * the rest of the list still runs. A lone locator throws instead: nothing ran,
 * and there is no list for an entry to hold a place in.
 * @param target - The locator, as the caller named it
 * @param run - The operation on that locator
 * @returns The operation's result, or the skip entry standing in for it
 */
export async function attemptLocator(
  target: LocatorTarget,
  run: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  try {
    return await run();
  } catch (error) {
    return {
      operation: "skipped",
      ...locatorAddress(target),
      ok: false,
      reason: errorMessage(error),
    };
  }
}

// --- Helpers below main exports ---

/**
 * How many locators a call names: the params that address one. A name is the
 * value on create and rename, and only addresses a locator on delete.
 * @param operation - "create", "delete", or "rename"
 * @param args - The locator params as the caller sent them
 * @returns The locator count, at least one
 */
function targetCount(operation: string, args: LocatorArgs): number {
  const ids = countListEntries(args.locatorId);
  const times = countListEntries(args.locatorTime);

  if (operation === "create") {
    return Math.max(times, 1);
  }

  if (operation === "rename") {
    return Math.max(ids, times, 1);
  }

  return Math.max(ids, times, countListEntries(args.locatorName), 1);
}

/**
 * How a skip names its locator: every spelling the caller wrote for it, which
 * is all they have to match the entry on.
 * @param target - The locator, as the caller named it
 * @returns The address
 */
function locatorAddress(target: LocatorTarget): Record<string, string> {
  return {
    ...(target.locatorId != null && { id: target.locatorId }),
    ...(target.locatorTime != null && { time: target.locatorTime }),
    ...(target.locatorName != null && { name: target.locatorName }),
  };
}
