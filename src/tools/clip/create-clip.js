import { interpretNotation } from "../../notation/barbeat/barbeat-interpreter.js";
import {
  abletonBeatsToBarBeatDuration,
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
  barBeatToBeats,
  beatsToBarBeat,
  timeSigToAbletonBeatsPerBar,
} from "../../notation/barbeat/barbeat-time";
import { MAX_AUTO_CREATED_SCENES } from "../constants.js";
import { select } from "../control/select.js";
import { parseTimeSignature } from "../shared/utils.js";

/**
 * Creates MIDI clips in Session or Arrangement view
 * @param {Object} args - The clip parameters
 * @param {string} args.view - View for the clip ('Session' or 'Arrangement')
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {number} [args.sceneIndex] - The scene/clip slot index (0-based), required for Session view
 * @param {string} [args.arrangementStart] - Start time in bar|beat format for Arrangement view clips (uses song time signature)
 * @param {number} [args.count=1] - Number of clips to create
 * @param {string} [args.notes] - Musical notation string
 * @param {string} [args.name] - Base name for the clips
 * @param {string} [args.color] - Color in #RRGGBB hex format
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.start] - Bar|beat position where loop/clip region begins
 * @param {string} [args.length] - Clip length in bar:beat duration format (e.g., '4:0' = 4 bars). end = start + length
 * @param {string} [args.firstStart] - Bar|beat position for initial playback start (only needed when different from start)
 * @param {boolean} [args.looping] - Enable looping for the clip
 * @param {string} [args.auto] - Automatic playback action: "play-scene" (launch entire scene) or "play-clip" (play individual clips). Session only. Puts tracks into non-following state.
 * @param {boolean} [args.switchView=false] - Automatically switch to the appropriate view based on the clip view parameter
 * @returns {Object|Array<Object>} Single clip object when count=1, array when count>1
 */
export function createClip(
  {
    view,
    trackIndex,
    sceneIndex = null,
    arrangementStart = null,
    count = 1,
    notes: notationString = null,
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

  const liveSet = new LiveAPI("live_set");
  let timeSigNumerator, timeSigDenominator;

  // Get song time signature for arrangementStart conversion
  const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
  const songTimeSigDenominator = liveSet.getProperty("signature_denominator");

  if (timeSignature != null) {
    const parsed = parseTimeSignature(timeSignature);
    timeSigNumerator = parsed.numerator;
    timeSigDenominator = parsed.denominator;
  } else {
    // Use song time signature as default for clips
    timeSigNumerator = songTimeSigNumerator;
    timeSigDenominator = songTimeSigDenominator;
  }

  // Convert bar|beat timing parameters to Ableton beats
  const arrangementStartBeats = barBeatToAbletonBeats(
    arrangementStart,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );
  const startBeats = barBeatToAbletonBeats(
    start,
    timeSigNumerator,
    timeSigDenominator,
  );
  const firstStartBeats = barBeatToAbletonBeats(
    firstStart,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Handle firstStart warning for non-looping clips
  if (firstStart != null && looping === false) {
    console.error(
      "Warning: firstStart parameter ignored for non-looping clips",
    );
  }

  // Convert length parameter to end position
  let endBeats = null;
  if (length != null) {
    const lengthBeats = barBeatDurationToAbletonBeats(
      length,
      timeSigNumerator,
      timeSigDenominator,
    );
    const startOffsetBeats = startBeats || 0;
    endBeats = startOffsetBeats + lengthBeats;
  }

  const notes =
    notationString != null
      ? interpretNotation(notationString, {
          timeSigNumerator,
          timeSigDenominator,
        })
      : [];

  // Determine clip length - assume clips start at 1.1 (beat 0)
  let clipLength;
  if (endBeats != null) {
    // Use calculated end position
    clipLength = endBeats;
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
    clipLength =
      Math.ceil((lastNoteStartTimeAbletonBeats + 0.0001) / abletonBeatsPerBar) *
      abletonBeatsPerBar;
  } else {
    // Empty clip, use 1 bar minimum
    const abletonBeatsPerBar = timeSigToAbletonBeatsPerBar(
      timeSigNumerator,
      timeSigDenominator,
    );
    clipLength = abletonBeatsPerBar;
  }

  const createdClips = [];

  for (let i = 0; i < count; i++) {
    // Build the clip name
    const clipName =
      name != null
        ? count === 1
          ? name
          : i === 0
            ? name
            : `${name} ${i + 1}`
        : undefined;

    let clip;
    let currentSceneIndex, currentArrangementStartBeats;

    if (view === "session") {
      currentSceneIndex = sceneIndex + i;

      // Auto-create scenes if needed
      if (currentSceneIndex >= MAX_AUTO_CREATED_SCENES) {
        throw new Error(
          `createClip failed: sceneIndex ${currentSceneIndex} exceeds the maximum allowed value of ${
            MAX_AUTO_CREATED_SCENES - 1
          }`,
        );
      }

      const currentSceneCount = liveSet.getChildIds("scenes").length;

      if (currentSceneIndex >= currentSceneCount) {
        const scenesToCreate = currentSceneIndex - currentSceneCount + 1;
        for (let j = 0; j < scenesToCreate; j++) {
          liveSet.call("create_scene", -1); // -1 means append at the end
        }
      }

      const clipSlot = new LiveAPI(
        `live_set tracks ${trackIndex} clip_slots ${currentSceneIndex}`,
      );
      if (clipSlot.getProperty("has_clip")) {
        throw new Error(
          `createClip failed: a clip already exists at track ${trackIndex}, clip slot ${currentSceneIndex}`,
        );
      }
      clipSlot.call("create_clip", clipLength);
      clip = new LiveAPI(`${clipSlot.path} clip`);
    } else {
      // Arrangement view
      currentArrangementStartBeats = arrangementStartBeats + i * clipLength;

      const track = new LiveAPI(`live_set tracks ${trackIndex}`);
      if (!track.exists()) {
        throw new Error(
          `createClip failed: track with index ${trackIndex} does not exist`,
        );
      }

      const newClipResult = track.call(
        "create_midi_clip",
        currentArrangementStartBeats,
        clipLength,
      );
      clip = LiveAPI.from(newClipResult);
      if (!clip.exists()) {
        throw new Error("createClip failed: failed to create Arrangement clip");
      }
    }

    // Determine start_marker value
    let startMarkerBeats = null;
    if (firstStartBeats != null && looping !== false) {
      // firstStart takes precedence for looping clips
      startMarkerBeats = firstStartBeats;
    } else if (startBeats != null) {
      // Use start as start_marker
      startMarkerBeats = startBeats;
    }

    // Set properties based on looping state
    const propsToSet = {
      name: clipName,
      color: color,
      signature_numerator: timeSigNumerator,
      signature_denominator: timeSigDenominator,
      start_marker: startMarkerBeats,
      looping: looping,
    };

    // Set loop properties for looping clips
    if (looping === true || looping == null) {
      if (startBeats != null) {
        propsToSet.loop_start = startBeats;
      }
      if (endBeats != null) {
        propsToSet.loop_end = endBeats;
      }
    }

    // Set end_marker for non-looping clips
    if (looping === false) {
      if (endBeats != null) {
        propsToSet.end_marker = endBeats;
      }
    }

    clip.setAll(propsToSet);

    // v0 notes already filtered by applyV0Deletions in interpretNotation
    if (notes.length > 0) {
      clip.call("add_new_notes", { notes });
    }

    // Build optimistic result object
    const clipResult = {
      id: clip.id,
      trackIndex,
    };

    // Add view-specific properties
    if (view === "session") {
      clipResult.sceneIndex = currentSceneIndex;
    } else if (i === 0) {
      // Calculate bar|beat position for this clip
      clipResult.arrangementStart = arrangementStart;
    } else {
      // Convert clipLength back to bar|beat format and add to original position
      const clipLengthInMusicalBeats =
        clipLength * (songTimeSigDenominator / 4);
      const totalOffsetBeats = i * clipLengthInMusicalBeats;
      const originalBeats = barBeatToBeats(
        arrangementStart,
        songTimeSigNumerator,
      );
      const newPositionBeats = originalBeats + totalOffsetBeats;
      clipResult.arrangementStart = beatsToBarBeat(
        newPositionBeats,
        songTimeSigNumerator,
      );
    }

    // Only include noteCount if notes were provided
    if (notationString != null) {
      clipResult.noteCount = notes.length;

      // Include calculated length if it wasn't provided as input parameter
      if (length == null) {
        clipResult.length = abletonBeatsToBarBeatDuration(
          clipLength,
          timeSigNumerator,
          timeSigDenominator,
        );
      }
    }

    createdClips.push(clipResult);
  }

  // Handle automatic playback for Session clips
  if (auto && view === "session") {
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

  // Handle view switching if requested
  if (switchView) {
    select({ view });
  }

  // Return single object if count=1, array if count>1
  return count === 1 ? createdClips[0] : createdClips;
}
