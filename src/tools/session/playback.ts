// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { parseCommaSeparatedIds } from "#src/tools/shared/utils.ts";
import { validateIdTypes } from "#src/tools/shared/validation/id-validation.ts";
import { parseSlotList } from "#src/tools/shared/validation/position-parsing.ts";
import {
  getCurrentLoopState,
  handlePlayArrangement,
  handlePlayScene,
  resolveLoopEnd,
  resolveLoopStart,
  resolveStartTime,
  validateLocatorOrTime,
  type PlaybackState,
} from "./helpers/playback-helpers.ts";
import { select } from "./select.ts";

interface PlaybackActionParams {
  startTime?: string;
  startTimeBeats?: number;
  useLocatorStart: boolean;
  sceneIndex?: number;
  ids?: string;
  slots?: string;
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
  ids?: string;
  slots?: string;
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
 * @param args.ids - Comma-separated clip IDs for Session view operations
 * @param args.slots - Comma-separated trackIndex/sceneIndex slot positions
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
    ids,
    slots,
    focus,
  }: PlaybackArgs = {},
  _context: Partial<ToolContext> = {},
): PlaybackResult {
  if (!action) {
    throw new Error("playback failed: action is required");
  }

  if (ids != null && slots != null) {
    throw new Error("playback failed: ids and slots are mutually exclusive");
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
      ids,
      slots,
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
 * @param action - Action name for error messages
 * @param liveSet - LiveAPI instance for live_set
 * @param ids - Comma-separated clip IDs
 * @param slots - Comma-separated trackIndex/sceneIndex positions
 * @param state - Current playback state
 * @returns Updated playback state
 */
function handlePlaySessionClips(
  action: string,
  liveSet: LiveAPI,
  ids: string | undefined,
  slots: string | undefined,
  state: PlaybackState,
): PlaybackState {
  const resolvedSlots = resolveClipSlotPositions(ids, slots, action);

  for (const { trackIndex, sceneIndex } of resolvedSlots) {
    const clipSlot = LiveAPI.from(
      livePath.track(trackIndex).clipSlot(sceneIndex),
    );

    if (!clipSlot.exists()) {
      throw new Error(
        `playback ${action} action failed: clip slot at ${trackIndex}/${sceneIndex} does not exist`,
      );
    }

    clipSlot.call("fire");
  }

  // Fix launch quantization: when playing multiple clips, stop and restart transport
  // to ensure in-sync playback (clips fired after the first are subject to quantization)
  if (resolvedSlots.length > 1) {
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
 * @param action - Action name for error messages
 * @param ids - Comma-separated clip IDs
 * @param slots - Comma-separated trackIndex/sceneIndex positions
 * @param state - Current playback state
 * @returns Updated playback state
 */
function handleStopSessionClips(
  action: string,
  ids: string | undefined,
  slots: string | undefined,
  state: PlaybackState,
): PlaybackState {
  const resolvedSlots = resolveClipSlotPositions(ids, slots, action);
  const tracksToStop = new Set<number>();

  for (const { trackIndex } of resolvedSlots) {
    tracksToStop.add(trackIndex);
  }

  for (const trackIndex of tracksToStop) {
    const track = LiveAPI.from(livePath.track(trackIndex));

    if (!track.exists()) {
      throw new Error(
        `playback ${action} action failed: track at index ${trackIndex} does not exist`,
      );
    }

    track.call("stop_all_clips");
  }

  // this doesn't affect the isPlaying state
  return state;
}

interface SlotPosition {
  trackIndex: number;
  sceneIndex: number;
}

/**
 * Resolve clip slot positions from either ids or slots parameter
 * @param ids - Comma-separated clip IDs
 * @param slots - Comma-separated trackIndex/sceneIndex positions
 * @param action - Action name for error messages
 * @returns Array of slot positions
 */
function resolveClipSlotPositions(
  ids: string | undefined,
  slots: string | undefined,
  action: string,
): SlotPosition[] {
  if (slots != null) {
    return parseSlotList(slots);
  }

  if (ids == null) {
    throw new Error(
      `playback failed: ids or slots is required for action "${action}"`,
    );
  }

  const clipIdList = parseCommaSeparatedIds(ids);
  const clips = validateIdTypes(clipIdList, "clip", "playback", {
    skipInvalid: true,
  });

  return clips.map((clip) => {
    const { trackIndex, sceneIndex } = clip;

    if (trackIndex == null || sceneIndex == null) {
      throw new Error(
        `playback ${action} action failed: could not determine track/scene for clipId=${clip.id}`,
      );
    }

    return { trackIndex, sceneIndex };
  });
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
  const { startTime, startTimeBeats, useLocatorStart, sceneIndex, ids, slots } =
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
      return handlePlaySessionClips(action, liveSet, ids, slots, state);

    case "stop-session-clips":
      return handleStopSessionClips(action, ids, slots, state);

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
