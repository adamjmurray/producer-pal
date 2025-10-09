import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
  barBeatToBeats,
  beatsToBarBeat,
} from "../../notation/barbeat/barbeat-time";
import { interpretNotation } from "../../notation/notation";
import { MAX_AUTO_CREATED_SCENES } from "../constants.js";
import { select } from "../control/select.js";
import { parseTimeSignature, setAllNonNull } from "../shared/utils.js";

/**
 * Creates MIDI clips in Session or Arrangement view
 * @param {Object} args - The clip parameters
 * @param {string} args.view - View for the clip ('Session' or 'Arrangement')
 * @param {number} args.trackIndex - Track index (0-based)
 * @param {number} [args.sceneIndex] - The scene/clip slot index (0-based), required for Session view
 * @param {string} [args.arrangementStartTime] - Start time in bar|beat format for Arrangement view clips (uses song time signature)
 * @param {number} [args.count=1] - Number of clips to create
 * @param {string} [args.notes] - Musical notation string
 * @param {string} [args.name] - Base name for the clips
 * @param {string} [args.color] - Color in #RRGGBB hex format
 * @param {string} [args.timeSignature] - Time signature in format "4/4"
 * @param {string} [args.startMarker] - Start marker position in bar|beat format relative to clip start
 * @param {string} [args.length] - Clip length in bar:beat duration format (e.g., '4:0' = 4 bars)
 * @param {string} [args.loopStart] - Loop start position in bar|beat format relative to clip start
 * @param {boolean} [args.loop] - Enable looping for the clip
 * @param {string} [args.auto] - Automatic playback action: "play-scene" (launch entire scene) or "play-clip" (play individual clips). Session only. Puts tracks into non-following state.
 * @param {boolean} [args.switchView=false] - Automatically switch to the appropriate view based on the clip view parameter
 * @returns {Object|Array<Object>} Single clip object when count=1, array when count>1
 */
export function createClip({
  view,
  trackIndex,
  sceneIndex = null,
  arrangementStartTime = null,
  count = 1,
  notes: notationString = null,
  name = null,
  color = null,
  timeSignature = null,
  startMarker = null,
  length = null,
  loop = null,
  loopStart = null,
  auto = null,
  switchView,
}) {
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

  if (view === "arrangement" && arrangementStartTime == null) {
    throw new Error(
      "createClip failed: arrangementStartTime is required when view is 'Arrangement'",
    );
  }

  if (count < 1) {
    throw new Error("createClip failed: count must be at least 1");
  }

  const liveSet = new LiveAPI("live_set");
  let timeSigNumerator, timeSigDenominator;
  let songTimeSigNumerator, songTimeSigDenominator;

  // Get song time signature for arrangementStartTime conversion
  songTimeSigNumerator = liveSet.getProperty("signature_numerator");
  songTimeSigDenominator = liveSet.getProperty("signature_denominator");

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
  const arrangementStartTimeBeats = barBeatToAbletonBeats(
    arrangementStartTime,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );
  const startMarkerBeats = barBeatToAbletonBeats(
    startMarker,
    timeSigNumerator,
    timeSigDenominator,
  );
  const loopStartBeats = barBeatToAbletonBeats(
    loopStart,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Convert length parameter to endMarker and loopEnd
  let endMarkerBeats = null;
  let loopEndBeats = null;
  if (length != null) {
    const lengthBeats = barBeatDurationToAbletonBeats(
      length,
      timeSigNumerator,
      timeSigDenominator,
    );
    const startOffsetBeats = startMarkerBeats || 0;
    endMarkerBeats = startOffsetBeats + lengthBeats;
    loopEndBeats = startOffsetBeats + lengthBeats;
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
  if (loop && loopEndBeats != null) {
    // For looping clips, use loopEnd
    clipLength = loopEndBeats;
  } else if (endMarkerBeats != null) {
    // For non-looping clips, use endMarker
    clipLength = endMarkerBeats;
  } else if (notes.length > 0) {
    // const lastNoteEndTime = Math.max(...notes.map((note) => note.start_time + note.duration));
    // clipLength = Math.ceil(lastNoteEndTime);

    const lastNoteEndTimeAbletonBeats = Math.max(
      ...notes.map((note) => note.start_time + note.duration),
    );

    // Convert back to musical beats to round up conceptually
    const lastNoteEndTimeMusicalBeats =
      timeSigDenominator != null
        ? lastNoteEndTimeAbletonBeats * (timeSigDenominator / 4)
        : lastNoteEndTimeAbletonBeats;

    // Round up to whole musical beats
    const clipLengthMusicalBeats = Math.ceil(lastNoteEndTimeMusicalBeats);

    // Convert back to Ableton beats for the Live API
    clipLength =
      timeSigDenominator != null
        ? clipLengthMusicalBeats * (4 / timeSigDenominator)
        : clipLengthMusicalBeats;
  } else {
    // Empty clip, use 1 beat minimum
    clipLength = 1;
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
    let currentSceneIndex, currentArrangementStartTimeBeats;

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
      currentArrangementStartTimeBeats =
        arrangementStartTimeBeats + i * clipLength;

      const track = new LiveAPI(`live_set tracks ${trackIndex}`);
      if (!track.exists()) {
        throw new Error(
          `createClip failed: track with index ${trackIndex} does not exist`,
        );
      }

      const newClipResult = track.call(
        "create_midi_clip",
        currentArrangementStartTimeBeats,
        clipLength,
      );
      clip = LiveAPI.from(newClipResult);
      if (!clip.exists()) {
        throw new Error("createClip failed: failed to create Arrangement clip");
      }
    }

    clip.setAll({
      name: clipName,
      color: color,
      signature_numerator: timeSigNumerator,
      signature_denominator: timeSigDenominator,
      start_marker: startMarkerBeats,
      end_marker: endMarkerBeats,
      loop_start: loopStartBeats,
      loop_end: loopEndBeats,
      looping: loop,
    });

    // Filter out v0 notes for Live API (Live API can't handle velocity 0)
    const validNotes = notes.filter((note) => note.velocity > 0);
    if (validNotes.length > 0) {
      clip.call("add_new_notes", { notes: validNotes });
    }

    // Build optimistic result object
    const clipResult = {
      id: clip.id,
      type: "midi",
      view,
      trackIndex,
    };

    // Add view-specific properties
    if (view === "session") {
      clipResult.sceneIndex = currentSceneIndex;
    } else {
      // Calculate bar|beat position for this clip
      if (i === 0) {
        clipResult.arrangementStartTime = arrangementStartTime;
      } else {
        // Convert clipLength back to bar|beat format and add to original position
        const clipLengthInMusicalBeats =
          clipLength * (songTimeSigDenominator / 4);
        const totalOffsetBeats = i * clipLengthInMusicalBeats;
        const originalBeats = barBeatToBeats(
          arrangementStartTime,
          songTimeSigNumerator,
        );
        const newPositionBeats = originalBeats + totalOffsetBeats;
        clipResult.arrangementStartTime = beatsToBarBeat(
          newPositionBeats,
          songTimeSigNumerator,
        );
      }
    }

    setAllNonNull(clipResult, {
      name: clipName,
      color,
      timeSignature:
        timeSigNumerator != null && timeSigDenominator != null
          ? `${timeSigNumerator}/${timeSigDenominator}`
          : null,
      startMarker,
      length,
      loopStart,
      loop,
      noteCount: notationString != null ? validNotes.length : null,
    });

    createdClips.push(clipResult);
  }

  // Handle automatic playback for Session clips
  if (auto && view === "session") {
    switch (auto) {
      case "play-scene":
        // Launch the entire scene for synchronization
        const scene = new LiveAPI(`live_set scenes ${sceneIndex}`);
        if (!scene.exists()) {
          throw new Error(
            `createClip auto="play-scene" failed: scene at sceneIndex=${sceneIndex} does not exist`,
          );
        }
        scene.call("fire");
        // Mark all created clips as triggered in optimistic results
        for (let i = 0; i < count; i++) {
          createdClips[i].triggered = true;
        }
        break;

      case "play-clip":
        // Fire individual clips (original autoplay behavior)
        for (let i = 0; i < count; i++) {
          const currentSceneIndex = sceneIndex + i;
          const clipSlot = new LiveAPI(
            `live_set tracks ${trackIndex} clip_slots ${currentSceneIndex}`,
          );
          clipSlot.call("fire");
          // Mark as triggered in optimistic results
          createdClips[i].triggered = true;
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
