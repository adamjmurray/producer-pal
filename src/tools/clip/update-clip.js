import { parseCommaSeparatedIds, parseTimeSignature } from "../shared/utils.js";
import { validateIdTypes } from "../shared/validation/id-validation.js";
import { handleArrangementLengthOperation } from "./arrangement-operations.js";
import {
  validateAndParseArrangementParams,
  buildClipResultObject,
  emitArrangementWarnings,
} from "./clip-result-helpers.js";
import { processSingleClipUpdate } from "./update-clip-helpers.js";

/**
 * Updates properties of existing clips
 * @param {object} args - The clip parameters
 * @param {string} args.ids - Clip ID or comma-separated list of clip IDs to update
 * @param {string} [args.notes] - Musical notation string
 * @param {string} [args.noteUpdateMode="merge"] - How to handle existing notes: 'replace' or 'merge'
 * @param {string} [args.name] - Optional clip name
 * @param {string} [args.color] - Optional clip color (CSS format: hex)
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.start] - Bar|beat position where loop/clip region begins
 * @param {string} [args.length] - Duration in bar:beat format. end = start + length
 * @param {string} [args.firstStart] - Bar|beat position for initial playback start (only needed when different from start)
 * @param {boolean} [args.looping] - Enable looping for the clip
 * @param {string} [args.arrangementStart] - Bar|beat position to move arrangement clip (arrangement clips only)
 * @param {string} [args.arrangementLength] - Bar:beat duration for arrangement span (supports shortening, hidden content exposure, and tiling)
 * @param {number} [args.gainDb] - Audio clip gain in decibels (-70 to 24)
 * @param {number} [args.pitchShift] - Audio clip pitch shift in semitones (-48 to 48)
 * @param {string} [args.warpMode] - Audio clip warp mode: beats, tones, texture, repitch, complex, rex, pro
 * @param {boolean} [args.warping] - Audio clip warping on/off
 * @param {string} [args.warpOp] - Warp marker operation: add, move, remove
 * @param {number} [args.warpBeatTime] - Beat time for warp marker operation
 * @param {number} [args.warpSampleTime] - Sample time for warp marker operation
 * @param {number} [args.warpDistance] - Distance parameter for move operations
 * @param {object} context - Tool execution context with holding area settings
 * @returns {object | Array<object>} Single clip object or array of clip objects
 */
export function updateClip(
  {
    ids,
    notes: notationString,
    noteUpdateMode = "merge",
    name,
    color,
    timeSignature,
    start,
    length,
    firstStart,
    looping,
    arrangementStart,
    arrangementLength,
    gainDb,
    pitchShift,
    warpMode,
    warping,
    warpOp,
    warpBeatTime,
    warpSampleTime,
    warpDistance,
  } = {},
  context = {
    holdingAreaStartBeats: 40000,
  },
) {
  if (!ids) {
    throw new Error("updateClip failed: ids is required");
  }

  // Parse comma-separated string into array
  const clipIds = parseCommaSeparatedIds(ids);

  // Validate all IDs are clips, skip invalid ones
  const clips = validateIdTypes(clipIds, "clip", "updateClip", {
    skipInvalid: true,
  });

  // Parse and validate arrangement parameters
  const { arrangementStartBeats, arrangementLengthBeats } =
    validateAndParseArrangementParams(arrangementStart, arrangementLength);

  const updatedClips = [];

  // Track which tracks have multiple clips being moved (for overlap warning)
  const tracksWithMovedClips = new Map(); // trackIndex -> count

  for (const clip of clips) {
    processSingleClipUpdate({
      clip,
      notationString,
      noteUpdateMode,
      name,
      color,
      timeSignature,
      start,
      length,
      firstStart,
      looping,
      gainDb,
      pitchShift,
      warpMode,
      warping,
      warpOp,
      warpBeatTime,
      warpSampleTime,
      warpDistance,
      arrangementLengthBeats,
      arrangementStartBeats,
      context,
      updatedClips,
      tracksWithMovedClips,
      parseTimeSignature,
      handleArrangementLengthOperation,
      buildClipResultObject,
    });
  }

  // Emit warning if multiple clips from same track were moved to same position
  emitArrangementWarnings(arrangementStartBeats, tracksWithMovedClips);

  // Return single object if one valid result, array for multiple results or empty array for none
  if (updatedClips.length === 0) {
    return [];
  }
  return updatedClips.length === 1 ? updatedClips[0] : updatedClips;
}
