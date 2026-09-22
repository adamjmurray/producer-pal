// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { DUPLICATE_TYPES } from "#src/tools/constants.ts";
import { countListEntries } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  booleanForIndex,
  numberForIndex,
} from "#src/tools/shared/validation/lists/typed-lists.ts";

/**
 * Validates basic input parameters for duplication
 * @param type - Type of object to duplicate
 * @param id - ID(s) of the object(s) to duplicate
 * @param count - Copies per source, one value or one per source
 * @param path - Path(s) of the object(s) to duplicate
 */
export function validateBasicInputs(
  type: string,
  id: string | undefined,
  count: string,
  path?: string,
): void {
  if (!type) {
    throw new Error("type is required");
  }

  if (!(DUPLICATE_TYPES as readonly string[]).includes(type)) {
    throw new Error(`type must be one of ${DUPLICATE_TYPES.join(", ")}`);
  }

  // `id` and `path` name different objects and add up, so either will do and
  // both together are a longer source list, not a conflict.
  if (id == null && path == null) {
    throw new Error("id or path is required");
  }

  // Every entry, before the sources are read: a bad third entry can't leave
  // the first two sources already copied.
  for (const entry of listEntries(count)) {
    const copies = numberForIndex(entry, 0, null);

    if (copies == null || !Number.isInteger(copies)) {
      throw new Error(`count "${entry.trim()}" must be a whole number`);
    }

    if (copies < 1) {
      throw new Error("count must be at least 1");
    }
  }
}

/**
 * Refuses a routeToSource the type can't honor, and says once that it settles
 * withoutClips/withoutDevices itself. The values it settles are worked out per
 * source, in source-copy-params.ts.
 * @param type - Type of object being duplicated
 * @param routeToSource - Whether to route to the source track, per source
 * @param withoutClips - Whether to exclude clips, per source
 * @param withoutDevices - Whether to exclude devices, per source
 * @throws Error when a type other than track asked to route to its source
 */
export function validateAndConfigureRouteToSource(
  type: string,
  routeToSource: string | undefined,
  withoutClips: string | undefined,
  withoutDevices: string | undefined,
): void {
  if (!entryFlags(routeToSource).includes(true)) {
    return;
  }

  if (type !== "track") {
    throw new Error("routeToSource is only supported for type 'track'");
  }

  // About the call, not about any one copy, so it is said once however many
  // sources named it.
  const ignored = [
    ...(entryFlags(withoutClips).includes(false) ? ["withoutClips"] : []),
    ...(entryFlags(withoutDevices).includes(false) ? ["withoutDevices"] : []),
  ];

  if (ignored.length > 0) {
    console.warn(
      `${ignored.join("/")} ignored: routeToSource always copies without ` +
        "clips and devices",
    );
  }
}

/**
 * Validates destination parameter compatibility with object type
 * @param type - Type of object being duplicated
 * @param destination - Inferred destination
 * @param laneCopy - Whether the call copies clips lane to lane
 */
export function validateDestinationParameter(
  type: string,
  destination: string | undefined,
  laneCopy = false,
): void {
  if (type !== "track" || destination !== "arrangement") {
    return;
  }

  // A lane copy does land on the arrangement — it just has no position to take,
  // since every clip keeps the one it has.
  throw new Error(
    laneCopy
      ? "arrangementStart doesn't apply to a lane copy: every clip keeps its own position; drop it"
      : "tracks cannot be duplicated to arrangement",
  );
}

// --- Helpers below main exports ---

/**
 * The entries of a comma-separated param, reading one trailing comma as a typo
 * the way the splitters do.
 * @param value - The raw param, as the caller sent it
 * @returns The entries, untrimmed
 */
function listEntries(value: string | undefined): string[] {
  return value == null
    ? []
    : value.split(",").slice(0, countListEntries(value));
}

/**
 * @param value - A raw boolean param, as the caller sent it
 * @returns What each of its entries says
 */
function entryFlags(value: string | undefined): (boolean | undefined)[] {
  return listEntries(value).map((entry) => booleanForIndex(entry, 0, null));
}
