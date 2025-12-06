import { intervalsToPitchClasses } from "../../notation/midi-pitch-to-name.js";
import {
  pitchClassNameToNumber,
  VALID_PITCH_CLASS_NAMES,
} from "../../notation/pitch-class-name-to-number.js";
import { VALID_SCALE_NAMES } from "../constants.js";
import { parseTimeSignature } from "../shared/utils.js";

// Create lowercase versions for case-insensitive comparison
const VALID_PITCH_CLASS_NAMES_LOWERCASE = VALID_PITCH_CLASS_NAMES.map((name) =>
  name.toLowerCase(),
);
const VALID_SCALE_NAMES_LOWERCASE = VALID_SCALE_NAMES.map((name) =>
  name.toLowerCase(),
);

/**
 * Updates Live Set parameters like tempo, time signature, and scale.\n * Note: Scale changes affect currently selected clips and set defaults for new clips.
 * @param {object} args - The parameters
 * @param {number} [args.tempo] - Set tempo in BPM (20.0-999.0)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.scale] - Scale in format "Root ScaleName" (e.g., "C Major", "F# Minor", "Bb Dorian"). Use empty string to disable scale.
 * @param {boolean} [args.arrangementFollower] - (Hidden from interface) Whether all tracks should follow the arrangement timeline
 * @param {object} _context - Internal context object (unused)
 * @returns {object} Updated Live Set information
 */
export function updateLiveSet(
  { tempo, timeSignature, scale, arrangementFollower } = {},
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

  return result;
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
