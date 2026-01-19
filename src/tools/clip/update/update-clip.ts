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

interface UpdateClipArgs {
  /** Clip ID or comma-separated list of clip IDs to update */
  ids?: string;
  /** Musical notation string */
  notes?: string;
  /** Modulation expressions (parameter: expression per line) */
  modulations?: string;
  /** How to handle existing notes: 'replace' or 'merge' */
  noteUpdateMode?: string;
  /** Optional clip name */
  name?: string;
  /** Optional clip color (CSS format: hex) */
  color?: string;
  /** Time signature in format "4/4" */
  timeSignature?: string;
  /** Bar|beat position where loop/clip region begins */
  start?: string;
  /** Duration in bar:beat format. end = start + length */
  length?: string;
  /** Bar|beat position for initial playback start */
  firstStart?: string;
  /** Enable looping for the clip */
  looping?: boolean;
  /** Bar|beat position to move arrangement clip */
  arrangementStart?: string;
  /** Bar:beat duration for arrangement span */
  arrangementLength?: string;
  /** Audio clip gain in decibels (-70 to 24) */
  gainDb?: number;
  /** Audio clip pitch shift in semitones (-48 to 48) */
  pitchShift?: number;
  /** Audio clip warp mode */
  warpMode?: string;
  /** Audio clip warping on/off */
  warping?: boolean;
  /** Warp marker operation: add, move, remove */
  warpOp?: string;
  /** Beat time for warp marker operation */
  warpBeatTime?: number;
  /** Sample time for warp marker operation */
  warpSampleTime?: number;
  /** Distance parameter for move operations */
  warpDistance?: number;
  /** Quantization strength 0-1 (MIDI clips only) */
  quantize?: number;
  /** Note grid for quantization */
  quantizeGrid?: string;
  /** Swing amount 0-1 (default: 0) */
  quantizeSwing?: number;
  /** Limit quantization to specific pitch */
  quantizePitch?: number;
}

interface ClipResult {
  id: string;
  noteCount?: number;
}

/**
 * Updates properties of existing clips
 * @param args - The clip parameters
 * @param args.ids - Clip ID or comma-separated list of clip IDs to update
 * @param args.notes - Musical notation string
 * @param args.modulations - Modulation expressions (parameter: expression per line)
 * @param args.noteUpdateMode - How to handle existing notes: 'replace' or 'merge'
 * @param args.name - Optional clip name
 * @param args.color - Optional clip color (CSS format: hex)
 * @param args.timeSignature - Time signature in format "4/4"
 * @param args.start - Bar|beat position where loop/clip region begins
 * @param args.length - Duration in bar:beat format. end = start + length
 * @param args.firstStart - Bar|beat position for initial playback start
 * @param args.looping - Enable looping for the clip
 * @param args.arrangementStart - Bar|beat position to move arrangement clip
 * @param args.arrangementLength - Bar:beat duration for arrangement span
 * @param args.gainDb - Audio clip gain in decibels (-70 to 24)
 * @param args.pitchShift - Audio clip pitch shift in semitones (-48 to 48)
 * @param args.warpMode - Audio clip warp mode
 * @param args.warping - Audio clip warping on/off
 * @param args.warpOp - Warp marker operation: add, move, remove
 * @param args.warpBeatTime - Beat time for warp marker operation
 * @param args.warpSampleTime - Sample time for warp marker operation
 * @param args.warpDistance - Distance parameter for move operations
 * @param args.quantize - Quantization strength 0-1 (MIDI clips only)
 * @param args.quantizeGrid - Note grid for quantization
 * @param args.quantizeSwing - Swing amount 0-1 (default: 0)
 * @param args.quantizePitch - Limit quantization to specific pitch
 * @param context - Tool execution context with holding area settings
 * @returns Single clip object or array of clip objects
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
  }: UpdateClipArgs = {},
  context: Partial<ToolContext> = {},
): ClipResult | ClipResult[] {
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

  const updatedClips: ClipResult[] = [];

  // Track which tracks have multiple clips being moved (for overlap warning)
  const tracksWithMovedClips = new Map<number, number>(); // trackIndex -> count

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

  return unwrapSingleResult(updatedClips) as ClipResult | ClipResult[];
}
