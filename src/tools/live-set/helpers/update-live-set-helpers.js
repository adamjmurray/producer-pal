import { VALID_PITCH_CLASS_NAMES } from "../../../notation/pitch-class-name-to-number.js";
import { VALID_SCALE_NAMES } from "../../constants.js";
import { createAudioClipInSession } from "../../shared/arrangement/arrangement-tiling.js";

// Create lowercase versions for case-insensitive comparison
const VALID_PITCH_CLASS_NAMES_LOWERCASE = VALID_PITCH_CLASS_NAMES.map((name) =>
  name.toLowerCase(),
);
const VALID_SCALE_NAMES_LOWERCASE = VALID_SCALE_NAMES.map((name) =>
  name.toLowerCase(),
);

/**
 * Extends the song length by creating a temporary clip if needed.
 * Required when creating locators past the current song_length.
 * @param {LiveAPI} liveSet - The live_set LiveAPI object
 * @param {number} targetBeats - Target position in beats
 * @param {object} context - Context object with silenceWavPath
 * @returns {object|null} Cleanup info or null if no extension needed
 */
export function extendSongIfNeeded(liveSet, targetBeats, context) {
  const songLength = liveSet.get("song_length")[0];

  if (targetBeats <= songLength) {
    return null; // No extension needed
  }

  // Find first track (prefer MIDI, fallback to audio)
  const trackIds = liveSet.getChildIds("tracks");
  let selectedTrack = null;
  let isMidiTrack = false;

  for (const trackId of trackIds) {
    const track = LiveAPI.from(trackId);

    if (track.getProperty("has_midi_input") > 0) {
      selectedTrack = track;
      isMidiTrack = true;
      break;
    }

    // Keep first audio track as fallback
    if (!selectedTrack) {
      selectedTrack = track;
    }
  }

  if (!selectedTrack) {
    throw new Error(
      `Cannot create locator past song end: no tracks available to extend song`,
    );
  }

  if (isMidiTrack) {
    // Create temp MIDI clip in arrangement (1 beat minimum)
    const tempClipResult = selectedTrack.call(
      "create_midi_clip",
      targetBeats,
      1,
    );
    const tempClip = LiveAPI.from(tempClipResult);

    return { track: selectedTrack, clipId: tempClip.id, isMidiTrack: true };
  }

  // Audio track - need to create in session then duplicate to arrangement
  if (!context.silenceWavPath) {
    throw new Error(
      `Cannot create locator past song end: no MIDI tracks and silenceWavPath not available`,
    );
  }

  const { clip: sessionClip, slot } = createAudioClipInSession(
    selectedTrack,
    1, // 1 beat length
    context.silenceWavPath,
  );

  const arrangementClipResult = selectedTrack.call(
    "duplicate_clip_to_arrangement",
    `id ${sessionClip.id}`,
    targetBeats,
  );
  const arrangementClip = LiveAPI.from(arrangementClipResult);

  return {
    track: selectedTrack,
    clipId: arrangementClip.id,
    isMidiTrack: false,
    slot,
  };
}

/**
 * Cleans up the temporary clip created by extendSongIfNeeded.
 * @param {object|null} tempClipInfo - Info from extendSongIfNeeded or null
 */
export function cleanupTempClip(tempClipInfo) {
  if (!tempClipInfo) {
    return;
  }

  const { track, clipId, isMidiTrack, slot } = tempClipInfo;

  // Delete the arrangement clip
  track.call("delete_clip", `id ${clipId}`);

  // For audio clips, also delete the session clip
  if (!isMidiTrack && slot) {
    slot.call("delete_clip");
  }
}

/**
 * Parses a combined scale string like "C Major" into root note and scale name
 * @param {string} scaleString - Scale in format "Root ScaleName"
 * @returns {{scaleRoot: string, scaleName: string}} Parsed components
 */
export function parseScale(scaleString) {
  const trimmed = scaleString.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length < 2) {
    throw new Error(
      `Scale must be in format 'Root ScaleName' (e.g., 'C Major'), got: ${scaleString}`,
    );
  }

  const [scaleRoot, ...scaleNameParts] = parts;
  const scaleName = scaleNameParts.join(" ");
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

  return {
    scaleRoot: VALID_PITCH_CLASS_NAMES[scaleRootIndex],
    scaleName: VALID_SCALE_NAMES[scaleNameIndex],
  };
}
