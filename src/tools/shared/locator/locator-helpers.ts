// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { assertDefined } from "#src/tools/shared/utils.ts";

export interface LocatorInfo {
  id: string;
  name: string;
  time: string;
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
 * Generate a stable locator ID from a locator's index
 * @param locatorIndex - The index of the locator in the cue_points array
 * @returns Locator ID in format "locator-{index}"
 */
export function getLocatorId(locatorIndex: number): string {
  return `locator-${locatorIndex}`;
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
  const locators: LocatorInfo[] = [];

  for (let i = 0; i < locatorIds.length; i++) {
    const locator = getLocatorAt(locatorIds, i);
    const name = locator.getProperty("name") as string;
    const timeInBeats = locator.getProperty("time") as number;
    const timeFormatted = abletonBeatsToBarBeat(
      timeInBeats,
      timeSigNumerator,
      timeSigDenominator,
    );

    locators.push({
      id: getLocatorId(i),
      name,
      time: timeFormatted,
    });
  }

  return locators;
}

/**
 * Find a locator by ID or time position
 * @param liveSet - The live_set LiveAPI object
 * @param options - Search options
 * @param options.locatorId - Locator ID to find (e.g., "locator-0")
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

    if (locatorId != null && getLocatorId(i) === locatorId) {
      return { locator, index: i };
    }

    if (timeInBeats != null) {
      const locatorTime = locator.getProperty("time") as number;

      if (Math.abs(locatorTime - timeInBeats) < 0.001) {
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
  const locatorIds = liveSet.getChildIds("cue_points");
  const matches: LocatorMatchWithTime[] = [];

  for (let i = 0; i < locatorIds.length; i++) {
    const locator = getLocatorAt(locatorIds, i);
    const name = locator.getProperty("name");

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
 * @param toolName - Name of the tool for error messages
 * @param context - Optional context for error messages (e.g., "for start")
 * @returns Time in beats
 * @throws If locator is not found
 */
export function resolveLocatorToBeats(
  liveSet: LiveAPI,
  { locatorId, locatorName }: ResolveLocatorOptions,
  toolName: string,
  context?: string,
): number {
  const contextSuffix = context ? ` ${context}` : "";

  if (locatorId != null) {
    const found = findLocator(liveSet, { locatorId });

    if (!found) {
      throw new Error(`${toolName} failed: locator not found: ${locatorId}`);
    }

    return found.locator.getProperty("time") as number;
  }

  if (locatorName != null) {
    const matches = findLocatorsByName(liveSet, locatorName);

    if (matches.length === 0) {
      throw new Error(
        `${toolName} failed: no locator found with name "${locatorName}"${contextSuffix}`,
      );
    }

    // Use the first matching locator
    return assertDefined(matches[0], "first matching locator").time;
  }

  throw new Error(`${toolName} failed: locatorId or locatorName is required`);
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
