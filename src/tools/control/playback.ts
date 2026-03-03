// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { parseCommaSeparatedIds } from "#src/tools/shared/utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import {
  getCurrentLoopState,
  handlePlayArrangement,
  handlePlayScene,
  resolveLoopEnd,
  resolveLoopStart,
  resolveStartTime,
  validateLocatorOrTime,
  type PlaybackState,
} from "./playback-helpers.ts";
import { select } from "./select.ts";

interface PlaybackActionParams {
  startTime?: string;
  startTimeBeats?: number;
  useLocatorStart: boolean;
  sceneIndex?: number;
  clipIds?: string;
}

interface PlaybackArgs {
  action?: string;
  startTime?: string;
  startLocator?: string;
  loop?: boolean;
  loopStart?: string;
  loopStartLocator?: string;
  loopEnd?: string;
  loopEndLocator?: string;
  sceneIndex?: number;
  clipIds?: string;
  focus?: boolean;
}

interface PlaybackResult {
  playing: boolean;
  currentTime: string;
  arrangementLoop?: { start: string; end: string };
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
}

/**
 * Unified control for all playback functionality in both Arrangement and Session views.
 * @param args - The parameters
 * @param args.action - Action to perform
 * @param args.startTime - Position in bar|beat format
 * @param args.startLocator - Locator ID or name for start position
 * @param args.loop - Enable/disable arrangement loop
 * @param args.loopStart - Loop start position in bar|beat format
 * @param args.loopStartLocator - Locator ID or name for loop start
 * @param args.loopEnd - Loop end position in bar|beat format
 * @param args.loopEndLocator - Locator ID or name for loop end
 * @param args.sceneIndex - Scene index for Session view operations
 * @param args.clipIds - Comma-separated clip IDs for Session view operations
 * @param args.focus - Switch to arrangement or session view based on action
 * @param _context - Internal context object (unused, for consistent tool interface)
 * @returns Result with transport state
 */
export function playback(
  {
    action,
    startTime,
    startLocator,
    loop,
    loopStart,
    loopStartLocator,
    loopEnd,
    loopEndLocator,
    sceneIndex,
    clipIds,
    focus,
  }: PlaybackArgs = {},
  _context: Partial<ToolContext> = {},
): PlaybackResult {
  if (!action) {
    throw new Error("playback failed: action is required");
  }

  // Validate mutual exclusivity of time and locator parameters
  validateLocatorOrTime(startTime, startLocator, "startTime");
  validateLocatorOrTime(loopStart, loopStartLocator, "loopStart");
  validateLocatorOrTime(loopEnd, loopEndLocator, "loopEnd");

  const liveSet = LiveAPI.from(livePath.liveSet);

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
    { startTime, startLocator },
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  if (loop != null) {
    liveSet.set("loop", loop);
  }

  // Resolve loop start from bar|beat or locator
  const loopStartBeats = resolveLoopStart(
    liveSet,
    { loopStart, loopStartLocator },
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  // Resolve loop end from bar|beat or locator
  resolveLoopEnd(
    liveSet,
    { loopEnd, loopEndLocator },
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

  handleFocus(action, focus);

  return buildPlaybackResult({
    isPlaying,
    currentTime,
    loop,
    loopStart,
    loopEnd,
    currentLoopStart: currentLoop.start,
    currentLoopEnd: currentLoop.end,
    liveSet,
  });
}

/**
 * Handle focus (view switching) if requested
 * @param action - The playback action
 * @param focus - Whether to focus
 */
function handleFocus(action: string, focus?: boolean): void {
  if (!focus) return;

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
      livePath.track(trackIndex).clipSlot(sceneIndex),
    );

    if (!clipSlot.exists()) {
      throw new Error(
        `playback play-session-clips action failed: clip slot for clipId=${clip.id} does not exist`,
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

    const trackPath = livePath.track(trackIndex).toString();

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
  const { startTime, startTimeBeats, useLocatorStart, sceneIndex, clipIds } =
    params;

  switch (action) {
    case "play-arrangement":
      return handlePlayArrangement(
        liveSet,
        startTime,
        startTimeBeats,
        useLocatorStart,
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
