import {
  validateAndParseArrangementParams,
  emitArrangementWarnings,
} from "#src/tools/clip/helpers/clip-result-helpers.js";
import {
  parseCommaSeparatedIds,
  unwrapSingleResult,
} from "#src/tools/shared/utils.js";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.js";
import { processSingleClipUpdate } from "./helpers/update-clip-helpers.js";

/**
 * @typedef {object} UpdateClipArgs
 * @property {string} ids - Clip ID or comma-separated list of clip IDs to update
 * @property {string} [notes] - Musical notation string
 * @property {string} [modulations] - Modulation expressions (parameter: expression per line)
 * @property {string} [noteUpdateMode] - How to handle existing notes: 'replace' or 'merge'
 * @property {string} [name] - Optional clip name
 * @property {string} [color] - Optional clip color (CSS format: hex)
 * @property {string} [timeSignature] - Time signature in format "4/4"
 * @property {string} [start] - Bar|beat position where loop/clip region begins
 * @property {string} [length] - Duration in bar:beat format. end = start + length
 * @property {string} [firstStart] - Bar|beat position for initial playback start
 * @property {boolean} [looping] - Enable looping for the clip
 * @property {string} [arrangementStart] - Bar|beat position to move arrangement clip
 * @property {string} [arrangementLength] - Bar:beat duration for arrangement span
 * @property {number} [gainDb] - Audio clip gain in decibels (-70 to 24)
 * @property {number} [pitchShift] - Audio clip pitch shift in semitones (-48 to 48)
 * @property {string} [warpMode] - Audio clip warp mode
 * @property {boolean} [warping] - Audio clip warping on/off
 * @property {string} [warpOp] - Warp marker operation: add, move, remove
 * @property {number} [warpBeatTime] - Beat time for warp marker operation
 * @property {number} [warpSampleTime] - Sample time for warp marker operation
 * @property {number} [warpDistance] - Distance parameter for move operations
 * @property {number} [quantize] - Quantization strength 0-1 (MIDI clips only)
 * @property {string} [quantizeGrid] - Note grid for quantization
 * @property {number} [quantizeSwing] - Swing amount 0-1 (default: 0)
 * @property {number} [quantizePitch] - Limit quantization to specific pitch
 */

/**
 * Updates properties of existing clips
 * @param {UpdateClipArgs} args - The clip parameters
 * @param {Partial<ToolContext>} [context] - Tool execution context with holding area settings
 * @returns {object | Array<object>} Single clip object or array of clip objects
 */
export function updateClip(
  {
    ids,
    notes: notationString,
    modulations: modulationString,
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
    quantize,
    quantizeGrid,
    quantizeSwing,
    quantizePitch,
  },
  context = {},
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

  /** @type {Array<object>} */
  const updatedClips = [];

  // Track which tracks have multiple clips being moved (for overlap warning)
  const tracksWithMovedClips = new Map(); // trackIndex -> count

  for (const clip of clips) {
    processSingleClipUpdate({
      clip,
      notationString,
      modulationString,
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
      quantize,
      quantizeGrid,
      quantizeSwing,
      quantizePitch,
      arrangementLengthBeats,
      arrangementStartBeats,
      context,
      updatedClips,
      tracksWithMovedClips,
    });
  }

  // Emit warning if multiple clips from same track were moved to same position
  emitArrangementWarnings(arrangementStartBeats, tracksWithMovedClips);

  return /** @type {object | Array<object>} */ (
    unwrapSingleResult(updatedClips)
  );
}
