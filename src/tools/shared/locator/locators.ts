// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { assertDefined } from "#src/shared/error-message.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";

export interface LocatorInfo {
  id: string;
  name: string;
  time: string;
  position: string;
}

export interface LocatorMatch {
  locator: LiveAPI;
  index: number;
}

export interface LocatorMatchWithTime extends LocatorMatch {
  time: number;
}

interface FindLocatorOptions {
  locatorId?: string;
  timeInBeats?: number;
}

interface ResolveLocatorOptions {
  locatorId?: string;
  locatorName?: string;
}

/**
 * Read all locators from the Live Set
 * @param liveSet - The live_set LiveAPI object
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Array of locator objects
 */
export function readLocators(
  liveSet: LiveAPI,
  timeSigNumerator: number,
  timeSigDenominator: number,
): LocatorInfo[] {
  const locatorIds = liveSet.getChildIds("cue_points");
  const entries: { id: string; name: string; timeInBeats: number }[] = [];

  for (let i = 0; i < locatorIds.length; i++) {
    const locator = getLocatorAt(locatorIds, i);

    entries.push({
      id: locator.id,
      name: locator.getName(),
      timeInBeats: locator.getProperty("time") as number,
    });
  }

  // Every name up front: a repeat can't be spotted until they are all read.
  const names = entries.map((entry) => entry.name);

  return entries.map(({ id, name, timeInBeats }) => ({
    id,
    name,
    time: abletonBeatsToBarBeat(
      timeInBeats,
      timeSigNumerator,
      timeSigDenominator,
    ),
    position: locatorPosition(name, id, names),
  }));
}

/**
 * Find a locator by ID or time position
 * @param liveSet - The live_set LiveAPI object
 * @param options - Search options
 * @param options.locatorId - Locator ID to find (e.g., "27")
 * @param options.timeInBeats - Exact time position in beats
 * @returns Locator object and index, or null if not found
 */
export function findLocator(
  liveSet: LiveAPI,
  { locatorId, timeInBeats }: FindLocatorOptions,
): LocatorMatch | null {
  const locatorIds = liveSet.getChildIds("cue_points");

  for (let i = 0; i < locatorIds.length; i++) {
    const locator = getLocatorAt(locatorIds, i);

    if (locatorId != null && locator.id === locatorId) {
      return { locator, index: i };
    }

    if (timeInBeats != null) {
      const locatorTime = locator.getProperty("time") as number;

      if (Math.abs(locatorTime - timeInBeats) < SAME_TIME_EPSILON) {
        return { locator, index: i };
      }
    }
  }

  return null;
}

/**
 * Find all locators matching a name
 * @param liveSet - The live_set LiveAPI object
 * @param locatorName - Name to match
 * @returns Array of matching locators with their times
 */
export function findLocatorsByName(
  liveSet: LiveAPI,
  locatorName: string,
): LocatorMatchWithTime[] {
  // Every nameless locator reads back "", so without this guard an empty
  // locatorName would match (and could delete) every one of them.
  if (locatorName === "") {
    return [];
  }

  const locatorIds = liveSet.getChildIds("cue_points");
  const matches: LocatorMatchWithTime[] = [];

  for (let i = 0; i < locatorIds.length; i++) {
    const locator = getLocatorAt(locatorIds, i);
    const name = locator.getName();

    if (name === locatorName) {
      const time = locator.getProperty("time") as number;

      matches.push({ locator, index: i, time });
    }
  }

  return matches;
}

/**
 * Resolve a locator by ID or name to its time in beats
 * @param liveSet - The live_set LiveAPI object
 * @param options - Locator identifier options
 * @param options.locatorId - Locator ID to find
 * @param options.locatorName - Locator name to find
 * @param context - Optional context for error messages (e.g., "for start")
 * @returns Time in beats
 * @throws If locator is not found
 */
export function resolveLocatorToBeats(
  liveSet: LiveAPI,
  { locatorId, locatorName }: ResolveLocatorOptions,
  context?: string,
): number {
  const contextSuffix = context ? ` ${context}` : "";

  if (locatorId != null) {
    const found = findLocator(liveSet, { locatorId });

    if (!found) {
      throw new Error(`locator not found: ${locatorId}`);
    }

    return found.locator.getProperty("time") as number;
  }

  if (locatorName != null) {
    const matches = findLocatorsByName(liveSet, locatorName);

    if (matches.length === 0) {
      throw new Error(
        `no locator found with name "${locatorName}"${contextSuffix}`,
      );
    }

    // Use the first matching locator
    return assertDefined(matches[0], "first matching locator").time;
  }

  throw new Error("locatorId or locatorName is required");
}

/**
 * Resolve one or more locators by ID(s) or name(s) to their times in beats.
 * Supports comma-separated values for both locatorId and locatorName.
 * @param liveSet - The live_set LiveAPI object
 * @param options - Locator identifier options
 * @param options.locatorId - Comma-separated locator ID(s) to find
 * @param options.locatorName - Comma-separated locator name(s) to find
 * @returns Array of times in beats
 * @throws If any locator is not found
 */
export function resolveLocatorListToBeats(
  liveSet: LiveAPI,
  { locatorId, locatorName }: ResolveLocatorOptions,
): number[] {
  if (locatorId != null) {
    const ids = targetEntries(locatorId, "locatorId");

    return ids.map((id) => {
      const found = findLocator(liveSet, { locatorId: id });

      if (!found) {
        throw new Error(`locator not found: ${id}`);
      }

      return found.locator.getProperty("time") as number;
    });
  }

  if (locatorName != null) {
    const names = targetEntries(locatorName, "locatorName");

    return names.map((name) => {
      const matches = findLocatorsByName(liveSet, name);

      if (matches.length === 0) {
        throw new Error(`no locator found with name "${name}"`);
      }

      return assertDefined(matches[0], "first matching locator").time;
    });
  }

  throw new Error("locatorId or locatorName is required");
}

const LOCATOR_ID_PATTERN = /^\d+$/;

/**
 * Check if a locator reference is a Live object id rather than a name
 * @param value - Locator reference to check
 * @returns True if value is all digits
 */
export function isLocatorId(value: string): boolean {
  return LOCATOR_ID_PATTERN.test(value);
}

/**
 * Resolve a single locator reference (ID or name) to its time in beats.
 * An all-digit ref can be an id or a name, so it tries both, and refuses
 * when they name different locators rather than guess.
 * @param liveSet - The live_set LiveAPI object
 * @param locatorRef - Locator ID or name
 * @param context - Optional context for error messages
 * @returns Time in beats
 */
export function resolveLocatorRefToBeats(
  liveSet: LiveAPI,
  locatorRef: string,
  context?: string,
): number {
  if (!isLocatorId(locatorRef)) {
    return resolveLocatorToBeats(liveSet, { locatorName: locatorRef }, context);
  }

  const byId = findLocator(liveSet, { locatorId: locatorRef });
  const byName = findLocatorsByName(liveSet, locatorRef);
  const others = byName.filter(({ locator }) => locator.id !== locatorRef);

  if (byId != null && others.length > 0) {
    const otherIds = others.map(({ locator }) => locator.id).join(", ");
    const contextSuffix = context ? ` ${context}` : "";

    throw new Error(
      `locator "${locatorRef}" is ambiguous${contextSuffix}: it is the id of ` +
        `locator ${locatorRef} and the name of locator ${otherIds}`,
    );
  }

  if (byId != null) {
    return byId.locator.getProperty("time") as number;
  }

  const [first] = byName;

  if (first == null) {
    throw new Error(`locator not found: ${locatorRef}`);
  }

  return first.time;
}

/**
 * The `loc:` token to send back for a locator — what every song position takes,
 * including inside a path coordinate. Without it a model copies the bar out of
 * `time` and the section name never reaches a call.
 *
 * Falls back to the id whenever the name wouldn't resolve to this exact
 * locator: a blank or repeated name matches the wrong one, a bracket or comma
 * is read by the path grammar before the name is, and an all-digit name can
 * clash with another locator's id.
 * @param name - This locator's name
 * @param id - This locator's Live id
 * @param names - Every locator's name, to spot a repeat
 * @returns The token, e.g. "loc:Bridge" or "loc:27"
 */
function locatorPosition(name: string, id: string, names: string[]): string {
  const usable =
    name !== "" &&
    name === name.trim() &&
    !/[[\],]/.test(name) &&
    !isLocatorId(name) &&
    names.indexOf(name) === names.lastIndexOf(name);

  return `loc:${usable ? name : id}`;
}

/**
 * Get a LiveAPI object for a locator at a given index
 * @param locatorIds - Array of locator IDs from getChildIds("cue_points")
 * @param index - Index into the locator IDs array
 * @returns LiveAPI object for the locator
 */
function getLocatorAt(locatorIds: (string | number)[], index: number): LiveAPI {
  return LiveAPI.from(
    assertDefined(locatorIds[index], `locator id at index ${index}`),
  );
}
