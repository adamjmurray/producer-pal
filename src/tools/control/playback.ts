import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { parseCommaSeparatedIds } from "#src/tools/shared/utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import {
  getArrangementFollowerTrackIds,
  getCurrentLoopState,
  handlePlayArrangement,
  handlePlayScene,
  resolveLoopEnd,
  resolveLoopStart,
  resolveStartTime,
  validateLocatorOrTime,
} from "./playback-helpers.ts";
import type { PlaybackState } from "./playback-helpers.ts";
import { select } from "./select.ts";

interface PlaybackActionParams {
  startTime?: string;
  startTimeBeats?: number;
  useLocatorStart: boolean;
  autoFollow: boolean;
  sceneIndex?: number;
  clipIds?: string;
}

interface PlaybackArgs {
  action?: string;
  startTime?: string;
  startLocatorId?: string;
  startLocatorName?: string;
  loop?: boolean;
  loopStart?: string;
  loopStartLocatorId?: string;
  loopStartLocatorName?: string;
  loopEnd?: string;
  loopEndLocatorId?: string;
  loopEndLocatorName?: string;
  autoFollow?: boolean;
  sceneIndex?: number;
  clipIds?: string;
  switchView?: boolean;
}

interface PlaybackResult {
  playing: boolean;
  currentTime: string;
  arrangementLoop?: { start: string; end: string };
  arrangementFollowerTrackIds?: string;
}

interface BuildPlaybackResultParams {
  isPlaying: boolean;
  currentTime: string;
  loop?: boolean;
  loopStart?: string;
  loopEnd?: string;
  currentLoopStart: string;
  currentLoopEnd: string;
  liveSet: LiveAPI;
  arrangementFollowerTrackIds: string;
}

/**
 * Unified control for all playback functionality in both Arrangement and Session views.
 * IMPORTANT: Tracks can either follow the Arrangement timeline or play Session clips independently.
 * When Session clips are launched, those tracks stop following the Arrangement until explicitly told to return.
 * @param args - The parameters
 * @param args.action - Action to perform
 * @param args.startTime - Position in bar|beat format
 * @param args.startLocatorId - Locator ID for start position
 * @param args.startLocatorName - Locator name for start position
 * @param args.loop - Enable/disable arrangement loop
 * @param args.loopStart - Loop start position in bar|beat format
 * @param args.loopStartLocatorId - Locator ID for loop start
 * @param args.loopStartLocatorName - Locator name for loop start
 * @param args.loopEnd - Loop end position in bar|beat format
 * @param args.loopEndLocatorId - Locator ID for loop end
 * @param args.loopEndLocatorName - Locator name for loop end
 * @param args.autoFollow - Whether all tracks should automatically follow the arrangement
 * @param args.sceneIndex - Scene index for Session view operations
 * @param args.clipIds - Comma-separated clip IDs for Session view operations
 * @param args.switchView - Automatically switch to the appropriate view
 * @param _context - Internal context object (unused, for consistent tool interface)
 * @returns Result with transport state
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
  }: PlaybackArgs = {},
  _context: Partial<ToolContext> = {},
): PlaybackResult {
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
  const songTimeSigNumerator = liveSet.getProperty(
    "signature_numerator",
  ) as number;
  const songTimeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

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
  let isPlaying = (liveSet.getProperty("is_playing") as number) > 0;
  let currentTimeBeats = liveSet.getProperty("current_song_time") as number;

  const playbackState: PlaybackState = handlePlaybackAction(
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
  const currentLoop = getCurrentLoopState(
    liveSet,
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
    currentLoopStart: currentLoop.start,
    currentLoopEnd: currentLoop.end,
    liveSet,
    arrangementFollowerTrackIds,
  });
}

/**
 * Handle view switching if requested
 * @param action - The playback action
 * @param switchView - Whether to switch view
 */
function handleViewSwitch(action: string, switchView?: boolean): void {
  if (!switchView) return;

  if (action === "play-arrangement") {
    select({ view: "arrangement" });
  } else if (action === "play-scene" || action === "play-session-clips") {
    select({ view: "session" });
  }
}

/**
 * Build the playback result object
 * @param params - Result parameters
 * @param params.isPlaying - Whether playback is active
 * @param params.currentTime - Current time in bar|beat format
 * @param params.loop - Loop enabled state
 * @param params.loopStart - Loop start in bar|beat format
 * @param params.loopEnd - Loop end in bar|beat format
 * @param params.currentLoopStart - Current loop start
 * @param params.currentLoopEnd - Current loop end
 * @param params.liveSet - The live_set LiveAPI object
 * @param params.arrangementFollowerTrackIds - Track IDs following arrangement
 * @returns Playback result
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
}: BuildPlaybackResultParams): PlaybackResult {
  const result: PlaybackResult = {
    playing: isPlaying,
    currentTime,
  };

  const loopEnabled = loop ?? (liveSet.getProperty("loop") as number) > 0;

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
 * Handle playing specific session clips
 *
 * @param liveSet - LiveAPI instance for live_set
 * @param clipIds - Comma-separated clip IDs
 * @param state - Current playback state
 * @returns Updated playback state
 */
function handlePlaySessionClips(
  liveSet: LiveAPI,
  clipIds: string | undefined,
  state: PlaybackState,
): PlaybackState {
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
 * @param clipIds - Comma-separated clip IDs
 * @param state - Current playback state
 * @returns Updated playback state
 */
function handleStopSessionClips(
  clipIds: string | undefined,
  state: PlaybackState,
): PlaybackState {
  if (!clipIds) {
    throw new Error(
      `playback failed: clipIds is required for action "stop-session-clips"`,
    );
  }

  const stopClipIdList = parseCommaSeparatedIds(clipIds);
  const stopClips = validateIdTypes(stopClipIdList, "clip", "playback", {
    skipInvalid: true,
  });
  const tracksToStop = new Set<string>();

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
 * @param action - Playback action to perform
 * @param liveSet - LiveAPI instance for live_set
 * @param params - Action parameters
 * @param state - Current playback state
 * @returns Updated playback state
 */
function handlePlaybackAction(
  action: string,
  liveSet: LiveAPI,
  params: PlaybackActionParams,
  state: PlaybackState,
): PlaybackState {
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
