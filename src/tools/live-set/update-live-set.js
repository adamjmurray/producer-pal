import { barBeatToAbletonBeats } from "../../notation/barbeat/time/barbeat-time.js";
import { intervalsToPitchClasses } from "../../notation/midi-pitch-to-name.js";
import {
  pitchClassNameToNumber,
  VALID_PITCH_CLASS_NAMES,
} from "../../notation/pitch-class-name-to-number.js";
import * as console from "../../shared/v8-max-console.js";
import { waitUntil } from "../../shared/v8-sleep.js";
import { VALID_SCALE_NAMES } from "../constants.js";
import {
  findLocator,
  findLocatorsByName,
  getLocatorId,
} from "../shared/locator/locator-helpers.js";
import { parseTimeSignature } from "../shared/utils.js";

// Create lowercase versions for case-insensitive comparison
const VALID_PITCH_CLASS_NAMES_LOWERCASE = VALID_PITCH_CLASS_NAMES.map((name) =>
  name.toLowerCase(),
);
const VALID_SCALE_NAMES_LOWERCASE = VALID_SCALE_NAMES.map((name) =>
  name.toLowerCase(),
);

/**
 * Updates Live Set parameters like tempo, time signature, scale, and locators.
 * Note: Scale changes affect currently selected clips and set defaults for new clips.
 * @param {object} args - The parameters
 * @param {number} [args.tempo] - Set tempo in BPM (20.0-999.0)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.scale] - Scale in format "Root ScaleName" (e.g., "C Major", "F# Minor", "Bb Dorian"). Use empty string to disable scale.
 * @param {string} [args.locatorOperation] - Locator operation: "create", "delete", or "rename"
 * @param {string} [args.locatorId] - Locator ID for delete/rename (e.g., "locator-0")
 * @param {string} [args.locatorTime] - Bar|beat position for create/delete/rename
 * @param {string} [args.locatorName] - Name for create/rename, or name filter for delete
 * @param {boolean} [args.arrangementFollower] - (Hidden from interface) Whether all tracks should follow the arrangement timeline
 * @param {object} _context - Internal context object (unused)
 * @returns {object} Updated Live Set information
 */
export async function updateLiveSet(
  {
    tempo,
    timeSignature,
    scale,
    locatorOperation,
    locatorId,
    locatorTime,
    locatorName,
    arrangementFollower,
  } = {},
  _context = {},
) {
  const liveSet = new LiveAPI("live_set");

  // optimistic result object that only include properties that are actually set
  const result = {
    id: liveSet.id,
  };

  if (tempo != null) {
    if (tempo < 20 || tempo > 999) {
      throw new Error("Tempo must be between 20.0 and 999.0 BPM");
    }

    liveSet.set("tempo", tempo);

    result.tempo = tempo;
  }

  if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);

    liveSet.set("signature_numerator", parsed.numerator);
    liveSet.set("signature_denominator", parsed.denominator);

    result.timeSignature = `${parsed.numerator}/${parsed.denominator}`;
  }

  if (scale != null) {
    if (scale === "") {
      // Empty string disables the scale
      liveSet.set("scale_mode", 0);

      result.scale = "";
    } else {
      // Non-empty string sets the scale and enables it
      const { scaleRoot, scaleName } = parseScale(scale);
      const scaleRootNumber = pitchClassNameToNumber(scaleRoot);

      liveSet.set("root_note", scaleRootNumber);
      liveSet.set("scale_name", scaleName);
      liveSet.set("scale_mode", 1);

      result.scale = `${scaleRoot} ${scaleName}`;
    }

    if (!result.$meta) {
      result.$meta = [];
    }

    result.$meta.push(
      "Scale applied to selected clips and defaults for new clips.",
    );
  }

  if (arrangementFollower != null) {
    liveSet.set("back_to_arranger", arrangementFollower ? 0 : 1);

    result.arrangementFollower = arrangementFollower;
  }

  // Include scalePitches when scale is set to a non-empty value
  const shouldIncludeScalePitches = scale != null && scale !== "";

  if (shouldIncludeScalePitches) {
    const rootNote = liveSet.getProperty("root_note");
    const scaleIntervals = liveSet.getProperty("scale_intervals");

    result.scalePitches = intervalsToPitchClasses(scaleIntervals, rootNote);
  }

  // Handle locator operations
  if (locatorOperation != null) {
    const locatorResult = await handleLocatorOperation(liveSet, {
      locatorOperation,
      locatorId,
      locatorTime,
      locatorName,
    });

    result.locator = locatorResult;
  }

  return result;
}

/**
 * Stop playback if currently playing (required for locator modifications)
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @returns {boolean} True if playback was stopped
 */
function stopPlaybackIfNeeded(liveSet) {
  const isPlaying = liveSet.getProperty("is_playing") > 0;

  if (isPlaying) {
    liveSet.call("stop_playing");
    console.error("Playback stopped to modify locators");

    return true;
  }

  return false;
}

/**
 * Wait for the playhead position to reach the target time
 * This is needed because set_or_delete_cue operates on the actual playhead position,
 * which updates asynchronously after setting current_song_time
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {number} targetBeats - Expected position in beats
 * @returns {Promise<void>}
 */
async function waitForPlayheadPosition(liveSet, targetBeats) {
  const success = await waitUntil(
    () =>
      Math.abs(liveSet.getProperty("current_song_time") - targetBeats) < 0.001,
    { pollingInterval: 10, maxRetries: 10 },
  );

  if (!success) {
    console.error(
      `Warning: Playhead position did not reach target ${targetBeats} after waiting`,
    );
  }
}

/**
 * Handle locator operations (create, delete, rename)
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} options - Operation options
 * @param {string} options.locatorOperation - "create", "delete", or "rename"
 * @param {string} [options.locatorId] - Locator ID for delete/rename
 * @param {string} [options.locatorTime] - Bar|beat position
 * @param {string} [options.locatorName] - Name for create/rename or name filter for delete
 * @returns {Promise<object>} Result of the locator operation
 */
async function handleLocatorOperation(
  liveSet,
  { locatorOperation, locatorId, locatorTime, locatorName },
) {
  const timeSigNumerator = liveSet.getProperty("signature_numerator");
  const timeSigDenominator = liveSet.getProperty("signature_denominator");

  switch (locatorOperation) {
    case "create":
      return await createLocator(liveSet, {
        locatorTime,
        locatorName,
        timeSigNumerator,
        timeSigDenominator,
      });
    case "delete":
      return await deleteLocator(liveSet, {
        locatorId,
        locatorTime,
        locatorName,
        timeSigNumerator,
        timeSigDenominator,
      });
    case "rename":
      return renameLocator(liveSet, {
        locatorId,
        locatorTime,
        locatorName,
        timeSigNumerator,
        timeSigDenominator,
      });
    default:
      throw new Error(`Unknown locator operation: ${locatorOperation}`);
  }
}

/**
 * Create a locator at the specified position
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} options - Create options
 * @param {string} options.locatorTime - Bar|beat position for the locator
 * @param {string} [options.locatorName] - Optional name for the locator
 * @param {number} options.timeSigNumerator - Time signature numerator
 * @param {number} options.timeSigDenominator - Time signature denominator
 * @returns {Promise<object>} Created locator info
 */
async function createLocator(
  liveSet,
  { locatorTime, locatorName, timeSigNumerator, timeSigDenominator },
) {
  if (locatorTime == null) {
    throw new Error("locatorTime is required for create operation");
  }

  const targetBeats = barBeatToAbletonBeats(
    locatorTime,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Check if a locator already exists at this position
  const existing = findLocator(liveSet, { timeInBeats: targetBeats });

  if (existing) {
    console.error(
      `Locator already exists at ${locatorTime} (id: ${getLocatorId(existing.index)}), skipping create`,
    );

    return {
      operation: "skipped",
      reason: "locator_exists",
      time: locatorTime,
      existingId: getLocatorId(existing.index),
    };
  }

  stopPlaybackIfNeeded(liveSet);

  // Move playhead and wait for it to update (race condition fix)
  liveSet.set("current_song_time", targetBeats);
  await waitForPlayheadPosition(liveSet, targetBeats);

  // Create locator at current playhead position
  liveSet.call("set_or_delete_cue");

  // Find the newly created locator to get its index and set name if provided
  const found = findLocator(liveSet, { timeInBeats: targetBeats });

  if (found && locatorName != null) {
    found.locator.set("name", locatorName);
  }

  return {
    operation: "created",
    time: locatorTime,
    ...(locatorName != null && { name: locatorName }),
    ...(found && { id: getLocatorId(found.index) }),
  };
}

/**
 * Delete locator(s) by ID, time, or name
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} options - Delete options
 * @param {string} [options.locatorId] - Locator ID to delete
 * @param {string} [options.locatorTime] - Bar|beat position to delete
 * @param {string} [options.locatorName] - Name filter for batch delete
 * @param {number} options.timeSigNumerator - Time signature numerator
 * @param {number} options.timeSigDenominator - Time signature denominator
 * @returns {Promise<object>} Deletion result
 */
async function deleteLocator(
  liveSet,
  { locatorId, locatorTime, locatorName, timeSigNumerator, timeSigDenominator },
) {
  // Validate that at least one identifier is provided
  if (locatorId == null && locatorTime == null && locatorName == null) {
    throw new Error("delete requires locatorId, locatorTime, or locatorName");
  }

  // Delete by name (can match multiple locators)
  if (locatorId == null && locatorTime == null && locatorName != null) {
    const matches = findLocatorsByName(liveSet, locatorName);

    if (matches.length === 0) {
      console.error(
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
  let timeInBeats;

  if (locatorId != null) {
    const found = findLocator(liveSet, { locatorId });

    if (!found) {
      console.error(`Locator not found: ${locatorId}, skipping delete`);

      return {
        operation: "skipped",
        reason: "locator_not_found",
        id: locatorId,
      };
    }

    timeInBeats = found.locator.getProperty("time");
  } else if (locatorTime != null) {
    timeInBeats = barBeatToAbletonBeats(
      locatorTime,
      timeSigNumerator,
      timeSigDenominator,
    );
    const found = findLocator(liveSet, { timeInBeats });

    if (!found) {
      console.error(
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
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} options - Rename options
 * @param {string} [options.locatorId] - Locator ID to rename
 * @param {string} [options.locatorTime] - Bar|beat position to rename
 * @param {string} options.locatorName - New name for the locator
 * @param {number} options.timeSigNumerator - Time signature numerator
 * @param {number} options.timeSigDenominator - Time signature denominator
 * @returns {object} Rename result
 */
function renameLocator(
  liveSet,
  { locatorId, locatorTime, locatorName, timeSigNumerator, timeSigDenominator },
) {
  if (locatorName == null) {
    throw new Error("locatorName is required for rename operation");
  }

  if (locatorId == null && locatorTime == null) {
    throw new Error("rename requires locatorId or locatorTime");
  }

  let found;

  if (locatorId != null) {
    found = findLocator(liveSet, { locatorId });

    if (!found) {
      throw new Error(`Locator not found: ${locatorId}`);
    }
  } else {
    const timeInBeats = barBeatToAbletonBeats(
      locatorTime,
      timeSigNumerator,
      timeSigDenominator,
    );

    found = findLocator(liveSet, { timeInBeats });

    if (!found) {
      throw new Error(`No locator found at position: ${locatorTime}`);
    }
  }

  found.locator.set("name", locatorName);

  return {
    operation: "renamed",
    id: getLocatorId(found.index),
    name: locatorName,
  };
}

/**
 * Parses a combined scale string like "C Major" into root note and scale name
 * @param {string} scaleString - Scale in format "Root ScaleName"
 * @returns {{scaleRoot: string, scaleName: string}} Parsed components
 */
function parseScale(scaleString) {
  const trimmed = scaleString.trim();

  // Split on one or more whitespace characters
  const parts = trimmed.split(/\s+/);

  if (parts.length < 2) {
    throw new Error(
      `Scale must be in format 'Root ScaleName' (e.g., 'C Major'), got: ${scaleString}`,
    );
  }

  // Extract root and reconstruct scale name from remaining parts
  const [scaleRoot, ...scaleNameParts] = parts;
  const scaleName = scaleNameParts.join(" ");

  // Find the correct casing by comparing lowercase versions
  const scaleRootLower = scaleRoot.toLowerCase();
  const scaleNameLower = scaleName.toLowerCase();

  const scaleRootIndex =
    VALID_PITCH_CLASS_NAMES_LOWERCASE.indexOf(scaleRootLower);

  if (scaleRootIndex === -1) {
    throw new Error(
      `Invalid scale root '${scaleRoot}'. Valid roots: ${VALID_PITCH_CLASS_NAMES.join(", ")}`,
    );
  }

  const scaleNameIndex = VALID_SCALE_NAMES_LOWERCASE.indexOf(scaleNameLower);

  if (scaleNameIndex === -1) {
    throw new Error(
      `Invalid scale name '${scaleName}'. Valid scales: ${VALID_SCALE_NAMES.join(", ")}`,
    );
  }

  // Return the canonical casing from the original arrays
  return {
    scaleRoot: VALID_PITCH_CLASS_NAMES[scaleRootIndex],
    scaleName: VALID_SCALE_NAMES[scaleNameIndex],
  };
}
