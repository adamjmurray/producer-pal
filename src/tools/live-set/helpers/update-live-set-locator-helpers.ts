import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { waitUntil } from "#src/shared/v8-sleep.ts";
import {
  findLocator,
  findLocatorsByName,
  getLocatorId,
} from "#src/tools/shared/locator/locator-helpers.ts";

interface DeleteLocatorOptions {
  locatorId?: string;
  locatorTime?: string;
  locatorName?: string;
  timeSigNumerator: number;
  timeSigDenominator: number;
}

interface RenameLocatorOptions {
  locatorId?: string;
  locatorTime?: string;
  locatorName?: string;
  timeSigNumerator: number;
  timeSigDenominator: number;
}

/**
 * Stop playback if currently playing (required for locator modifications)
 * @param liveSet - The live_set LiveAPI object
 * @returns True if playback was stopped
 */
export function stopPlaybackIfNeeded(liveSet: LiveAPI): boolean {
  const isPlaying = (liveSet.getProperty("is_playing") as number) > 0;

  if (isPlaying) {
    liveSet.call("stop_playing");
    console.warn("Playback stopped to modify locators");

    return true;
  }

  return false;
}

/**
 * Wait for the playhead position to reach the target time.
 *
 * This is required because `set_or_delete_cue` operates on the actual playhead
 * position, not a parameter. When we call `liveSet.set("current_song_time", X)`,
 * Live updates the playhead asynchronously. If we call `set_or_delete_cue`
 * immediately, it may operate on the old position. We must poll until the
 * playhead reaches the target before proceeding.
 *
 * Note: The playhead cannot be positioned past the song's content length. If you
 * need to create a locator beyond the current song end, use `extendSongIfNeeded`
 * to temporarily add content that extends the song length first.
 *
 * @param liveSet - The live_set LiveAPI object
 * @param targetBeats - Expected position in beats
 */
export async function waitForPlayheadPosition(
  liveSet: LiveAPI,
  targetBeats: number,
): Promise<void> {
  const success = await waitUntil(
    () =>
      Math.abs(
        (liveSet.getProperty("current_song_time") as number) - targetBeats,
      ) < 0.001,
    { pollingInterval: 10, maxRetries: 10 },
  );

  if (!success) {
    console.warn(
      `Playhead position did not reach target ${targetBeats} after waiting`,
    );
  }
}

/**
 * Delete locator(s) by ID, time, or name
 * @param liveSet - The live_set LiveAPI object
 * @param options - Delete options
 * @param options.locatorId - Locator ID to delete
 * @param options.locatorTime - Bar|beat position to delete
 * @param options.locatorName - Name filter for batch delete
 * @param options.timeSigNumerator - Time signature numerator
 * @param options.timeSigDenominator - Time signature denominator
 * @returns Deletion result
 */
export async function deleteLocator(
  liveSet: LiveAPI,
  {
    locatorId,
    locatorTime,
    locatorName,
    timeSigNumerator,
    timeSigDenominator,
  }: DeleteLocatorOptions,
): Promise<Record<string, unknown>> {
  // Validate that at least one identifier is provided
  if (locatorId == null && locatorTime == null && locatorName == null) {
    console.warn("delete requires locatorId, locatorTime, or locatorName");

    return {
      operation: "skipped",
      reason: "missing_identifier",
    };
  }

  // Delete by name (can match multiple locators)
  if (locatorId == null && locatorTime == null && locatorName != null) {
    const matches = findLocatorsByName(liveSet, locatorName);

    if (matches.length === 0) {
      console.warn(
        `No locators found with name: ${locatorName}, skipping delete`,
      );

      return {
        operation: "skipped",
        reason: "no_locators_found",
        name: locatorName,
      };
    }

    stopPlaybackIfNeeded(liveSet);

    // Delete in reverse order to avoid index shifting issues
    const times = matches.map((m) => m.time).sort((a, b) => b - a);

    for (const time of times) {
      liveSet.set("current_song_time", time);
      await waitForPlayheadPosition(liveSet, time);
      liveSet.call("set_or_delete_cue");
    }

    return {
      operation: "deleted",
      count: matches.length,
      name: locatorName,
    };
  }

  // Delete by ID or time (single locator)
  let timeInBeats = 0;

  if (locatorId != null) {
    const found = findLocator(liveSet, { locatorId });

    if (!found) {
      console.warn(`Locator not found: ${locatorId}, skipping delete`);

      return {
        operation: "skipped",
        reason: "locator_not_found",
        id: locatorId,
      };
    }

    timeInBeats = found.locator.getProperty("time") as number;
  } else {
    // locatorTime must be defined here (validated above)
    timeInBeats = barBeatToAbletonBeats(
      locatorTime as string,
      timeSigNumerator,
      timeSigDenominator,
    );
    const found = findLocator(liveSet, { timeInBeats });

    if (!found) {
      console.warn(
        `No locator found at position: ${locatorTime}, skipping delete`,
      );

      return {
        operation: "skipped",
        reason: "locator_not_found",
        time: locatorTime,
      };
    }
  }

  stopPlaybackIfNeeded(liveSet);

  liveSet.set("current_song_time", timeInBeats);
  await waitForPlayheadPosition(liveSet, timeInBeats);
  liveSet.call("set_or_delete_cue");

  return {
    operation: "deleted",
    ...(locatorId != null && { id: locatorId }),
    ...(locatorTime != null && { time: locatorTime }),
  };
}

/**
 * Rename a locator by ID or time
 * @param liveSet - The live_set LiveAPI object
 * @param options - Rename options
 * @param options.locatorId - Locator ID to rename
 * @param options.locatorTime - Bar|beat position to rename
 * @param options.locatorName - New name for the locator
 * @param options.timeSigNumerator - Time signature numerator
 * @param options.timeSigDenominator - Time signature denominator
 * @returns Rename result
 */
export function renameLocator(
  liveSet: LiveAPI,
  {
    locatorId,
    locatorTime,
    locatorName,
    timeSigNumerator,
    timeSigDenominator,
  }: RenameLocatorOptions,
): Record<string, unknown> {
  if (locatorName == null) {
    console.warn("locatorName is required for rename operation");

    return {
      operation: "skipped",
      reason: "missing_locatorName",
    };
  }

  if (locatorId == null && locatorTime == null) {
    console.warn("rename requires locatorId or locatorTime");

    return {
      operation: "skipped",
      reason: "missing_identifier",
    };
  }

  let found;

  if (locatorId != null) {
    found = findLocator(liveSet, { locatorId });

    if (!found) {
      console.warn(`locator not found: ${locatorId}`);

      return {
        operation: "skipped",
        reason: "locator_not_found",
        id: locatorId,
      };
    }
  } else {
    // locatorTime must be defined here (validated above)
    const timeInBeats = barBeatToAbletonBeats(
      locatorTime as string,
      timeSigNumerator,
      timeSigDenominator,
    );

    found = findLocator(liveSet, { timeInBeats });

    if (!found) {
      console.warn(`no locator found at position: ${locatorTime}`);

      return {
        operation: "skipped",
        reason: "locator_not_found",
        time: locatorTime,
      };
    }
  }

  found.locator.set("name", locatorName);

  return {
    operation: "renamed",
    id: getLocatorId(found.index),
    name: locatorName,
  };
}
