import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.js";
import {
  barBeatToAbletonBeats,
  timeSigToAbletonBeatsPerBar,
} from "#src/notation/barbeat/time/barbeat-time.js";
import { select } from "#src/tools/control/select.js";
import { parseTimeSignature } from "#src/tools/shared/utils.js";
import {
  buildClipName,
  convertTimingParameters,
  parseArrangementStartList,
  parseSceneIndexList,
  processClipIteration,
} from "./helpers/create-clip-helpers.js";

/**
 * Creates MIDI or audio clips in Session or Arrangement view
 * @param {object} args - The clip parameters
 * @param {string} args.view - View for the clip ('Session' or 'Arrangement')
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {string} [args.sceneIndex] - Scene index(es), comma-separated for multiple (e.g., '0' or '0,2,5')
 * @param {string} [args.arrangementStart] - Bar|beat position(s), comma-separated for multiple (e.g., '1|1' or '1|1,2|1,3|3')
 * @param {string} [args.notes] - Musical notation string (MIDI clips only)
 * @param {string} [args.sampleFile] - Absolute path to audio file (audio clips only)
 * @param {string} [args.name] - Base name for the clips
 * @param {string} [args.color] - Color in #RRGGBB hex format
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.start] - Bar|beat position where loop/clip region begins
 * @param {string} [args.length] - Clip length in bar:beat duration format (e.g., '4:0' = 4 bars). end = start + length
 * @param {string} [args.firstStart] - Bar|beat position for initial playback start (only needed when different from start)
 * @param {boolean} [args.looping] - Enable looping for the clip
 * @param {string} [args.auto] - Automatic playback action: "play-scene" (launch entire scene) or "play-clip" (play individual clips). Session only.
 * @param {boolean} [args.switchView=false] - Automatically switch to the appropriate view based on the clip view parameter
 * @param {object} _context - Internal context object (unused)
 * @returns {object | Array<object>} Single clip object when one position, array when multiple positions
 */
export function createClip(
  {
    view,
    trackIndex,
    sceneIndex = null,
    arrangementStart = null,
    notes: notationString = null,
    sampleFile = null,
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
  // Parse position lists
  const sceneIndices = parseSceneIndexList(sceneIndex);
  const arrangementStarts = parseArrangementStartList(arrangementStart);

  // Validate parameters
  validateCreateClipParams(
    view,
    trackIndex,
    sceneIndices,
    arrangementStarts,
    notationString,
    sampleFile,
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

  // Convert timing parameters to Ableton beats (excluding arrangementStart, done per-position)
  const { startBeats, firstStartBeats, endBeats } = convertTimingParameters(
    null, // arrangementStart converted per-position
    start,
    firstStart,
    length,
    looping,
    timeSigNumerator,
    timeSigDenominator,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  // Parse notation and determine clip length
  const { notes, clipLength: initialClipLength } = prepareClipData(
    sampleFile,
    notationString,
    endBeats,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Create clips
  const createdClips = createClips(
    view,
    trackIndex,
    sceneIndices,
    arrangementStarts,
    name,
    initialClipLength,
    liveSet,
    startBeats,
    endBeats,
    firstStartBeats,
    looping,
    color,
    timeSigNumerator,
    timeSigDenominator,
    notationString,
    notes,
    songTimeSigNumerator,
    songTimeSigDenominator,
    length,
    sampleFile,
  );

  // Handle automatic playback and view switching
  handleAutoPlayback(auto, view, sceneIndices, trackIndex);
  if (switchView) {
    select({ view });
  }

  // Return single object if one position, array if multiple
  return createdClips.length === 1 ? createdClips[0] : createdClips;
}

/**
 * Creates clips by iterating over positions
 * @param {string} view - View type
 * @param {number} trackIndex - Track index
 * @param {number[]} sceneIndices - Array of scene indices (session view)
 * @param {string[]} arrangementStarts - Array of bar|beat positions (arrangement view)
 * @param {string} name - Base clip name
 * @param {number} initialClipLength - Initial clip length
 * @param {LiveAPI} liveSet - LiveAPI liveSet object
 * @param {number} startBeats - Loop start in beats
 * @param {number} endBeats - Loop end in beats
 * @param {number} firstStartBeats - First playback start in beats
 * @param {boolean} looping - Whether the clip is looping
 * @param {string} color - Clip color
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @param {string} notationString - Original notation string
 * @param {Array} notes - Array of MIDI notes
 * @param {number} songTimeSigNumerator - Song time signature numerator
 * @param {number} songTimeSigDenominator - Song time signature denominator
 * @param {string} length - Original length parameter
 * @param {string} sampleFile - Audio file path
 * @returns {Array} - Array of created clips
 */
function createClips(
  view,
  trackIndex,
  sceneIndices,
  arrangementStarts,
  name,
  initialClipLength,
  liveSet,
  startBeats,
  endBeats,
  firstStartBeats,
  looping,
  color,
  timeSigNumerator,
  timeSigDenominator,
  notationString,
  notes,
  songTimeSigNumerator,
  songTimeSigDenominator,
  length,
  sampleFile,
) {
  const createdClips = [];
  const positions = view === "session" ? sceneIndices : arrangementStarts;
  const count = positions.length;
  let clipLength = initialClipLength;

  for (let i = 0; i < count; i++) {
    const clipName = buildClipName(name, count, i);

    // Get position for this iteration
    let currentSceneIndex = null;
    let currentArrangementStartBeats = null;
    let currentArrangementStart = null;

    if (view === "session") {
      currentSceneIndex = sceneIndices[i];
    } else {
      currentArrangementStart = arrangementStarts[i];
      currentArrangementStartBeats = barBeatToAbletonBeats(
        currentArrangementStart,
        songTimeSigNumerator,
        songTimeSigDenominator,
      );
    }

    const clipResult = processClipIteration(
      view,
      trackIndex,
      currentSceneIndex,
      currentArrangementStartBeats,
      currentArrangementStart,
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
      length,
      sampleFile,
    );
    createdClips.push(clipResult);

    // For audio clips with multiple positions, get actual length from first clip
    if (sampleFile && count > 1 && i === 0) {
      const firstClip = new LiveAPI(clipResult.id);
      clipLength = firstClip.getProperty("length");
    }
  }

  return createdClips;
}

/**
 * Prepares clip data (notes and initial length) based on clip type
 * @param {string} sampleFile - Audio file path (if audio clip)
 * @param {string} notationString - MIDI notation string (if MIDI clip)
 * @param {number} endBeats - End position in beats
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {object} - Object with notes array and clipLength
 */
function prepareClipData(
  sampleFile,
  notationString,
  endBeats,
  timeSigNumerator,
  timeSigDenominator,
) {
  // Parse notation into notes (MIDI clips only)
  const notes =
    notationString != null
      ? interpretNotation(notationString, {
          timeSigNumerator,
          timeSigDenominator,
        })
      : [];

  // Determine clip length
  let clipLength;
  if (sampleFile) {
    // For audio clips, we'll get the length from the first created clip
    // Use 1 as a placeholder for now
    clipLength = 1;
  } else {
    // MIDI clips: calculate based on notes and parameters
    clipLength = calculateClipLength(
      endBeats,
      notes,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  return { notes, clipLength };
}

/**
 * Validates createClip parameters
 * @param {string} view - View type (session or arrangement)
 * @param {number} trackIndex - Track index
 * @param {number[]} sceneIndices - Parsed scene indices for session view
 * @param {string[]} arrangementStarts - Parsed arrangement starts for arrangement view
 * @param {string} notes - MIDI notes notation string
 * @param {string} sampleFile - Audio file path
 */
function validateCreateClipParams(
  view,
  trackIndex,
  sceneIndices,
  arrangementStarts,
  notes,
  sampleFile,
) {
  if (!view) {
    throw new Error("createClip failed: view parameter is required");
  }

  if (trackIndex == null) {
    throw new Error("createClip failed: trackIndex is required");
  }

  if (view === "session" && sceneIndices.length === 0) {
    throw new Error(
      "createClip failed: sceneIndex is required when view is 'session'",
    );
  }

  if (view === "arrangement" && arrangementStarts.length === 0) {
    throw new Error(
      "createClip failed: arrangementStart is required when view is 'arrangement'",
    );
  }

  // Cannot specify both sampleFile and notes
  if (sampleFile && notes) {
    throw new Error(
      "createClip failed: cannot specify both sampleFile and notes - audio clips cannot contain MIDI notes",
    );
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
 * @param {number[]} sceneIndices - Array of scene indices
 * @param {number} trackIndex - Track index
 */
function handleAutoPlayback(auto, view, sceneIndices, trackIndex) {
  if (!auto || view !== "session" || sceneIndices.length === 0) {
    return;
  }

  switch (auto) {
    case "play-scene": {
      // Launch the first scene for synchronization
      const firstSceneIndex = sceneIndices[0];
      const scene = new LiveAPI(`live_set scenes ${firstSceneIndex}`);
      if (!scene.exists()) {
        throw new Error(
          `createClip auto="play-scene" failed: scene at sceneIndex=${firstSceneIndex} does not exist`,
        );
      }
      scene.call("fire");
      break;
    }

    case "play-clip":
      // Fire individual clips at each scene index
      for (const sceneIndex of sceneIndices) {
        const clipSlot = new LiveAPI(
          `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
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
