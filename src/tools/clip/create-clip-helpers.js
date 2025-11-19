import {
  abletonBeatsToBarBeatDuration,
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
  barBeatToBeats,
  beatsToBarBeat,
} from "../../notation/barbeat/barbeat-time.js";
import { MAX_AUTO_CREATED_SCENES } from "../constants.js";

export function buildClipName(name, count, i) {
  if (name == null) {
    return undefined;
  }

  if (count === 1) {
    return name;
  }

  if (i === 0) {
    return name;
  }

  return `${name} ${i + 1}`;
}

export function convertTimingParameters(
  arrangementStart,
  start,
  firstStart,
  length,
  looping,
  timeSigNumerator,
  timeSigDenominator,
  songTimeSigNumerator,
  songTimeSigDenominator,
) {
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

  return { arrangementStartBeats, startBeats, firstStartBeats, endBeats };
}

function createSessionClip(
  trackIndex,
  sceneIndex,
  clipLength,
  liveSet,
  i,
  maxAutoCreatedScenes,
) {
  const currentSceneIndex = sceneIndex + i;

  // Auto-create scenes if needed
  if (currentSceneIndex >= maxAutoCreatedScenes) {
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
  return {
    clip: new LiveAPI(`${clipSlot.path} clip`),
    sceneIndex: currentSceneIndex,
  };
}

function createArrangementClip(
  trackIndex,
  arrangementStartBeats,
  clipLength,
  i,
) {
  const currentArrangementStartBeats = arrangementStartBeats + i * clipLength;

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
  const clip = LiveAPI.from(newClipResult);
  if (!clip.exists()) {
    throw new Error("createClip failed: failed to create Arrangement clip");
  }

  return { clip, arrangementStartBeats: currentArrangementStartBeats };
}

function buildClipProperties(
  startBeats,
  endBeats,
  firstStartBeats,
  looping,
  clipName,
  color,
  timeSigNumerator,
  timeSigDenominator,
) {
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

  return propsToSet;
}

function buildClipResult(
  clip,
  trackIndex,
  view,
  sceneIndex,
  i,
  arrangementStart,
  songTimeSigNumerator,
  songTimeSigDenominator,
  clipLength,
  notationString,
  notes,
  length,
  timeSigNumerator,
  timeSigDenominator,
) {
  const clipResult = {
    id: clip.id,
    trackIndex,
  };

  // Add view-specific properties
  if (view === "session") {
    clipResult.sceneIndex = sceneIndex;
  } else if (i === 0) {
    // Calculate bar|beat position for this clip
    clipResult.arrangementStart = arrangementStart;
  } else {
    // Convert clipLength back to bar|beat format and add to original position
    const clipLengthInMusicalBeats = clipLength * (songTimeSigDenominator / 4);
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

  return clipResult;
}

export function processClipIteration(
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
) {
  let clip;
  let currentSceneIndex;

  if (view === "session") {
    const result = createSessionClip(
      trackIndex,
      sceneIndex,
      clipLength,
      liveSet,
      i,
      MAX_AUTO_CREATED_SCENES,
    );
    clip = result.clip;
    currentSceneIndex = result.sceneIndex;
  } else {
    // Arrangement view
    const result = createArrangementClip(
      trackIndex,
      arrangementStartBeats,
      clipLength,
      i,
    );
    clip = result.clip;
  }

  const propsToSet = buildClipProperties(
    startBeats,
    endBeats,
    firstStartBeats,
    looping,
    clipName,
    color,
    timeSigNumerator,
    timeSigDenominator,
  );

  clip.setAll(propsToSet);

  // v0 notes already filtered by applyV0Deletions in interpretNotation
  if (notes.length > 0) {
    clip.call("add_new_notes", { notes });
  }

  const clipResult = buildClipResult(
    clip,
    trackIndex,
    view,
    currentSceneIndex,
    i,
    arrangementStart,
    songTimeSigNumerator,
    songTimeSigDenominator,
    clipLength,
    notationString,
    notes,
    length,
    timeSigNumerator,
    timeSigDenominator,
  );

  return clipResult;
}
