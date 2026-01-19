import * as console from "#src/shared/v8-max-console.js";
import { resolveLocatorToBeats } from "#src/tools/shared/locator/locator-helpers.js";
import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.js";

/**
 * Resolves arrangement position from bar|beat or locator
 * @param liveSet - The live_set LiveAPI object
 * @param arrangementStart - Bar|beat position
 * @param arrangementLocatorId - Locator ID for position
 * @param arrangementLocatorName - Locator name for position
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Position in beats
 */
export function resolveArrangementPosition(
  liveSet: LiveAPI,
  arrangementStart: string | undefined,
  arrangementLocatorId: string | undefined,
  arrangementLocatorName: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number {
  if (arrangementLocatorId != null || arrangementLocatorName != null) {
    return resolveLocatorToBeats(
      liveSet,
      { locatorId: arrangementLocatorId, locatorName: arrangementLocatorName },
      "duplicate",
    );
  }

  return barBeatToAbletonBeats(
    arrangementStart as string,
    timeSigNumerator,
    timeSigDenominator,
  ) as number;
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
    console.error(
      "Warning: routeToSource requires withoutClips=true, ignoring user-provided withoutClips=false",
    );
  }

  if (withoutDevices === false) {
    console.error(
      "Warning: routeToSource requires withoutDevices=true, ignoring user-provided withoutDevices=false",
    );
  }

  return { withoutClips: true, withoutDevices: true };
}

/**
 * Validates clip-specific parameters
 * @param type - Type of object being duplicated
 * @param destination - Destination for clip duplication
 * @param toTrackIndex - Destination track index
 * @param toSceneIndex - Destination scene index(es), comma-separated
 */
export function validateClipParameters(
  type: string,
  destination: string | undefined,
  toTrackIndex: number | undefined,
  toSceneIndex: string | undefined,
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
  if (destination === "session") {
    if (toTrackIndex == null) {
      throw new Error(
        "duplicate failed: toTrackIndex is required for session clips",
      );
    }

    if (toSceneIndex == null || toSceneIndex.trim() === "") {
      throw new Error(
        "duplicate failed: toSceneIndex is required for session clips",
      );
    }
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
 * @param arrangementLocatorId - Locator ID for arrangement position
 * @param arrangementLocatorName - Locator name for arrangement position
 */
export function validateArrangementParameters(
  destination: string | undefined,
  arrangementStart: string | undefined,
  arrangementLocatorId: string | undefined,
  arrangementLocatorName: string | undefined,
): void {
  if (destination !== "arrangement") {
    return;
  }

  const hasStart = arrangementStart != null && arrangementStart.trim() !== "";
  const hasLocatorId = arrangementLocatorId != null;
  const hasLocatorName = arrangementLocatorName != null;
  const positionCount = [hasStart, hasLocatorId, hasLocatorName].filter(
    Boolean,
  ).length;

  if (positionCount === 0) {
    throw new Error(
      "duplicate failed: arrangementStart, arrangementLocatorId, or arrangementLocatorName is required when destination is 'arrangement'",
    );
  }

  if (positionCount > 1) {
    throw new Error(
      "duplicate failed: arrangementStart, arrangementLocatorId, and arrangementLocatorName are mutually exclusive",
    );
  }
}
