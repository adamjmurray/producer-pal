import {
  abletonBeatsToBarBeat,
  barBeatDurationToAbletonBeats,
} from "../../notation/barbeat/time/barbeat-time.js";
import * as console from "../../shared/v8-max-console.js";
import { updateClip } from "../clip/update-clip.js";
import {
  createShortenedClipInHolding,
  moveClipFromHolding,
} from "../shared/arrangement/arrangement-tiling.js";

/**
 * Parse arrangementLength from bar:beat duration format to absolute beats
 * @param {string} arrangementLength - Length in bar:beat duration format (e.g. "2:0" for exactly two bars)
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number} Length in Ableton beats
 */
export function parseArrangementLength(
  arrangementLength,
  timeSigNumerator,
  timeSigDenominator,
) {
  try {
    const arrangementLengthBeats = barBeatDurationToAbletonBeats(
      arrangementLength,
      timeSigNumerator,
      timeSigDenominator,
    );

    if (arrangementLengthBeats <= 0) {
      throw new Error(
        `duplicate failed: arrangementLength must be positive, got "${arrangementLength}"`,
      );
    }

    return arrangementLengthBeats;
  } catch (error) {
    if (error.message.includes("Invalid bar:beat duration format")) {
      throw new Error(`duplicate failed: ${error.message}`);
    }
    if (error.message.includes("must be 0 or greater")) {
      throw new Error(
        `duplicate failed: arrangementLength ${error.message.replace("in duration ", "")}`,
      );
    }
    throw error;
  }
}

/**
 * Get minimal clip information for result objects
 * @param {LiveAPI} clip - The clip to get info from
 * @param {Array<string>} [omitFields] - Optional fields to omit from result
 * @returns {object} Minimal clip info object
 */
export function getMinimalClipInfo(clip, omitFields = []) {
  const isArrangementClip = clip.getProperty("is_arrangement_clip") > 0;

  if (isArrangementClip) {
    const trackIndex = clip.trackIndex;
    if (trackIndex == null) {
      throw new Error(
        `getMinimalClipInfo failed: could not determine trackIndex for clip (path="${clip.path}")`,
      );
    }

    const arrangementStartBeats = clip.getProperty("start_time");

    // Convert to bar|beat format using song time signature
    const liveSet = new LiveAPI("live_set");
    const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
    const songTimeSigDenominator = liveSet.getProperty("signature_denominator");
    const arrangementStart = abletonBeatsToBarBeat(
      arrangementStartBeats,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );

    const result = {
      id: clip.id,
    };

    if (!omitFields.includes("trackIndex")) {
      result.trackIndex = trackIndex;
    }
    if (!omitFields.includes("arrangementStart")) {
      result.arrangementStart = arrangementStart;
    }

    return result;
  }
  const trackIndex = clip.trackIndex;
  const sceneIndex = clip.sceneIndex;

  if (trackIndex == null || sceneIndex == null) {
    throw new Error(
      `getMinimalClipInfo failed: could not determine trackIndex/sceneIndex for clip (path="${clip.path}")`,
    );
  }

  const result = {
    id: clip.id,
  };

  if (!omitFields.includes("trackIndex")) {
    result.trackIndex = trackIndex;
  }
  if (!omitFields.includes("sceneIndex")) {
    result.sceneIndex = sceneIndex;
  }

  return result;
}

/**
 * Create clips to fill the specified arrangement length
 * @param {LiveAPI} sourceClip - The source clip to duplicate
 * @param {LiveAPI} track - The track to create clips on
 * @param {number} arrangementStartBeats - Start time in Ableton beats (quarter notes, 0-based)
 * @param {number} arrangementLengthBeats - Total length to fill in Ableton beats (quarter notes)
 * @param {string} [name] - Optional name for the clips
 * @param {Array<string>} [omitFields] - Optional fields to omit from clip info
 * @param {object} [context] - Context object with holdingAreaStartBeats and silenceWavPath
 * @returns {Array<object>} Array of minimal clip info objects
 */
export function createClipsForLength(
  sourceClip,
  track,
  arrangementStartBeats,
  arrangementLengthBeats,
  name,
  omitFields = [],
  context = {},
) {
  const sourceClipLength = sourceClip.getProperty("length");
  const isMidiClip = sourceClip.getProperty("is_midi_clip") === 1;
  const duplicatedClips = [];

  if (arrangementLengthBeats < sourceClipLength) {
    // Case 1: Shortening - use holding area approach
    // This preserves all clip data including envelopes and supports both MIDI and audio clips

    // Warn if silenceWavPath is missing for audio clips
    if (!isMidiClip && !context.silenceWavPath) {
      console.error(
        "Warning: silenceWavPath missing in context - audio clip shortening may fail",
      );
    }

    // Duplicate to holding area and shorten
    const { holdingClipId } = createShortenedClipInHolding(
      sourceClip,
      track,
      arrangementLengthBeats,
      context.holdingAreaStartBeats,
      isMidiClip,
      context,
    );

    // Move shortened clip to target position
    const newClip = moveClipFromHolding(
      holdingClipId,
      track,
      arrangementStartBeats,
    );

    // Set name if provided
    if (name != null) {
      newClip.set("name", name);
    }

    duplicatedClips.push(getMinimalClipInfo(newClip, omitFields));
  } else {
    // Case 2: Lengthening or exact length - delegate to update-clip
    // This handles all complex scenarios: looped/unlooped, MIDI/audio, hidden content, tiling, etc.

    // First, duplicate the clip to the target position
    const newClipResult = track.call(
      "duplicate_clip_to_arrangement",
      `id ${sourceClip.id}`,
      arrangementStartBeats,
    );
    const newClip = LiveAPI.from(newClipResult);
    const newClipId = newClip.id;

    // If lengthening is needed, use update-clip to handle it
    if (arrangementLengthBeats > sourceClipLength) {
      // Convert beats to bar:beat format using clip's time signature
      const clipTimeSigNumerator = sourceClip.getProperty(
        "signature_numerator",
      );
      const clipTimeSigDenominator = sourceClip.getProperty(
        "signature_denominator",
      );

      // Calculate bar:beat format for arrangementLength
      const bars = Math.floor(
        arrangementLengthBeats /
          (4 * (clipTimeSigNumerator / clipTimeSigDenominator)),
      );
      const remainingBeats =
        arrangementLengthBeats -
        bars * 4 * (clipTimeSigNumerator / clipTimeSigDenominator);
      const arrangementLengthBarBeat = `${bars}:${remainingBeats.toFixed(3)}`;

      // Call update-clip to handle the lengthening
      const updateResult = updateClip(
        {
          ids: newClipId,
          arrangementLength: arrangementLengthBarBeat,
          name: name,
        },
        context,
      );

      // updateClip returns array of clip objects with id property
      // Get minimal info for all created clips (original + any tiles)
      for (let i = 0; i < updateResult.length; i++) {
        const clipObj = updateResult[i];
        // Get fresh LiveAPI object for each clip by finding it in the track's arrangement clips
        const arrangementClipIds = track.getChildIds("arrangement_clips");
        const clipLiveAPI = arrangementClipIds
          .map((id) => new LiveAPI(id))
          .find((c) => c.id === clipObj.id);

        if (clipLiveAPI) {
          duplicatedClips.push(getMinimalClipInfo(clipLiveAPI, omitFields));
        }
      }
    } else {
      // Exact length match - just set name if provided
      if (name != null) {
        newClip.set("name", name);
      }
      duplicatedClips.push(getMinimalClipInfo(newClip, omitFields));
    }
  }

  return duplicatedClips;
}

/**
 * Find the correct routing option for a track when duplicate names exist
 * @param {LiveAPI} sourceTrack - The source track LiveAPI object
 * @param {string} sourceTrackName - The source track's name
 * @param {Array} availableTypes - Available output routing types from the new track
 * @returns {object | undefined} The correct routing option or undefined
 */
export function findRoutingOptionForDuplicateNames(
  sourceTrack,
  sourceTrackName,
  availableTypes,
) {
  // Get all routing options with the same name
  const matchingOptions = availableTypes.filter(
    (type) => type.display_name === sourceTrackName,
  );

  // If only one match, return it (no duplicates)
  if (matchingOptions.length <= 1) {
    return matchingOptions[0];
  }

  // Multiple matches - need to find the correct one
  const liveSet = new LiveAPI("live_set");
  const allTrackIds = liveSet.getChildIds("tracks");

  // Find all tracks with the same name and their info
  const tracksWithSameName = allTrackIds
    .map((trackId, index) => {
      const track = new LiveAPI(trackId);
      return {
        index,
        id: track.id,
        name: track.getProperty("name"),
      };
    })
    .filter((track) => track.name === sourceTrackName);

  // Sort by ID (creation order) - IDs are numeric strings
  tracksWithSameName.sort((a, b) => {
    const idA = parseInt(a.id);
    const idB = parseInt(b.id);
    return idA - idB;
  });

  // Find source track's position in the sorted list
  const sourcePosition = tracksWithSameName.findIndex(
    (track) => track.id === sourceTrack.id,
  );

  if (sourcePosition === -1) {
    console.error(
      `Warning: Could not find source track in duplicate name list for "${sourceTrackName}"`,
    );
    return undefined;
  }

  // Return the routing option at the same position
  return matchingOptions[sourcePosition];
}

/**
 * Duplicate a clip slot to another slot
 * @param {number} sourceTrackIndex - Source track index
 * @param {number} sourceSceneIndex - Source scene index
 * @param {number} toTrackIndex - Destination track index
 * @param {number} toSceneIndex - Destination scene index
 * @param {string} [name] - Optional name for the duplicated clip
 * @returns {object} Minimal clip info object
 */
export function duplicateClipSlot(
  sourceTrackIndex,
  sourceSceneIndex,
  toTrackIndex,
  toSceneIndex,
  name,
) {
  // Get source clip slot
  const sourceClipSlot = new LiveAPI(
    `live_set tracks ${sourceTrackIndex} clip_slots ${sourceSceneIndex}`,
  );

  if (!sourceClipSlot.exists()) {
    throw new Error(
      `duplicate failed: source clip slot at track ${sourceTrackIndex}, scene ${sourceSceneIndex} does not exist`,
    );
  }

  if (!sourceClipSlot.getProperty("has_clip")) {
    throw new Error(
      `duplicate failed: no clip in source clip slot at track ${sourceTrackIndex}, scene ${sourceSceneIndex}`,
    );
  }

  // Get destination clip slot
  const destClipSlot = new LiveAPI(
    `live_set tracks ${toTrackIndex} clip_slots ${toSceneIndex}`,
  );

  if (!destClipSlot.exists()) {
    throw new Error(
      `duplicate failed: destination clip slot at track ${toTrackIndex}, scene ${toSceneIndex} does not exist`,
    );
  }

  // Use duplicate_clip_to to copy the clip to the destination
  sourceClipSlot.call("duplicate_clip_to", `id ${destClipSlot.id}`);

  // Get the newly created clip
  const newClip = new LiveAPI(
    `live_set tracks ${toTrackIndex} clip_slots ${toSceneIndex} clip`,
  );

  if (name != null) {
    newClip.set("name", name);
  }

  // Return the new clip info directly
  return getMinimalClipInfo(newClip);
}

/**
 * Duplicate a clip to the arrangement view
 * @param {string} clipId - Clip ID to duplicate
 * @param {number} arrangementStartBeats - Start position in beats
 * @param {string} [name] - Optional name for the duplicated clip(s)
 * @param {string} [arrangementLength] - Optional length in bar:beat format
 * @param {number} _songTimeSigNumerator - Song time signature numerator (unused but kept for API compat)
 * @param {number} _songTimeSigDenominator - Song time signature denominator (unused but kept for API compat)
 * @param {object} [context] - Context object with holdingAreaStartBeats and silenceWavPath
 * @returns {object | Array<object>} Clip info or object with trackIndex and clips array
 */
export function duplicateClipToArrangement(
  clipId,
  arrangementStartBeats,
  name,
  arrangementLength,
  _songTimeSigNumerator,
  _songTimeSigDenominator,
  context = {},
) {
  // Support "id {id}" (such as returned by childIds()) and id values directly
  const clip = LiveAPI.from(clipId);

  if (!clip.exists()) {
    throw new Error(`duplicate failed: no clip exists for clipId "${clipId}"`);
  }

  const trackIndex = clip.trackIndex;
  if (trackIndex == null) {
    throw new Error(
      `duplicate failed: no track index for clipId "${clipId}" (path=${clip.path})`,
    );
  }

  const track = new LiveAPI(`live_set tracks ${trackIndex}`);
  const duplicatedClips = [];

  if (arrangementLength != null) {
    // Use the clip's time signature for duration calculation
    const clipTimeSigNumerator = clip.getProperty("signature_numerator");
    const clipTimeSigDenominator = clip.getProperty("signature_denominator");
    const arrangementLengthBeats = parseArrangementLength(
      arrangementLength,
      clipTimeSigNumerator,
      clipTimeSigDenominator,
    );
    // When creating multiple clips, omit trackIndex since they all share the same track
    const clipsCreated = createClipsForLength(
      clip,
      track,
      arrangementStartBeats,
      arrangementLengthBeats,
      name,
      ["trackIndex"],
      context,
    );
    duplicatedClips.push(...clipsCreated);
  } else {
    // No length specified - use original behavior
    const newClipResult = track.call(
      "duplicate_clip_to_arrangement",
      `id ${clip.id}`,
      arrangementStartBeats,
    );
    const newClip = LiveAPI.from(newClipResult);

    newClip.setAll({
      name: name,
    });

    duplicatedClips.push(getMinimalClipInfo(newClip));
  }

  // Return single clip info directly, or clips array with trackIndex for multiple
  if (duplicatedClips.length === 1) {
    return duplicatedClips[0];
  }
  return {
    trackIndex,
    clips: duplicatedClips,
  };
}
