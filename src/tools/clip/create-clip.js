import { interpretNotation } from "../../notation/barbeat/barbeat-interpreter.js";
import { timeSigToAbletonBeatsPerBar } from "../../notation/barbeat/barbeat-time.js";
import { applyModulations } from "../../notation/modulation/modulation-evaluator.js";
import { select } from "../control/select.js";
import { parseTimeSignature } from "../shared/utils.js";
import {
  buildClipName,
  convertTimingParameters,
  processClipIteration,
} from "./create-clip-helpers.js";

/**
 * Validates createClip parameters
 * @param {string} view - View type (session or arrangement)
 * @param {number} trackIndex - Track index
 * @param {number} sceneIndex - Scene index for session view
 * @param {string} arrangementStart - Arrangement start for arrangement view
 * @param {number} count - Number of clips to create
 */
function validateCreateClipParams(
  view,
  trackIndex,
  sceneIndex,
  arrangementStart,
  count,
) {
  if (!view) {
    throw new Error("createClip failed: view parameter is required");
  }

  if (trackIndex == null) {
    throw new Error("createClip failed: trackIndex is required");
  }

  if (view === "session" && sceneIndex == null) {
    throw new Error(
      "createClip failed: sceneIndex is required when view is 'Session'",
    );
  }

  if (view === "arrangement" && arrangementStart == null) {
    throw new Error(
      "createClip failed: arrangementStart is required when view is 'Arrangement'",
    );
  }

  if (count < 1) {
    throw new Error("createClip failed: count must be at least 1");
  }
}

/**
 * Calculates the clip length based on notes and parameters
 * @param {number} endBeats - End position in beats
 * @param {Array} notes - Array of MIDI notes
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number} - Calculated clip length in beats
 */
function calculateClipLength(
  endBeats,
  notes,
  timeSigNumerator,
  timeSigDenominator,
) {
  if (endBeats != null) {
    // Use calculated end position
    return endBeats;
  } else if (notes.length > 0) {
    // Find the latest note start time (not end time)
    const lastNoteStartTimeAbletonBeats = Math.max(
      ...notes.map((note) => note.start_time),
    );

    // Calculate Ableton beats per bar for this time signature
    const abletonBeatsPerBar = timeSigToAbletonBeatsPerBar(
      timeSigNumerator,
      timeSigDenominator,
    );

    // Round up to the next full bar, ensuring at least 1 bar
    // Add a small epsilon to handle the case where note starts exactly at bar boundary
    return (
      Math.ceil((lastNoteStartTimeAbletonBeats + 0.0001) / abletonBeatsPerBar) *
      abletonBeatsPerBar
    );
  }
  // Empty clip, use 1 bar minimum
  const abletonBeatsPerBar = timeSigToAbletonBeatsPerBar(
    timeSigNumerator,
    timeSigDenominator,
  );
  return abletonBeatsPerBar;
}

/**
 * Handles automatic playback for session clips
 * @param {string} auto - Auto playback mode (play-scene or play-clip)
 * @param {string} view - View type
 * @param {number} sceneIndex - Scene index
 * @param {number} count - Number of clips
 * @param {number} trackIndex - Track index
 */
function handleAutoPlayback(auto, view, sceneIndex, count, trackIndex) {
  if (!auto || view !== "session") {
    return;
  }

  switch (auto) {
    case "play-scene": {
      // Launch the entire scene for synchronization
      const scene = new LiveAPI(`live_set scenes ${sceneIndex}`);
      if (!scene.exists()) {
        throw new Error(
          `createClip auto="play-scene" failed: scene at sceneIndex=${sceneIndex} does not exist`,
        );
      }
      scene.call("fire");
      break;
    }

    case "play-clip":
      // Fire individual clips (original autoplay behavior)
      for (let i = 0; i < count; i++) {
        const currentSceneIndex = sceneIndex + i;
        const clipSlot = new LiveAPI(
          `live_set tracks ${trackIndex} clip_slots ${currentSceneIndex}`,
        );
        clipSlot.call("fire");
      }
      break;

    default:
      throw new Error(
        `createClip failed: unknown auto value "${auto}". Expected "play-scene" or "play-clip"`,
      );
  }
}

/**
 * Creates MIDI clips in Session or Arrangement view
 * @param {object} args - The clip parameters
 * @param {string} args.view - View for the clip ('Session' or 'Arrangement')
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {number} [args.sceneIndex] - The scene/clip slot index (0-based), required for Session view
 * @param {string} [args.arrangementStart] - Start time in bar|beat format for Arrangement view clips (uses song time signature)
 * @param {number} [args.count=1] - Number of clips to create
 * @param {string} [args.notes] - Musical notation string
 * @param {string} [args.modulations] - Modulation expressions (parameter: expression per line)
 * @param {string} [args.name] - Base name for the clips
 * @param {string} [args.color] - Color in #RRGGBB hex format
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.start] - Bar|beat position where loop/clip region begins
 * @param {string} [args.length] - Clip length in bar:beat duration format (e.g., '4:0' = 4 bars). end = start + length
 * @param {string} [args.firstStart] - Bar|beat position for initial playback start (only needed when different from start)
 * @param {boolean} [args.looping] - Enable looping for the clip
 * @param {string} [args.auto] - Automatic playback action: "play-scene" (launch entire scene) or "play-clip" (play individual clips). Session only. Puts tracks into non-following state.
 * @param {boolean} [args.switchView=false] - Automatically switch to the appropriate view based on the clip view parameter
 * @param {object} _context - Internal context object (unused)
 * @returns {object | Array<object>} Single clip object when count=1, array when count>1
 */
export function createClip(
  {
    view,
    trackIndex,
    sceneIndex = null,
    arrangementStart = null,
    count = 1,
    notes: notationString = null,
    modulations: modulationString = null,
    name = null,
    color = null,
    timeSignature = null,
    start = null,
    length = null,
    firstStart = null,
    looping = null,
    auto = null,
    switchView,
  } = {},
  _context = {},
) {
  // Validate parameters
  validateCreateClipParams(
    view,
    trackIndex,
    sceneIndex,
    arrangementStart,
    count,
  );

  const liveSet = new LiveAPI("live_set");

  // Get song time signature for arrangementStart conversion
  const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
  const songTimeSigDenominator = liveSet.getProperty("signature_denominator");

  // Determine clip time signature
  let timeSigNumerator, timeSigDenominator;
  if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);
    timeSigNumerator = parsed.numerator;
    timeSigDenominator = parsed.denominator;
  } else {
    // Use song time signature as default for clips
    timeSigNumerator = songTimeSigNumerator;
    timeSigDenominator = songTimeSigDenominator;
  }

  // Convert timing parameters to Ableton beats
  const { arrangementStartBeats, startBeats, firstStartBeats, endBeats } =
    convertTimingParameters(
      arrangementStart,
      start,
      firstStart,
      length,
      looping,
      timeSigNumerator,
      timeSigDenominator,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );

  // Parse notation into notes
  const notes =
    notationString != null
      ? interpretNotation(notationString, {
          timeSigNumerator,
          timeSigDenominator,
        })
      : [];

  // Apply modulations to notes if provided
  applyModulations(
    notes,
    modulationString,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Determine clip length - assume clips start at 1.1 (beat 0)
  const clipLength = calculateClipLength(
    endBeats,
    notes,
    timeSigNumerator,
    timeSigDenominator,
  );

  const createdClips = [];

  for (let i = 0; i < count; i++) {
    const clipName = buildClipName(name, count, i);

    const clipResult = processClipIteration(
      i,
      view,
      trackIndex,
      sceneIndex,
      arrangementStartBeats,
      clipLength,
      liveSet,
      startBeats,
      endBeats,
      firstStartBeats,
      looping,
      clipName,
      color,
      timeSigNumerator,
      timeSigDenominator,
      notationString,
      notes,
      songTimeSigNumerator,
      songTimeSigDenominator,
      arrangementStart,
      length,
    );
    createdClips.push(clipResult);
  }

  // Handle automatic playback for Session clips
  handleAutoPlayback(auto, view, sceneIndex, count, trackIndex);

  // Handle view switching if requested
  if (switchView) {
    select({ view });
  }

  // Return single object if count=1, array if count>1
  return count === 1 ? createdClips[0] : createdClips;
}
