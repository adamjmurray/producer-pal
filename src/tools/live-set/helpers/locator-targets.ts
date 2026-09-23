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
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
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
import { namedEarlierReason } from "#src/tools/shared/validation/lists/named-targets.ts";

export type LocatorOperation = "create" | "delete" | "rename";

/** The params that name a locator. */
export type LocatorParam = "locatorId" | "locatorTime" | "locatorName";

/** One locator a call names, in the caller's own spelling. */
export interface LocatorTarget {
  /** The param that named it; unset when the call named no locator. */
  param?: LocatorParam;
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

/** A locator this call already acted on, and the target that named it. */
export interface ActedLocator {
  id: string;
  beats: number;
  name: string;
  target: LocatorTarget;
}

/**
 * The locators a call names, one target each: ids, then times, then (on
 * delete) names. With no locator named, one empty target, so the operation
 * reports what it needs.
 *
 * Runs before anything is written: a hole in a list, an unreadable time, or a
 * name list that doesn't match the targets is refused while the Set is
 * untouched.
 * @param operation - "create", "delete", or "rename"
 * @param args - The locator params as the caller sent them
 * @param liveSet - The live_set, read to tell a name with a comma in it from a list
 * @param meter - The song meter the call's times are read in
 * @returns One target per locator, always at least one
 * @throws Error on an unknown operation or an unreadable list or time
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
        timeTargets(args.locatorTime, meter),
        args,
        "locatorTime",
      );
    case "rename":
      return withNames(
        [
          ...named("locatorId", args.locatorId),
          ...timeTargets(args.locatorTime, meter),
        ],
        args,
        targetLabel(args),
      );
    case "delete":
      return orEmpty([
        ...named("locatorId", args.locatorId),
        ...timeTargets(args.locatorTime, meter),
        ...deleteNames(args.locatorName, liveSet).map(
          (value): LocatorTarget => ({ param: "locatorName", value }),
        ),
      ]);
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
      reason: errorMessage(error),
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

/**
 * The earlier act on the locator an id or time target names, if any. Checked
 * before acting on what the lookup found: a deleted locator is gone, so the
 * lookup can't see it, and toggling its time again would create a new one.
 * @param acted - The locators this call already acted on
 * @param target - An id or time target
 * @param beats - The target's time, when it named one
 * @returns The earlier act, or undefined
 */
export function earlierAct(
  acted: ActedLocator[],
  target: LocatorTarget,
  beats: number | undefined,
): ActedLocator | undefined {
  return acted.find((act) =>
    target.param === "locatorId"
      ? act.id === target.value
      : beats != null && Math.abs(act.beats - beats) < SAME_TIME_EPSILON,
  );
}

/**
 * The entry for a target naming a locator an earlier target already acted on.
 * @param operation - The call's operation
 * @param earlier - The earlier act
 * @returns The repeat entry, pointing at the entry that did the work
 */
export function repeatEntry(
  operation: LocatorOperation,
  earlier: ActedLocator,
): Record<string, unknown> {
  // The shared wording quotes any spelling that isn't an id.
  const reason = namedEarlierReason({
    param: earlier.target.param === "locatorId" ? "id" : "path",
    value: earlier.target.value as string,
  });

  return { operation, id: earlier.id, reason };
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
 * @returns The targets with their names, at least one
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

  return orEmpty(targets).map((target, index) => ({
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
 * The targets, or one empty target when the call named none.
 * @param targets - The targets
 * @returns At least one target
 */
function orEmpty(targets: LocatorTarget[]): LocatorTarget[] {
  return targets.length > 0 ? targets : [{}];
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
    ...(target.param != null && { [key[target.param]]: target.value }),
    ...(target.name != null && { name: target.name }),
  };
}
