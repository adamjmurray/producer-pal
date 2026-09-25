// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The locators one call names. locatorId and locatorTime combine into one
// target list, ids first, the way id and path do elsewhere: each entry is its
// own locator and none is broadcast. locatorName is the value on create and
// rename, and a target of its own on delete.

import {
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  type LocatorMatch,
  findLocator,
  findLocatorsByName,
} from "#src/tools/shared/locator/locators.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  splitList,
  valueForIndex,
} from "#src/tools/shared/validation/lists/list-pairing.ts";

export type LocatorOperation = "create" | "delete" | "rename";

/** The params that name a locator. */
export type LocatorParam = "locatorId" | "locatorTime" | "locatorName";

/** One locator a call names, in the caller's own spelling. */
export interface LocatorTarget {
  /** The param that named it. */
  param: LocatorParam;
  /** The entry as the caller wrote it. */
  value?: string;
  /** The name to write, on create and rename. */
  name?: string;
}

/** The locator params as the caller sent them. */
export interface LocatorArgs {
  locatorId?: string;
  locatorTime?: string;
  locatorName?: string;
}

/** The song meter a bar|beat is read in. */
export interface SongMeter {
  timeSigNumerator: number;
  timeSigDenominator: number;
}

/**
 * The locators a call names, one target each: ids, then times, then (on
 * delete) names.
 *
 * Runs before anything is written: a missing locator or rename name, a hole in
 * a list, an unreadable time, or a name list that doesn't match the targets is
 * refused while the Set is untouched.
 * @param operation - "create", "delete", or "rename"
 * @param args - The locator params as the caller sent them
 * @param liveSet - The live_set, read to tell a name with a comma in it from a list
 * @param meter - The song meter the call's times are read in
 * @returns One target per locator, always at least one
 * @throws Error on an unknown operation, a missing param, or an unreadable
 *   list or time
 */
export function locatorTargets(
  operation: string,
  args: LocatorArgs,
  liveSet: LiveAPI,
  meter: SongMeter,
): LocatorTarget[] {
  switch (operation) {
    case "create":
      return withNames(
        required(timeTargets(args.locatorTime, meter), "create", args, [
          "locatorTime",
        ]),
        args,
        "locatorTime",
      );
    case "rename":
      if (args.locatorName == null) {
        throw new Error("locatorName is required for rename");
      }

      return withNames(
        required(
          [
            ...named("locatorId", args.locatorId),
            ...timeTargets(args.locatorTime, meter),
          ],
          "rename",
          args,
          ["locatorId", "locatorTime"],
        ),
        args,
        targetLabel(args),
      );
    case "delete":
      return required(
        [
          ...named("locatorId", args.locatorId),
          ...timeTargets(args.locatorTime, meter),
          ...deleteNames(args.locatorName, liveSet).map(
            (value): LocatorTarget => ({ param: "locatorName", value }),
          ),
        ],
        "delete",
        args,
        ["locatorId", "locatorTime", "locatorName"],
      );
    default:
      throw new Error(`Unknown locator operation: ${operation}`);
  }
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
      detail: errorMessage(error),
    };
  }
}

/**
 * Where an id or time target points: its time, and the locator there now.
 * @param liveSet - The live_set LiveAPI object
 * @param target - An id or time target
 * @param meter - The song meter a bar|beat is read in
 * @returns The target's time, when known, and the locator found there
 */
export function locateTarget(
  liveSet: LiveAPI,
  target: LocatorTarget,
  meter: SongMeter,
): { beats?: number; found: LocatorMatch | null } {
  const value = target.value as string;

  if (target.param === "locatorId") {
    const found = findLocator(liveSet, { locatorId: value });

    return {
      beats: found?.locator.getProperty("time") as number | undefined,
      found,
    };
  }

  const beats = toBeats(value, meter);

  return { beats, found: findLocator(liveSet, { timeInBeats: beats }) };
}

// --- Helpers below main exports ---

/**
 * One target per entry of a target list.
 * @param param - The param
 * @param raw - Its value, as the caller sent it
 * @returns The targets, empty when the param was unset
 */
function named(param: LocatorParam, raw: string | undefined): LocatorTarget[] {
  return targetEntries(raw, param).map((value) => ({ param, value }));
}

/**
 * One target per time, each read now so a typo is refused before the first
 * write rather than midway through the call.
 * @param raw - The locatorTime param, as the caller sent it
 * @param meter - The song meter the call's times are read in
 * @returns The targets, empty when the param was unset
 * @throws Error when a time isn't a readable bar|beat
 */
function timeTargets(
  raw: string | undefined,
  meter: SongMeter,
): LocatorTarget[] {
  const targets = named("locatorTime", raw);

  for (const { value } of targets) {
    toBeats(value as string, meter);
  }

  return targets;
}

/**
 * A bar|beat as beats in the song meter.
 * @param time - The bar|beat
 * @param meter - The song meter
 * @returns The time in beats
 * @throws Error when the time isn't a readable bar|beat
 */
function toBeats(time: string, meter: SongMeter): number {
  validateBarBeatPosition(time);

  return barBeatToAbletonBeats(
    time,
    meter.timeSigNumerator,
    meter.timeSigDenominator,
  );
}

/**
 * Pair locatorName with the targets: one name covers them all, or a list names
 * one per target.
 * @param targets - The targets, in call order
 * @param args - The locator params as the caller sent them
 * @param label - The params that named the targets, for the error
 * @returns The targets with their names
 * @throws Error when the name list and the targets differ in length
 */
function withNames(
  targets: LocatorTarget[],
  args: LocatorArgs,
  label: string,
): LocatorTarget[] {
  validateListLengths([
    { param: label, count: targets.length, noun: "locator" },
    { param: "locatorName", value: args.locatorName, noun: "locator" },
  ]);

  const names = splitList(args.locatorName, targets.length, "locatorName");

  return targets.map((target, index) => ({
    ...target,
    name: valueForIndex(args.locatorName, index, names),
  }));
}

/**
 * The names a delete targets. A whole value that names a locator is one name,
 * commas and all; otherwise a comma splits it.
 * @param locatorName - The param as the caller sent it
 * @param liveSet - The live_set LiveAPI object
 * @returns One name per target
 */
function deleteNames(
  locatorName: string | undefined,
  liveSet: LiveAPI,
): string[] {
  if (locatorName == null || locatorName.trim() === "") {
    return [];
  }

  if (
    !locatorName.includes(",") ||
    findLocatorsByName(liveSet, locatorName).length > 0
  ) {
    return [locatorName];
  }

  return targetEntries(locatorName, "locatorName");
}

/**
 * Refuse a call that names no locator for its operation to act on.
 * @param targets - The targets the call named
 * @param operation - The operation, for the error
 * @param args - The locator params as the caller sent them
 * @param params - The params that could have named one
 * @returns The targets, at least one
 * @throws Error when there are none
 */
function required(
  targets: LocatorTarget[],
  operation: LocatorOperation,
  args: LocatorArgs,
  params: LocatorParam[],
): LocatorTarget[] {
  if (targets.length > 0) {
    return targets;
  }

  // With no targets, any param that was sent was blank.
  const blank = params.filter((param) => args[param] != null);

  if (blank.length > 0) {
    throw new Error(`${blank.join(" and ")} must not be empty`);
  }

  const last = params.at(-1) as string;
  const rest = params.slice(0, -1).join(", ");
  const comma = params.length > 2 ? "," : "";
  const names = rest === "" ? last : `${rest}${comma} or ${last}`;

  throw new Error(`${names} is required for ${operation}`);
}

/**
 * The params that named a rename's targets, for a length-mismatch error.
 * @param args - The locator params as the caller sent them
 * @returns "locatorId", "locatorTime", or both
 */
function targetLabel(args: LocatorArgs): string {
  // A blank param is an unsent one, as when the lists are split.
  const hasIds = (args.locatorId ?? "").trim() !== "";

  if (hasIds && (args.locatorTime ?? "").trim() !== "") {
    return "locatorId and locatorTime";
  }

  return hasIds ? "locatorId" : "locatorTime";
}

/**
 * How a skip names its locator: the spelling that named it, and the name it was
 * to get, which is all the caller has to match the entry on.
 * @param target - The locator, as the caller named it
 * @returns The address
 */
function locatorAddress(target: LocatorTarget): Record<string, string> {
  const key = { locatorId: "id", locatorTime: "time", locatorName: "name" };

  return {
    [key[target.param]]: target.value as string,
    ...(target.name != null && { name: target.name }),
  };
}
