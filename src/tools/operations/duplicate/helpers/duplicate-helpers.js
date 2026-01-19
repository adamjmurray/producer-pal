import { errorMessage } from "#src/shared/error-utils.js";
import * as console from "#src/shared/v8-max-console.js";
import { updateClip } from "#src/tools/clip/update/update-clip.js";
import {
  createShortenedClipInHolding,
  moveClipFromHolding,
} from "#src/tools/shared/arrangement/arrangement-tiling.js";
import {
  abletonBeatsToBarBeat,
  barBeatDurationToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.js";

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
    const msg = errorMessage(error);

    if (msg.includes("Invalid bar:beat duration format")) {
      throw new Error(`duplicate failed: ${msg}`);
    }

    if (msg.includes("must be 0 or greater")) {
      throw new Error(
        `duplicate failed: arrangementLength ${msg.replace("in duration ", "")}`,
      );
    }

    throw error;
  }
}

/**
 * @typedef {object} MinimalClipInfo
 * @property {string} id - Clip ID
 * @property {number} [trackIndex] - Track index
 * @property {number} [sceneIndex] - Scene index
 * @property {string} [arrangementStart] - Arrangement start in bar|beat format
 * @property {string} [name] - Clip name
 */

/**
 * Get minimal clip information for result objects
 * @param {LiveAPI} clip - The clip to get info from
 * @param {Array<string>} [omitFields] - Optional fields to omit from result
 * @returns {MinimalClipInfo} Minimal clip info object
 */
export function getMinimalClipInfo(clip, omitFields = []) {
  const isArrangementClip =
    /** @type {number} */ (clip.getProperty("is_arrangement_clip")) > 0;

  if (isArrangementClip) {
    const trackIndex = clip.trackIndex;

    if (trackIndex == null) {
      throw new Error(
        `getMinimalClipInfo failed: could not determine trackIndex for clip (path="${clip.path}")`,
      );
    }

    const arrangementStartBeats = /** @type {number} */ (
      clip.getProperty("start_time")
    );
    // Convert to bar|beat format using song time signature
    const liveSet = LiveAPI.from("live_set");
    const timeSigNum = /** @type {number} */ (
      liveSet.getProperty("signature_numerator")
    );
    const timeSigDenom = /** @type {number} */ (
      liveSet.getProperty("signature_denominator")
    );
    const arrangementStart = abletonBeatsToBarBeat(
      arrangementStartBeats,
      timeSigNum,
      timeSigDenom,
    );

    /** @type {MinimalClipInfo} */
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

  /** @type {MinimalClipInfo} */
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
 * @typedef {import("#src/tools/shared/arrangement/arrangement-tiling.js").TilingContext} TilingContext
 */

/**
 * Create clips to fill the specified arrangement length
 * @param {LiveAPI} sourceClip - The source clip to duplicate
 * @param {LiveAPI} track - The track to create clips on
 * @param {number} arrangementStartBeats - Start time in Ableton beats (quarter notes, 0-based)
 * @param {number} arrangementLengthBeats - Total length to fill in Ableton beats (quarter notes)
 * @param {string} [name] - Optional name for the clips
 * @param {Array<string>} [omitFields] - Optional fields to omit from clip info
 * @param {Partial<ToolContext & TilingContext>} [context] - Context object with holdingAreaStartBeats and silenceWavPath
 * @returns {Array<MinimalClipInfo>} Array of minimal clip info objects
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
  const sourceClipLength = /** @type {number} */ (
    sourceClip.getProperty("length")
  );
  const isMidiClip = sourceClip.getProperty("is_midi_clip") === 1;
  /** @type {MinimalClipInfo[]} */
  const duplicatedClips = [];

  if (arrangementLengthBeats < sourceClipLength) {
    // Case 1: Shortening - use holding area approach (preserves clip data including envelopes)
    if (!isMidiClip && !context.silenceWavPath) {
      console.error(
        "Warning: silenceWavPath missing in context - audio clip shortening may fail",
      );
    }

    const { holdingClipId } = createShortenedClipInHolding(
      sourceClip,
      track,
      arrangementLengthBeats,
      /** @type {number} */ (context.holdingAreaStartBeats),
      isMidiClip,
      /** @type {TilingContext} */ (context),
    );
    const newClip = moveClipFromHolding(
      holdingClipId,
      track,
      arrangementStartBeats,
    );

    if (name != null) newClip.set("name", name);
    duplicatedClips.push(getMinimalClipInfo(newClip, omitFields));
  } else {
    // Case 2: Lengthening or exact length - delegate to update-clip (handles looped/unlooped, MIDI/audio, etc.)
    const newClipResult = /** @type {string} */ (
      track.call(
        "duplicate_clip_to_arrangement",
        `id ${sourceClip.id}`,
        arrangementStartBeats,
      )
    );
    const newClip = LiveAPI.from(newClipResult);
    const newClipId = newClip.id;

    if (arrangementLengthBeats > sourceClipLength) {
      lengthenClipAndCollectInfo(
        sourceClip,
        track,
        newClipId,
        arrangementLengthBeats,
        name,
        omitFields,
        context,
        duplicatedClips,
      );
    } else {
      if (name != null) newClip.set("name", name);
      duplicatedClips.push(getMinimalClipInfo(newClip, omitFields));
    }
  }

  return duplicatedClips;
}

/**
 * Lengthens a clip and collects info about resulting clips
 * @param {LiveAPI} sourceClip - Source clip for time signature
 * @param {LiveAPI} track - Track containing the clip
 * @param {string} newClipId - ID of the new clip to lengthen
 * @param {number} targetBeats - Target length in beats
 * @param {string | undefined} name - Optional name
 * @param {string[]} omitFields - Fields to omit from results
 * @param {Partial<ToolContext & TilingContext>} context - Context object
 * @param {MinimalClipInfo[]} duplicatedClips - Array to push results to
 */
function lengthenClipAndCollectInfo(
  sourceClip,
  track,
  newClipId,
  targetBeats,
  name,
  omitFields,
  context,
  duplicatedClips,
) {
  // Convert beats to bar:beat format using clip's time signature
  const timeSigNum = /** @type {number} */ (
    sourceClip.getProperty("signature_numerator")
  );
  const timeSigDenom = /** @type {number} */ (
    sourceClip.getProperty("signature_denominator")
  );
  const beatsPerBar = 4 * (timeSigNum / timeSigDenom);
  const bars = Math.floor(targetBeats / beatsPerBar);
  const remainingBeats = targetBeats - bars * beatsPerBar;
  const arrangementLengthBarBeat = `${bars}:${remainingBeats.toFixed(3)}`;

  const updateResult = updateClip(
    { ids: newClipId, arrangementLength: arrangementLengthBarBeat, name },
    context,
  );

  // updateClip returns array of clip objects with id property
  const clipResults = /** @type {{ id: string }[]} */ (
    Array.isArray(updateResult) ? updateResult : [updateResult]
  );
  const arrangementClipIds = track.getChildIds("arrangement_clips");

  for (const clipObj of clipResults) {
    const clipLiveAPI = arrangementClipIds
      .map((id) => LiveAPI.from(id))
      .find((c) => c.id === clipObj.id);

    if (clipLiveAPI) {
      duplicatedClips.push(getMinimalClipInfo(clipLiveAPI, omitFields));
    }
  }
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
  const sourceClipSlot = LiveAPI.from(
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
  const destClipSlot = LiveAPI.from(
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
  const newClip = LiveAPI.from(
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
 * @param {number} [_songTimeSigNumerator] - Song time signature numerator (unused but kept for API compat)
 * @param {number} [_songTimeSigDenominator] - Song time signature denominator (unused but kept for API compat)
 * @param {Partial<ToolContext & TilingContext>} [context] - Context object with holdingAreaStartBeats and silenceWavPath
 * @returns {MinimalClipInfo | { trackIndex: number, clips: MinimalClipInfo[] }} Clip info or object with trackIndex and clips array
 */
export function duplicateClipToArrangement(
  clipId,
  arrangementStartBeats,
  name,
  arrangementLength,
  _songTimeSigNumerator = 4,
  _songTimeSigDenominator = 4,
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

  const track = LiveAPI.from(`live_set tracks ${trackIndex}`);
  const duplicatedClips = [];

  if (arrangementLength != null) {
    // Use the clip's time signature for duration calculation
    const clipTimeSigNumerator = /** @type {number} */ (
      clip.getProperty("signature_numerator")
    );
    const clipTimeSigDenominator = /** @type {number} */ (
      clip.getProperty("signature_denominator")
    );
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
    const newClipResult = /** @type {string} */ (
      track.call(
        "duplicate_clip_to_arrangement",
        `id ${clip.id}`,
        arrangementStartBeats,
      )
    );
    const newClip = LiveAPI.from(newClipResult);

    newClip.setAll({
      name: name,
    });

    duplicatedClips.push(getMinimalClipInfo(newClip));
  }

  // Return single clip info directly, or clips array with trackIndex for multiple
  if (duplicatedClips.length === 1) {
    return /** @type {MinimalClipInfo} */ (duplicatedClips[0]);
  }

  return {
    trackIndex,
    clips: duplicatedClips,
  };
}
