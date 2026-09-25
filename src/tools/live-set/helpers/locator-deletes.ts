// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Live deletes a locator by toggling the cue at its time, and the same toggle
// creates one where there is none. So a locator two targets name must be
// toggled once: the caller works out up front which target acts on it.

import { errorMessage } from "#src/shared/error-message.ts";
import { findLocatorsByName } from "#src/tools/shared/locator/locators.ts";
import {
  locateTarget,
  type LocatorTarget,
  type SongMeter,
} from "./locator-targets.ts";
import { stopPlaybackIfNeeded, toggleCueAt } from "./locator-updates.ts";

/**
 * Delete the locator(s) one target names: one by id or time, every match by
 * name.
 * @param liveSet - The live_set LiveAPI object
 * @param target - The locator, as the caller named it
 * @param meter - The song meter a bar|beat is read in
 * @returns Deletion result
 */
export async function deleteLocator(
  liveSet: LiveAPI,
  target: LocatorTarget,
  meter: SongMeter,
): Promise<Record<string, unknown>> {
  if (target.param === "locatorName") {
    return await deleteByName(liveSet, target, meter);
  }

  const { found } = locateTarget(liveSet, target, meter);

  if (found == null) {
    return nothingToDelete(target);
  }

  const id = found.locator.id;
  const time = found.locator.getProperty("time") as number;

  stopPlaybackIfNeeded(liveSet);
  await toggleCueAt(liveSet, time, meter);

  return { operation: "delete", id };
}

// --- Helpers below main exports ---

/**
 * Delete every locator with the target's name.
 * @param liveSet - The live_set LiveAPI object
 * @param target - A name target
 * @param meter - The song meter, to name a time in an error
 * @returns Deletion result
 * @throws Error when a delete stalls, saying how many went first
 */
async function deleteByName(
  liveSet: LiveAPI,
  target: LocatorTarget,
  meter: SongMeter,
): Promise<Record<string, unknown>> {
  const name = target.value as string;
  const matches = findLocatorsByName(liveSet, name);

  if (matches.length === 0) {
    return nothingToDelete(target);
  }

  stopPlaybackIfNeeded(liveSet);

  // Latest first, so an earlier locator's index doesn't shift under a delete.
  const latestFirst = matches.toSorted((a, b) => b.time - a.time);

  for (const [deleted, match] of latestFirst.entries()) {
    try {
      await toggleCueAt(liveSet, match.time, meter);
    } catch (error) {
      throw new Error(
        `${errorMessage(error)}; deleted ${deleted} of ${matches.length} named "${name}"`,
        { cause: error },
      );
    }
  }

  return { operation: "delete", count: matches.length, name };
}

/**
 * The entry for a target naming no locator: what it asked for already holds.
 * @param target - The locator, as the caller named it
 * @returns The entry
 */
function nothingToDelete(target: LocatorTarget): Record<string, unknown> {
  const value = target.value as string;

  switch (target.param) {
    case "locatorId":
      return {
        operation: "skipped",
        detail: `nothing to delete: no locator with id "${value}"`,
        id: value,
      };
    case "locatorTime":
      return {
        operation: "skipped",
        detail: `nothing to delete: no locator at ${value}`,
        time: value,
      };
    default:
      return {
        operation: "skipped",
        detail: `nothing to delete: no locator named "${value}"`,
        name: value,
      };
  }
}
