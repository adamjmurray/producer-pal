// @ts-nocheck -- TODO: Add JSDoc type annotations
import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.js";
import { parseCommaSeparatedIds } from "#src/tools/shared/utils.js";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.js";
import {
  getArrangementFollowerTrackIds,
  resolveLoopEnd,
  resolveLoopStart,
  resolveStartTime,
  validateLocatorOrTime,
} from "./playback-helpers.js";
import { select } from "./select.js";

/**
 * Unified control for all playback functionality in both Arrangement and Session views.
 * IMPORTANT: Tracks can either follow the Arrangement timeline or play Session clips independently.
 * When Session clips are launched, those tracks stop following the Arrangement until explicitly told to return.
 * @param {object} args - The parameters
 * @param {string} args.action - Action to perform
 * @param {string} [args.startTime] - Position in bar|beat format to start playback from in the arrangement
 * @param {string} [args.startLocatorId] - Locator ID for start position (mutually exclusive with startTime)
 * @param {string} [args.startLocatorName] - Locator name for start position (mutually exclusive with startTime)
 * @param {boolean} [args.loop] - Enable/disable arrangement loop
 * @param {string} [args.loopStart] - Loop start position in bar|beat format in the arrangement
 * @param {string} [args.loopStartLocatorId] - Locator ID for loop start (mutually exclusive with loopStart)
 * @param {string} [args.loopStartLocatorName] - Locator name for loop start (mutually exclusive with loopStart)
 * @param {string} [args.loopEnd] - Loop end position in bar|beat format in the arrangement
 * @param {string} [args.loopEndLocatorId] - Locator ID for loop end (mutually exclusive with loopEnd)
 * @param {string} [args.loopEndLocatorName] - Locator name for loop end (mutually exclusive with loopEnd)
 * @param {boolean} [args.autoFollow=true] - For 'play-arrangement' action: whether all tracks should automatically follow the arrangement
 * @param {number} [args.sceneIndex] - Scene index for Session view operations (puts tracks into non-following state)
 * @param {string} [args.clipIds] - Comma-separated clip IDs for Session view operations
 * @param {boolean} [args.switchView=false] - Automatically switch to the appropriate view for the operation
 * @param {object} _context - Context from main (unused)
 * @returns {object} Result with transport state
 */
export function playback(
  {
    action,
    startTime,
    startLocatorId,
    startLocatorName,
    loop,
    loopStart,
    loopStartLocatorId,
    loopStartLocatorName,
    loopEnd,
    loopEndLocatorId,
    loopEndLocatorName,
    autoFollow = true,
    sceneIndex,
    clipIds,
    switchView,
  } = {},
  _context = {},
) {
  if (!action) {
    throw new Error("playback failed: action is required");
  }

  // Validate mutual exclusivity of time and locator parameters
  validateLocatorOrTime(
    startTime,
    startLocatorId,
    startLocatorName,
    "startTime",
  );
  validateLocatorOrTime(
    loopStart,
    loopStartLocatorId,
    loopStartLocatorName,
    "loopStart",
  );
  validateLocatorOrTime(
    loopEnd,
    loopEndLocatorId,
    loopEndLocatorName,
    "loopEnd",
  );

  const liveSet = LiveAPI.from("live_set");

  // Get song time signature for bar|beat conversions
  const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
  const songTimeSigDenominator = liveSet.getProperty("signature_denominator");

  // Resolve start time from bar|beat or locator
  const { startTimeBeats, useLocatorStart } = resolveStartTime(
    liveSet,
    { startTime, startLocatorId, startLocatorName },
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  if (loop != null) {
    liveSet.set("loop", loop);
  }

  // Resolve loop start from bar|beat or locator
  const loopStartBeats = resolveLoopStart(
    liveSet,
    { loopStart, loopStartLocatorId, loopStartLocatorName },
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  // Resolve loop end from bar|beat or locator
  resolveLoopEnd(
    liveSet,
    { loopEnd, loopEndLocatorId, loopEndLocatorName },
    loopStartBeats,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  // Default result values that will be overridden by specific actions
  // (for optimistic results to avoid a sleep() for playback state updates)
  let isPlaying = liveSet.getProperty("is_playing") > 0;
  let currentTimeBeats = liveSet.getProperty("current_song_time");

  const playbackState = handlePlaybackAction(
    action,
    liveSet,
    {
      startTime,
      startTimeBeats,
      useLocatorStart,
      autoFollow,
      sceneIndex,
      clipIds,
    },
    { isPlaying, currentTimeBeats },
  );

  isPlaying = playbackState.isPlaying;
  currentTimeBeats = playbackState.currentTimeBeats;

  // Convert beats back to bar|beat for the response
  const currentTime = abletonBeatsToBarBeat(
    currentTimeBeats,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  // Get current loop state and convert to bar|beat
  const currentLoopStartBeats = liveSet.getProperty("loop_start");
  const currentLoopLengthBeats = liveSet.getProperty("loop_length");
  const currentLoopStart = abletonBeatsToBarBeat(
    currentLoopStartBeats,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );
  const currentLoopEnd = abletonBeatsToBarBeat(
    currentLoopStartBeats + currentLoopLengthBeats,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  handleViewSwitch(action, switchView);

  const arrangementFollowerTrackIds = getArrangementFollowerTrackIds(liveSet);

  return buildPlaybackResult({
    isPlaying,
    currentTime,
    loop,
    loopStart,
    loopEnd,
    currentLoopStart,
    currentLoopEnd,
    liveSet,
    arrangementFollowerTrackIds,
  });
}

/**
 * Handle view switching if requested
 * @param {string} action - The playback action
 * @param {boolean} switchView - Whether to switch view
 */
function handleViewSwitch(action, switchView) {
  if (!switchView) return;

  if (action === "play-arrangement") {
    select({ view: "arrangement" });
  } else if (action === "play-scene" || action === "play-session-clips") {
    select({ view: "session" });
  }
}

/**
 * Build the playback result object
 * @param {object} params - Result parameters
 * @param {boolean} params.isPlaying - Whether playback is active
 * @param {string} params.currentTime - Current time in bar|beat format
 * @param {boolean} [params.loop] - Loop enabled state
 * @param {string} [params.loopStart] - Loop start in bar|beat format
 * @param {string} [params.loopEnd] - Loop end in bar|beat format
 * @param {string} params.currentLoopStart - Current loop start
 * @param {string} params.currentLoopEnd - Current loop end
 * @param {LiveAPI} params.liveSet - The live_set LiveAPI object
 * @param {string} params.arrangementFollowerTrackIds - Track IDs following arrangement
 * @returns {object} Playback result
 */
function buildPlaybackResult({
  isPlaying,
  currentTime,
  loop,
  loopStart,
  loopEnd,
  currentLoopStart,
  currentLoopEnd,
  liveSet,
  arrangementFollowerTrackIds,
}) {
  const result = {
    playing: isPlaying,
    currentTime,
  };

  const loopEnabled = loop ?? liveSet.getProperty("loop") > 0;

  if (loopEnabled) {
    result.arrangementLoop = {
      start: loopStart ?? currentLoopStart,
      end: loopEnd ?? currentLoopEnd,
    };
  }

  result.arrangementFollowerTrackIds = arrangementFollowerTrackIds;

  return result;
}

/**
 * Handle playing the arrangement view
 *
 * @param {object} liveSet - LiveAPI instance for live_set
 * @param {string} startTime - Start time in bar|beat format
 * @param {number} startTimeBeats - Start time in beats (from time or locator)
 * @param {boolean} useLocatorStart - Whether start position came from a locator
 * @param {boolean} autoFollow - Whether tracks should follow arrangement
 * @param {object} _state - Current playback state (unused)
 * @returns {object} Updated playback state
 */
function handlePlayArrangement(
  liveSet,
  startTime,
  startTimeBeats,
  useLocatorStart,
  autoFollow,
  _state,
) {
  // Default to position 0 if no start position specified (time or locator)
  if (startTime == null && !useLocatorStart) {
    liveSet.set("start_time", 0);
    startTimeBeats = 0;
  }

  // Handle autoFollow for arrangement playback
  if (autoFollow) {
    liveSet.set("back_to_arranger", 0);
  }

  liveSet.call("start_playing");

  return {
    isPlaying: true,
    currentTimeBeats: startTimeBeats ?? 0,
  };
}

/**
 * Handle playing a scene in session view
 *
 * @param {number} sceneIndex - Scene index to play
 * @param {object} state - Current playback state
 * @returns {object} Updated playback state
 */
function handlePlayScene(sceneIndex, state) {
  if (sceneIndex == null) {
    throw new Error(
      `playback failed: sceneIndex is required for action "play-scene"`,
    );
  }

  const scene = LiveAPI.from(`live_set scenes ${sceneIndex}`);

  if (!scene.exists()) {
    throw new Error(
      `playback failed: scene at index ${sceneIndex} does not exist`,
    );
  }

  scene.call("fire");

  return {
    isPlaying: true,
    currentTimeBeats: state.currentTimeBeats,
  };
}

/**
 * Handle playing specific session clips
 *
 * @param {object} liveSet - LiveAPI instance for live_set
 * @param {string} clipIds - Comma-separated clip IDs
 * @param {object} state - Current playback state
 * @returns {object} Updated playback state
 */
function handlePlaySessionClips(liveSet, clipIds, state) {
  if (!clipIds) {
    throw new Error(
      `playback failed: clipIds is required for action "play-session-clips"`,
    );
  }

  const clipIdList = parseCommaSeparatedIds(clipIds);
  const clips = validateIdTypes(clipIdList, "clip", "playback", {
    skipInvalid: true,
  });

  for (const clip of clips) {
    // For clips, we need to fire the clip slot, not the clip itself
    // Extract track index and scene index from clip path or properties
    const trackIndex = clip.trackIndex;
    const sceneIndex = clip.sceneIndex;

    if (trackIndex == null || sceneIndex == null) {
      throw new Error(
        `playback play-session-clips action failed: could not determine track/scene for clipId=${clip.id}`,
      );
    }

    const clipSlot = LiveAPI.from(
      `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
    );

    if (!clipSlot.exists()) {
      throw new Error(
        `playback play-session-clips action failed: clip slot for clipId=${clip.id.replace(/^id /, "")} does not exist`,
      );
    }

    clipSlot.call("fire");
  }

  // Fix launch quantization: when playing multiple clips, stop and restart transport
  // to ensure in-sync playback (clips fired after the first are subject to quantization)
  if (clips.length > 1) {
    liveSet.call("stop_playing");
    liveSet.call("start_playing");
  }

  return {
    isPlaying: true,
    currentTimeBeats: state.currentTimeBeats,
  };
}

/**
 * Handle stopping specific session clips
 *
 * @param {string} clipIds - Comma-separated clip IDs
 * @param {object} state - Current playback state
 * @returns {object} Updated playback state
 */
function handleStopSessionClips(clipIds, state) {
  if (!clipIds) {
    throw new Error(
      `playback failed: clipIds is required for action "stop-session-clips"`,
    );
  }

  const stopClipIdList = parseCommaSeparatedIds(clipIds);
  const stopClips = validateIdTypes(stopClipIdList, "clip", "playback", {
    skipInvalid: true,
  });
  const tracksToStop = new Set();

  for (const clip of stopClips) {
    // Extract track index from clip and add to set to avoid duplicate calls
    const trackIndex = clip.trackIndex;

    if (trackIndex == null) {
      throw new Error(
        `playback stop-session-clips action failed: could not determine track for clipId=${clip.id}`,
      );
    }

    const trackPath = `live_set tracks ${trackIndex}`;

    tracksToStop.add(trackPath);
  }

  for (const trackPath of tracksToStop) {
    const track = LiveAPI.from(trackPath);

    if (!track.exists()) {
      throw new Error(
        `playback stop-session-clips action failed: track for clip path does not exist`,
      );
    }

    track.call("stop_all_clips");
  }

  // this doesn't affect the isPlaying state
  return state;
}

/**
 * Route to appropriate handler based on playback action
 *
 * @param {string} action - Playback action to perform
 * @param {object} liveSet - LiveAPI instance for live_set
 * @param {object} params - Action parameters
 * @param {object} state - Current playback state
 * @returns {object} Updated playback state
 */
function handlePlaybackAction(action, liveSet, params, state) {
  const {
    startTime,
    startTimeBeats,
    useLocatorStart,
    autoFollow,
    sceneIndex,
    clipIds,
  } = params;

  switch (action) {
    case "play-arrangement":
      return handlePlayArrangement(
        liveSet,
        startTime,
        startTimeBeats,
        useLocatorStart,
        autoFollow,
        state,
      );

    case "update-arrangement":
      // No playback state change, just the loop and follow settings above
      return state;

    case "play-scene":
      return handlePlayScene(sceneIndex, state);

    case "play-session-clips":
      return handlePlaySessionClips(liveSet, clipIds, state);

    case "stop-session-clips":
      return handleStopSessionClips(clipIds, state);

    case "stop-all-session-clips":
      liveSet.call("stop_all_clips");

      // the transport/arrangement might still be playing so don't update isPlaying
      return state;

    case "stop":
      liveSet.call("stop_playing");
      liveSet.set("start_time", 0);

      return {
        isPlaying: false,
        currentTimeBeats: 0,
      };

    default:
      throw new Error(`playback failed: unknown action "${action}"`);
  }
}
