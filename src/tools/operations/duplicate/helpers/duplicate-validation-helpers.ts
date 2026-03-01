// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { resolveLocatorListToBeats } from "#src/tools/shared/locator/locator-helpers.ts";

/**
 * Resolves arrangement positions from bar|beat or locator(s).
 * Supports comma-separated locator IDs and names for multiple positions.
 * @param liveSet - The live_set LiveAPI object
 * @param arrangementStart - Bar|beat position
 * @param locatorId - Arrangement locator ID(s), comma-separated
 * @param locatorName - Arrangement locator name(s), comma-separated
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Array of positions in beats
 */
export function resolveArrangementPositions(
  liveSet: LiveAPI,
  arrangementStart: string | undefined,
  locatorId: string | undefined,
  locatorName: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number[] {
  if (locatorId != null || locatorName != null) {
    return resolveLocatorListToBeats(
      liveSet,
      { locatorId, locatorName },
      "duplicate",
    );
  }

  return [
    barBeatToAbletonBeats(
      arrangementStart as string,
      timeSigNumerator,
      timeSigDenominator,
    ),
  ];
}

/**
 * Validates basic input parameters for duplication
 * @param type - Type of object to duplicate
 * @param id - ID of the object to duplicate
 * @param count - Number of duplicates to create
 */
export function validateBasicInputs(
  type: string,
  id: string,
  count: number,
): void {
  if (!type) {
    throw new Error("duplicate failed: type is required");
  }

  const validTypes = ["track", "scene", "clip", "device"];

  if (!validTypes.includes(type)) {
    throw new Error(
      `duplicate failed: type must be one of ${validTypes.join(", ")}`,
    );
  }

  if (!id) {
    throw new Error("duplicate failed: id is required");
  }

  if (count < 1) {
    throw new Error("duplicate failed: count must be at least 1");
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
    throw new Error(
      "duplicate failed: routeToSource is only supported for type 'track'",
    );
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
 * Validates clip-specific parameters
 * @param type - Type of object being duplicated
 * @param destination - Destination for clip duplication
 * @param toSlot - Destination clip slot(s) in trackIndex/sceneIndex format
 */
export function validateClipParameters(
  type: string,
  destination: string | undefined,
  toSlot: string | undefined,
): void {
  if (type !== "clip") {
    return;
  }

  if (!destination) {
    throw new Error(
      "duplicate failed: destination is required for type 'clip'",
    );
  }

  if (!["session", "arrangement"].includes(destination)) {
    throw new Error(
      "duplicate failed: destination must be 'session' or 'arrangement'",
    );
  }

  // Validate session clip destination parameters
  if (destination === "session" && (toSlot == null || toSlot.trim() === "")) {
    throw new Error("duplicate failed: toSlot is required for session clips");
  }
}

/**
 * Validates destination parameter compatibility with object type
 * @param type - Type of object being duplicated
 * @param destination - Destination for duplication
 */
export function validateDestinationParameter(
  type: string,
  destination: string | undefined,
): void {
  if (destination == null) {
    return; // destination is optional for tracks and scenes
  }

  if (type === "track" && destination === "arrangement") {
    throw new Error(
      "duplicate failed: tracks cannot be duplicated to arrangement (use destination='session' or omit destination parameter)",
    );
  }
}

/**
 * Validates arrangement-specific parameters
 * @param destination - Destination for duplication
 * @param arrangementStart - Start time in bar|beat format
 * @param locatorId - Arrangement locator ID(s) for position
 * @param locatorName - Arrangement locator name(s) for position
 */
export function validateArrangementParameters(
  destination: string | undefined,
  arrangementStart: string | undefined,
  locatorId: string | undefined,
  locatorName: string | undefined,
): void {
  if (destination !== "arrangement") {
    return;
  }

  const hasStart = arrangementStart != null && arrangementStart.trim() !== "";
  const hasLocatorId = locatorId != null;
  const hasLocatorName = locatorName != null;
  const positionCount = [hasStart, hasLocatorId, hasLocatorName].filter(
    Boolean,
  ).length;

  if (positionCount === 0) {
    throw new Error(
      "duplicate failed: arrangementStart, locatorId, or locatorName is required when destination is 'arrangement'",
    );
  }

  if (positionCount > 1) {
    throw new Error(
      "duplicate failed: arrangementStart, locatorId, and locatorName are mutually exclusive",
    );
  }
}
