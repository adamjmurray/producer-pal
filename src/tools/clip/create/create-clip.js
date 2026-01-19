import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.js";
import {
  barBeatToAbletonBeats,
  timeSigToAbletonBeatsPerBar,
} from "#src/notation/barbeat/time/barbeat-time.js";
import { applyModulations } from "#src/notation/modulation/modulation-evaluator.js";
import { errorMessage } from "#src/shared/error-utils.js";
import * as console from "#src/shared/v8-max-console.js";
import { select } from "#src/tools/control/select.js";
import {
  parseTimeSignature,
  unwrapSingleResult,
} from "#src/tools/shared/utils.js";
import {
  buildClipName,
  convertTimingParameters,
  parseArrangementStartList,
  parseSceneIndexList,
  processClipIteration,
} from "./helpers/create-clip-helpers.js";

/**
 * @typedef {object} CreateClipArgs
 * @property {string} view - View for the clip ('Session' or 'Arrangement')
 * @property {number} trackIndex - Track index (0-based)
 * @property {string | null} [sceneIndex] - Scene index(es), comma-separated for multiple
 * @property {string | null} [arrangementStart] - Bar|beat position(s), comma-separated
 * @property {string | null} [notes] - Musical notation string (MIDI clips only)
 * @property {string | null} [modulations] - Modulation expressions
 * @property {string | null} [sampleFile] - Absolute path to audio file (audio clips only)
 * @property {string | null} [name] - Base name for the clips
 * @property {string | null} [color] - Color in #RRGGBB hex format
 * @property {string | null} [timeSignature] - Time signature in format "4/4"
 * @property {string | null} [start] - Bar|beat position where loop/clip region begins
 * @property {string | null} [length] - Clip length in bar:beat duration format
 * @property {string | null} [firstStart] - Bar|beat position for initial playback start
 * @property {boolean | null} [looping] - Enable looping for the clip
 * @property {string | null} [auto] - Automatic playback action
 * @property {boolean} [switchView] - Automatically switch to the appropriate view
 */

/**
 * Creates MIDI or audio clips in Session or Arrangement view
 * @param {CreateClipArgs} args - The clip parameters
 * @param {Partial<ToolContext>} [_context] - Internal context object (unused)
 * @returns {object | Array<object>} Single clip object when one position, array when multiple positions
 */
export function createClip(
  {
    view,
    trackIndex,
    sceneIndex = null,
    arrangementStart = null,
    notes: notationString = null,
    modulations: modulationString = null,
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
  },
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

  // Validate track exists (fatal - affects all clips)
  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

  if (!track.exists()) {
    throw new Error(`createClip failed: track ${trackIndex} does not exist`);
  }

  const liveSet = LiveAPI.from("live_set");

  // Get song time signature for arrangementStart conversion
  const songTimeSigNumerator = /** @type {number} */ (
    liveSet.getProperty("signature_numerator")
  );
  const songTimeSigDenominator = /** @type {number} */ (
    liveSet.getProperty("signature_denominator")
  );

  // Determine clip time signature (custom or from song)
  let timeSigNumerator, timeSigDenominator;

  if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);

    timeSigNumerator = parsed.numerator;
    timeSigDenominator = parsed.denominator;
  } else {
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
    modulationString,
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

  return /** @type {object | Array<object>} */ (
    unwrapSingleResult(createdClips)
  );
}

/**
 * Creates clips by iterating over positions
 * @param {string} view - View type
 * @param {number} trackIndex - Track index
 * @param {number[]} sceneIndices - Array of scene indices (session view)
 * @param {string[]} arrangementStarts - Array of bar|beat positions (arrangement view)
 * @param {string | null} name - Base clip name
 * @param {number} initialClipLength - Initial clip length
 * @param {LiveAPI} liveSet - LiveAPI liveSet object
 * @param {number | null} startBeats - Loop start in beats
 * @param {number | null} endBeats - Loop end in beats
 * @param {number | null} firstStartBeats - First playback start in beats
 * @param {boolean | null} looping - Whether the clip is looping
 * @param {string | null} color - Clip color
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @param {string | null} notationString - Original notation string
 * @param {Array<MidiNote>} notes - Array of MIDI notes
 * @param {number} songTimeSigNumerator - Song time signature numerator
 * @param {number} songTimeSigDenominator - Song time signature denominator
 * @param {string | null} length - Original length parameter
 * @param {string | null} sampleFile - Audio file path
 * @returns {Array<object>} - Array of created clips
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
  const clipLength = initialClipLength;

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

    try {
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
    } catch (error) {
      // Emit warning with position info
      const position =
        view === "session"
          ? `trackIndex=${trackIndex}, sceneIndex=${currentSceneIndex}`
          : `trackIndex=${trackIndex}, arrangementStart=${currentArrangementStart}`;

      console.error(
        `Warning: Failed to create clip at ${position}: ${errorMessage(error)}`,
      );
    }
  }

  return createdClips;
}

/**
 * @typedef {object} MidiNote
 * @property {number} pitch
 * @property {number} start_time
 * @property {number} duration
 * @property {number} velocity
 */

/**
 * @typedef {object} PreparedClipData
 * @property {Array<MidiNote>} notes
 * @property {number} clipLength
 */

/**
 * Prepares clip data (notes and initial length) based on clip type
 * @param {string | null} sampleFile - Audio file path (if audio clip)
 * @param {string | null} notationString - MIDI notation string (if MIDI clip)
 * @param {string | null} modulationString - Modulation expressions to apply to notes
 * @param {number | null} endBeats - End position in beats
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {PreparedClipData} - Object with notes array and clipLength
 */
function prepareClipData(
  sampleFile,
  notationString,
  modulationString,
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

  // Apply modulations to notes if provided
  applyModulations(
    notes,
    modulationString ?? undefined,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Determine clip length
  let clipLength;

  if (sampleFile) {
    // Audio clips get length from the sample file, not this value
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
 * @param {string | null} notes - MIDI notes notation string
 * @param {string | null} sampleFile - Audio file path
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
 * @param {number | null} endBeats - End position in beats
 * @param {Array<MidiNote>} notes - Array of MIDI notes
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
  return timeSigToAbletonBeatsPerBar(timeSigNumerator, timeSigDenominator);
}

/**
 * Handles automatic playback for session clips
 * @param {string | null} auto - Auto playback mode (play-scene or play-clip)
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
      const scene = LiveAPI.from(`live_set scenes ${firstSceneIndex}`);

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
        const clipSlot = LiveAPI.from(
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
