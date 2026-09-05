// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import {
  applyArrangementTimeline,
  foldLocatorParams,
  getCurrentLoopState,
  handlePlayArrangement,
  handlePlayScene,
  PLAY_ARRANGEMENT,
  readStartTime,
  resolveArrangementParams,
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
  startTime?: string;
  loop?: boolean;
  loopStart?: string;
  loopEnd?: string;
  scene?: FiredScene;
}

interface BuildPlaybackResultParams {
  isPlaying: boolean;
  startTime?: string;
  scene?: FiredScene;
  reportsLoop: boolean;
  namesLoopBounds: boolean;
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
    throw new Error("action is required");
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

  // The timeline is written before the action, except on stop: Live's own
  // second stop sends the start position to the top, so a position written
  // first would be wiped by the stop that was supposed to park it.
  const writeTimeline = (): number | undefined =>
    applyArrangementTimeline(
      liveSet,
      timeline,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
  const timelineFollowsAction = action === "stop";
  let startTimeBeats = timelineFollowsAction ? undefined : writeTimeline();

  // Read before the action, because an action that starts or stops the
  // transport can't read it after: Live updates is_playing asynchronously, so a
  // read in the same request still answers the old state. Those actions predict
  // the new one instead; the ones that leave the transport alone pass this
  // through. The playhead has the same problem, which is why it isn't reported.
  const isPlayingBefore = (liveSet.getProperty("is_playing") as number) > 0;

  const playbackState: PlaybackState = handlePlaybackAction(
    action,
    liveSet,
    {
      sceneIndex: sceneTarget ?? undefined,
      ids: namedIds,
      slotPositions,
    },
    { isPlaying: isPlayingBefore },
  );

  if (timelineFollowsAction) startTimeBeats = writeTimeline();

  // Where the next play begins. Not the playhead: writing this leaves the
  // playhead where it was, and starting playback jumps it here.
  const startTimePosition = readStartTime(
    liveSet,
    action,
    startTimeBeats != null,
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
    isPlaying: playbackState.isPlaying,
    startTime: startTimePosition,
    scene: playbackState.scene,
    // Reported when the call set it, and when it governs what the call did:
    // play-arrangement obeys the loop, and the caller may never have read it.
    reportsLoop:
      action === PLAY_ARRANGEMENT ||
      timeline.loop != null ||
      timeline.loopStart != null ||
      timeline.loopEnd != null,
    namesLoopBounds: timeline.loopStart != null || timeline.loopEnd != null,
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

  if (action === PLAY_ARRANGEMENT) {
    select({ view: "arrangement" });
  } else if (action === "play-scene" || action === "play-session-clips") {
    select({ view: "session" });
  }
}

/**
 * Build the playback result object
 * @param params - Result parameters
 * @param params.isPlaying - Whether playback is active
 * @param params.startTime - Arrangement start position, for arrangement actions
 * @param params.scene - The scene play-scene fired, when the action fired one
 * @param params.reportsLoop - Whether the loop belongs in this result
 * @param params.namesLoopBounds - Whether the call named loopStart or loopEnd
 * @param params.currentLoopStart - Current loop start (post-set actual value)
 * @param params.currentLoopEnd - Current loop end (post-set actual value)
 * @param params.liveSet - The live_set LiveAPI object
 * @returns Playback result
 */
function buildPlaybackResult({
  isPlaying,
  startTime,
  scene,
  reportsLoop,
  namesLoopBounds,
  currentLoopStart,
  currentLoopEnd,
  liveSet,
}: BuildPlaybackResultParams): PlaybackResult {
  const result: PlaybackResult = {
    playing: isPlaying,
    ...(startTime != null && { startTime }),
    // Which scene fired, since a scene id or a clip in it can name it
    ...(scene && { scene }),
  };

  if (!reportsLoop) return result;

  const loopEnabled = (liveSet.getProperty("loop") as number) > 0;

  result.loop = loopEnabled;

  // Bounds are what a loop that's on will do, and what a call that moved them
  // just did. A loop that's off and wasn't moved has none worth the tokens.
  // They're read back after the writes, so a refused write can't be echoed as
  // if it landed.
  if (loopEnabled || namesLoopBounds) {
    result.loopStart = currentLoopStart;
    result.loopEnd = currentLoopEnd;
  }

  return result;
}

/**
 * Stop the transport without letting it move the arrangement start position.
 * @param liveSet - LiveAPI instance for live_set
 * @returns Updated playback state
 */
function stopTransport(liveSet: LiveAPI): PlaybackState {
  const startTimeBeats = liveSet.getProperty("start_time") as number;

  liveSet.call("stop_playing");
  liveSet.set("start_time", startTimeBeats);

  return { isPlaying: false };
}

/**
 * Handle playing specific session clips
 *
 * @param action - Action name for error messages
 * @param liveSet - LiveAPI instance for live_set
 * @param ids - Comma-separated clip IDs
 * @param slotPositions - Resolved clip slots, or null when none given
 * @returns Updated playback state
 */
function handlePlaySessionClips(
  action: string,
  liveSet: LiveAPI,
  ids: string | undefined,
  slotPositions: ClipSlotPosition[] | null,
): PlaybackState {
  const resolvedSlots = resolveClipSlotPositions(ids, slotPositions, action);

  for (const { trackIndex, sceneIndex } of resolvedSlots) {
    const clipSlot = LiveAPI.from(
      livePath.track(trackIndex).clipSlot(sceneIndex),
    );

    if (!clipSlot.exists()) {
      throw new Error(
        `${action} action failed: no clip slot at ${slotPath(trackIndex, sceneIndex)}`,
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

  return { isPlaying: true };
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
        `${action} action failed: track at index ${trackIndex} does not exist`,
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
  const { sceneIndex, ids, slotPositions } = params;

  switch (action) {
    case PLAY_ARRANGEMENT:
      return handlePlayArrangement(liveSet);

    case "update-arrangement":
      // No playback state change, just the loop and follow settings above
      return state;

    case "play-scene":
      return handlePlayScene(sceneIndex);

    case "play-session-clips":
      return handlePlaySessionClips(action, liveSet, ids, slotPositions);

    case "stop-session-clips":
      return handleStopSessionClips(action, ids, slotPositions, state);

    case "stop-all-session-clips":
      liveSet.call("stop_all_clips");

      // the transport/arrangement might still be playing so don't update isPlaying
      return state;

    case "stop":
      // The start position outlives the transport, so stopping puts it back
      // where the caller left it. Live moves it on its own: stopping an
      // already-stopped transport is Live's second press of stop, which sends
      // both the playhead and the start position to the top. A startTime this
      // call carries is written after this, and wins.
      return stopTransport(liveSet);

    default:
      throw new Error(`unknown action "${action}"`);
  }
}
