// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { DUPLICATE_TYPES } from "#src/tools/constants.ts";

/**
 * Validates basic input parameters for duplication
 * @param type - Type of object to duplicate
 * @param id - ID(s) of the object(s) to duplicate
 * @param count - Number of duplicates to create
 * @param path - Path(s) of the object(s) to duplicate
 */
export function validateBasicInputs(
  type: string,
  id: string | undefined,
  count: number,
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

  if (count < 1) {
    throw new Error("count must be at least 1");
  }
}

/**
 * Validates and configures route to source parameters
 * @param type - Type of object being duplicated
 * @param routeToSource - Whether to route to source track
 * @param withoutClips - Whether to exclude clips
 * @param withoutDevices - Whether to exclude devices
 * @returns Configured withoutClips and withoutDevices values
 */
export function validateAndConfigureRouteToSource(
  type: string,
  routeToSource: boolean | undefined,
  withoutClips: boolean | undefined,
  withoutDevices: boolean | undefined,
): { withoutClips: boolean | undefined; withoutDevices: boolean | undefined } {
  if (!routeToSource) {
    return { withoutClips, withoutDevices };
  }

  if (type !== "track") {
    throw new Error("routeToSource is only supported for type 'track'");
  }

  // Emit warnings if user provided conflicting parameters
  if (withoutClips === false) {
    console.warn(
      "routeToSource requires withoutClips=true, ignoring user-provided withoutClips=false",
    );
  }

  if (withoutDevices === false) {
    console.warn(
      "routeToSource requires withoutDevices=true, ignoring user-provided withoutDevices=false",
    );
  }

  return { withoutClips: true, withoutDevices: true };
}

/**
 * Validates destination parameter compatibility with object type
 * @param type - Type of object being duplicated
 * @param destination - Inferred destination
 */
export function validateDestinationParameter(
  type: string,
  destination: string | undefined,
): void {
  if (type === "track" && destination === "arrangement") {
    throw new Error("tracks cannot be duplicated to arrangement");
  }
}
