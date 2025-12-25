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
  findCue,
  findCuesByName,
  getCueId,
} from "../shared/cue/cue-helpers.js";
import { parseTimeSignature } from "../shared/utils.js";

// Create lowercase versions for case-insensitive comparison
const VALID_PITCH_CLASS_NAMES_LOWERCASE = VALID_PITCH_CLASS_NAMES.map((name) =>
  name.toLowerCase(),
);
const VALID_SCALE_NAMES_LOWERCASE = VALID_SCALE_NAMES.map((name) =>
  name.toLowerCase(),
);

/**
 * Updates Live Set parameters like tempo, time signature, scale, and cue points.
 * Note: Scale changes affect currently selected clips and set defaults for new clips.
 * @param {object} args - The parameters
 * @param {number} [args.tempo] - Set tempo in BPM (20.0-999.0)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.scale] - Scale in format "Root ScaleName" (e.g., "C Major", "F# Minor", "Bb Dorian"). Use empty string to disable scale.
 * @param {string} [args.cueOperation] - Cue point operation: "create", "delete", or "rename"
 * @param {string} [args.cueId] - Cue ID for delete/rename (e.g., "cue-0")
 * @param {string} [args.cueTime] - Bar|beat position for create/delete/rename
 * @param {string} [args.cueName] - Name for create/rename, or name filter for delete
 * @param {boolean} [args.arrangementFollower] - (Hidden from interface) Whether all tracks should follow the arrangement timeline
 * @param {object} _context - Internal context object (unused)
 * @returns {object} Updated Live Set information
 */
export async function updateLiveSet(
  {
    tempo,
    timeSignature,
    scale,
    cueOperation,
    cueId,
    cueTime,
    cueName,
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

  // Handle cue point operations
  if (cueOperation != null) {
    const cueResult = await handleCueOperation(liveSet, {
      cueOperation,
      cueId,
      cueTime,
      cueName,
    });

    result.cue = cueResult;
  }

  return result;
}

/**
 * Stop playback if currently playing (required for cue point modifications)
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @returns {boolean} True if playback was stopped
 */
function stopPlaybackIfNeeded(liveSet) {
  const isPlaying = liveSet.getProperty("is_playing") > 0;

  if (isPlaying) {
    liveSet.call("stop_playing");
    console.error("Playback stopped to modify cue points");

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
 * Handle cue point operations (create, delete, rename)
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} options - Operation options
 * @param {string} options.cueOperation - "create", "delete", or "rename"
 * @param {string} [options.cueId] - Cue ID for delete/rename
 * @param {string} [options.cueTime] - Bar|beat position
 * @param {string} [options.cueName] - Name for create/rename or name filter for delete
 * @returns {Promise<object>} Result of the cue operation
 */
async function handleCueOperation(
  liveSet,
  { cueOperation, cueId, cueTime, cueName },
) {
  const timeSigNumerator = liveSet.getProperty("signature_numerator");
  const timeSigDenominator = liveSet.getProperty("signature_denominator");

  switch (cueOperation) {
    case "create":
      return await createCue(liveSet, {
        cueTime,
        cueName,
        timeSigNumerator,
        timeSigDenominator,
      });
    case "delete":
      return await deleteCue(liveSet, {
        cueId,
        cueTime,
        cueName,
        timeSigNumerator,
        timeSigDenominator,
      });
    case "rename":
      return renameCue(liveSet, {
        cueId,
        cueTime,
        cueName,
        timeSigNumerator,
        timeSigDenominator,
      });
    default:
      throw new Error(`Unknown cue operation: ${cueOperation}`);
  }
}

/**
 * Create a cue point at the specified position
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} options - Create options
 * @param {string} options.cueTime - Bar|beat position for the cue
 * @param {string} [options.cueName] - Optional name for the cue
 * @param {number} options.timeSigNumerator - Time signature numerator
 * @param {number} options.timeSigDenominator - Time signature denominator
 * @returns {Promise<object>} Created cue info
 */
async function createCue(
  liveSet,
  { cueTime, cueName, timeSigNumerator, timeSigDenominator },
) {
  if (cueTime == null) {
    throw new Error("cueTime is required for create operation");
  }

  const targetBeats = barBeatToAbletonBeats(
    cueTime,
    timeSigNumerator,
    timeSigDenominator,
  );

  stopPlaybackIfNeeded(liveSet);

  // Move playhead and wait for it to update (race condition fix)
  liveSet.set("current_song_time", targetBeats);
  await waitForPlayheadPosition(liveSet, targetBeats);

  // Create cue at current playhead position
  liveSet.call("set_or_delete_cue");

  // Find the newly created cue to get its index and set name if provided
  const found = findCue(liveSet, { timeInBeats: targetBeats });

  if (found && cueName != null) {
    found.cue.set("name", cueName);
  }

  return {
    operation: "created",
    time: cueTime,
    ...(cueName != null && { name: cueName }),
    ...(found && { id: getCueId(found.index) }),
  };
}

/**
 * Delete cue point(s) by ID, time, or name
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} options - Delete options
 * @param {string} [options.cueId] - Cue ID to delete
 * @param {string} [options.cueTime] - Bar|beat position to delete
 * @param {string} [options.cueName] - Name filter for batch delete
 * @param {number} options.timeSigNumerator - Time signature numerator
 * @param {number} options.timeSigDenominator - Time signature denominator
 * @returns {Promise<object>} Deletion result
 */
async function deleteCue(
  liveSet,
  { cueId, cueTime, cueName, timeSigNumerator, timeSigDenominator },
) {
  // Validate that at least one identifier is provided
  if (cueId == null && cueTime == null && cueName == null) {
    throw new Error("delete requires cueId, cueTime, or cueName");
  }

  stopPlaybackIfNeeded(liveSet);

  // Delete by name (can match multiple cues)
  if (cueId == null && cueTime == null && cueName != null) {
    const matches = findCuesByName(liveSet, cueName);

    if (matches.length === 0) {
      throw new Error(`No cues found with name: ${cueName}`);
    }

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
      name: cueName,
    };
  }

  // Delete by ID or time (single cue)
  let timeInBeats;

  if (cueId != null) {
    const found = findCue(liveSet, { cueId });

    if (!found) {
      throw new Error(`Cue not found: ${cueId}`);
    }

    timeInBeats = found.cue.getProperty("time");
  } else if (cueTime != null) {
    timeInBeats = barBeatToAbletonBeats(
      cueTime,
      timeSigNumerator,
      timeSigDenominator,
    );
    const found = findCue(liveSet, { timeInBeats });

    if (!found) {
      throw new Error(`No cue found at position: ${cueTime}`);
    }
  }

  liveSet.set("current_song_time", timeInBeats);
  await waitForPlayheadPosition(liveSet, timeInBeats);
  liveSet.call("set_or_delete_cue");

  return {
    operation: "deleted",
    ...(cueId != null && { id: cueId }),
    ...(cueTime != null && { time: cueTime }),
  };
}

/**
 * Rename a cue point by ID or time
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {object} options - Rename options
 * @param {string} [options.cueId] - Cue ID to rename
 * @param {string} [options.cueTime] - Bar|beat position to rename
 * @param {string} options.cueName - New name for the cue
 * @param {number} options.timeSigNumerator - Time signature numerator
 * @param {number} options.timeSigDenominator - Time signature denominator
 * @returns {object} Rename result
 */
function renameCue(
  liveSet,
  { cueId, cueTime, cueName, timeSigNumerator, timeSigDenominator },
) {
  if (cueName == null) {
    throw new Error("cueName is required for rename operation");
  }

  if (cueId == null && cueTime == null) {
    throw new Error("rename requires cueId or cueTime");
  }

  let found;

  if (cueId != null) {
    found = findCue(liveSet, { cueId });

    if (!found) {
      throw new Error(`Cue not found: ${cueId}`);
    }
  } else {
    const timeInBeats = barBeatToAbletonBeats(
      cueTime,
      timeSigNumerator,
      timeSigDenominator,
    );

    found = findCue(liveSet, { timeInBeats });

    if (!found) {
      throw new Error(`No cue found at position: ${cueTime}`);
    }
  }

  found.cue.set("name", cueName);

  return {
    operation: "renamed",
    id: getCueId(found.index),
    name: cueName,
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
