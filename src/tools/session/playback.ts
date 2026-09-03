// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import {
  foldLocatorParams,
  getCurrentLoopState,
  handlePlayArrangement,
  handlePlayScene,
  resolveArrangementParams,
  resolveLoopEnd,
  resolveLoopStart,
  resolveStartTime,
  type FiredScene,
  type PlaybackState,
} from "./helpers/playback-helpers.ts";
import {
  resolveClipSlotPositions,
  resolvePlaybackTarget,
} from "./helpers/playback-target-helpers.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import { select } from "./select.ts";

interface PlaybackActionParams {
  startTimeBeats?: number;
  sceneIndex?: number;
  ids?: string;
  slotPositions: ClipSlotPosition[] | null;
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
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  slots?: string;
  focus?: boolean;
}

interface PlaybackResult {
  playing: boolean;
  currentTime: string;
  sceneIndex?: number;
  sceneName?: string;
  arrangementLoop?: { start: string; end: string };
}

interface BuildPlaybackResultParams {
  isPlaying: boolean;
  currentTime: string;
  scene?: FiredScene;
  loop?: boolean;
  currentLoopStart: string;
  currentLoopEnd: string;
  liveSet: LiveAPI;
}

/**
 * Unified control for all playback functionality in both Arrangement and Session views.
 * @param args - The parameters
 * @param args.action - Action to perform
 * @param args.startTime - Song position, bar|beat or `loc:<name>`
 * @param args.startLocator - Deprecated locator half of startTime
 * @param args.loop - Enable/disable arrangement loop
 * @param args.loopStart - Song position, bar|beat or `loc:<name>`
 * @param args.loopStartLocator - Deprecated locator half of loopStart
 * @param args.loopEnd - Song position, bar|beat or `loc:<name>`
 * @param args.loopEndLocator - Deprecated locator half of loopEnd
 * @param args.sceneIndex - Deprecated scene index for Session view operations
 * @param args.id - Comma-separated clip IDs for Session view operations
 * @param args.ids - Hidden alias for id
 * @param args.path - A scene "s<scene>", or comma-separated clip slots "t<track>/s<scene>"
 * @param args.paths - Hidden alias for path
 * @param args.slots - Deprecated comma-separated trackIndex/sceneIndex positions
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
    id,
    ids,
    path,
    paths,
    slots,
    focus,
  }: PlaybackArgs = {},
  _context: Partial<ToolContext> = {},
): PlaybackResult {
  if (!action) {
    throw new Error("playback failed: action is required");
  }

  const {
    sceneIndex: sceneTarget,
    slotPositions,
    ids: namedIds,
  } = resolvePlaybackTarget(action, {
    id,
    ids,
    path,
    paths,
    slots,
    sceneIndex,
  });

  // Dropped before anything reads them, so a session action can't write the
  // arrangement. Dropping runs before the fold, so a session action refuses
  // nothing, looks up no locator, and warns by the names the caller sent.
  const timeline = foldLocatorParams(
    resolveArrangementParams(action, {
      startTime,
      startLocator,
      loop,
      loopStart,
      loopStartLocator,
      loopEnd,
      loopEndLocator,
    }),
  );

  const liveSet = LiveAPI.from(livePath.liveSet);

  // Get song time signature for bar|beat conversions
  const songTimeSigNumerator = liveSet.getProperty(
    "signature_numerator",
  ) as number;
  const songTimeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

  // Resolve start time from bar|beat or locator
  const startTimeBeats = resolveStartTime(
    liveSet,
    timeline,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  if (timeline.loop != null) {
    liveSet.set("loop", timeline.loop);
  }

  // Resolve loop start from bar|beat or locator
  const loopStartBeats = resolveLoopStart(
    liveSet,
    timeline,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  // Resolve loop end from bar|beat or locator
  resolveLoopEnd(
    liveSet,
    timeline,
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
      startTimeBeats,
      sceneIndex: sceneTarget ?? undefined,
      ids: namedIds,
      slotPositions,
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
    scene: playbackState.scene,
    loop: timeline.loop,
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
 * @param params.scene - The scene play-scene fired, when the action fired one
 * @param params.loop - Loop enabled state
 * @param params.currentLoopStart - Current loop start (post-set actual value)
 * @param params.currentLoopEnd - Current loop end (post-set actual value)
 * @param params.liveSet - The live_set LiveAPI object
 * @returns Playback result
 */
function buildPlaybackResult({
  isPlaying,
  currentTime,
  scene,
  loop,
  currentLoopStart,
  currentLoopEnd,
  liveSet,
}: BuildPlaybackResultParams): PlaybackResult {
  const result: PlaybackResult = {
    playing: isPlaying,
    currentTime,
    // Which scene fired, since a scene id or a clip in it can name it
    ...(scene && { sceneIndex: scene.sceneIndex, sceneName: scene.sceneName }),
  };

  const loopEnabled = loop ?? (liveSet.getProperty("loop") as number) > 0;

  if (loopEnabled) {
    // Report the actual loop bounds read back after the sets, not the requested
    // loopStart/loopEnd — a loopEnd at/before loopStart is rejected (loop_length
    // unchanged), so echoing the request would disagree with the real Live Set.
    result.arrangementLoop = {
      start: currentLoopStart,
      end: currentLoopEnd,
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
 * @param slotPositions - Resolved clip slots, or null when none given
 * @param state - Current playback state
 * @returns Updated playback state
 */
function handlePlaySessionClips(
  action: string,
  liveSet: LiveAPI,
  ids: string | undefined,
  slotPositions: ClipSlotPosition[] | null,
  state: PlaybackState,
): PlaybackState {
  const resolvedSlots = resolveClipSlotPositions(ids, slotPositions, action);

  for (const { trackIndex, sceneIndex } of resolvedSlots) {
    const clipSlot = LiveAPI.from(
      livePath.track(trackIndex).clipSlot(sceneIndex),
    );

    if (!clipSlot.exists()) {
      throw new Error(
        `playback ${action} action failed: no clip slot at ${slotPath(trackIndex, sceneIndex)}`,
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
 * @param slotPositions - Resolved clip slots, or null when none given
 * @param state - Current playback state
 * @returns Updated playback state
 */
function handleStopSessionClips(
  action: string,
  ids: string | undefined,
  slotPositions: ClipSlotPosition[] | null,
  state: PlaybackState,
): PlaybackState {
  const resolvedSlots = resolveClipSlotPositions(ids, slotPositions, action);
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
  const { startTimeBeats, sceneIndex, ids, slotPositions } = params;

  switch (action) {
    case "play-arrangement":
      return handlePlayArrangement(liveSet, startTimeBeats, state);

    case "update-arrangement":
      // No playback state change, just the loop and follow settings above
      return state;

    case "play-scene":
      return handlePlayScene(sceneIndex, state);

    case "play-session-clips":
      return handlePlaySessionClips(action, liveSet, ids, slotPositions, state);

    case "stop-session-clips":
      return handleStopSessionClips(action, ids, slotPositions, state);

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
