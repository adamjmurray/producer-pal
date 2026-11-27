// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import { idOrPathRequired } from "#src/tools/shared/validation/id-validation.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  blankTargetIgnores,
  type TargetParams,
} from "#src/tools/shared/validation/lists/target-lists.ts";
import { awaitLaunchWindow } from "./helpers/playback/synced-launch.ts";
import { runWrite } from "#src/tools/shared/write-pipeline/write-pipeline.ts";
import {
  type Call,
  type Done,
  type MaybePromise,
  type PipelineResult,
  type Target,
  type WriteSpec,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  foldLocatorParams,
  handlePlayArrangement,
  planArrangementTimeline,
  PLAY_ARRANGEMENT,
  readStartTime,
  reportArrangementLoop,
  writeArrangementTimeline,
  type ArrangementParams,
  type TimelinePlan,
  type TimelineWrites,
} from "./helpers/playback/arrangement-playback.ts";
import {
  handlePlayScene,
  sceneToPlay,
  type FiredScene,
  type PlaybackState,
} from "./helpers/playback/scene-playback.ts";
import {
  actionReadsTimeline,
  refusePlaybackParamsOutsideAction,
} from "./helpers/playback/playback-action-params.ts";
import { resolvePlaybackTarget } from "./helpers/playback/playback-target.ts";
import {
  CLIPS_STOPPED,
  FIRE_ACTIONS,
  PLAY_SESSION_CLIPS,
  PLAY_SYNCED,
  syncedLaunchFor,
  syncReport,
  writeSessionClip,
  type ClipWriteState,
} from "./helpers/playback/session-clip-writes.ts";
import {
  type ClipSlotEntry,
  type SlotPayload,
  trackPlayCover,
} from "./helpers/playback/session-clip-targets.ts";

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
  /** Absent when the final step failed: the call can't say what is playing */
  playing?: boolean;
  startTime?: string;
  loop?: boolean;
  loopStart?: string;
  loopEnd?: string;
  scene?: FiredScene;
  /** play-session-clips-synced: when the clips start, or why they aren't synced */
  sync?: string;
  /** One entry per clip slot named, in order; a lone one is unwrapped */
  clip?: PipelineResult<ClipSlotEntry>;
}

/** What the hooks learn about the call as a whole, for the result. */
interface PlaybackOutcome {
  playing: boolean;
  startTime?: string;
  scene?: FiredScene;
  sync?: string;
  loop: ReturnType<typeof reportArrangementLoop>;
}

/** The call, and the place its hooks leave what the result reports. */
interface PlaybackRun {
  args: PlaybackArgs;
  /** Set only once the final step finishes; until then there is nothing true to report */
  outcome?: PlaybackOutcome;
}

/** The call, read once. */
interface PlaybackCall {
  run: PlaybackRun;
  action: string;
  /** The timeline params, with locators already folded in */
  timeline: ArrangementParams;
  sceneIndex: number | null;
  clips: Array<Target<SlotPayload>>;
  /** The target params as sent, for a blank one to be reported */
  sent: TargetParams;
  focus?: boolean;
}

/** What the call shares between its hooks. */
interface PlaybackChecked extends PlaybackCall, ClipWriteState {
  liveSet: LiveAPI;
  /** Read before the action: Live updates is_playing asynchronously */
  isPlayingBefore: boolean;
  /** The timeline, resolved before anything was written */
  plan: TimelinePlan;
  writes: TimelineWrites;
  state: PlaybackState;
}

const PLAY_SCENE = "play-scene";
const STOP = "stop";
const SESSION_CLIP_ACTIONS = [...FIRE_ACTIONS, "stop-session-clips"];

const ACTIONS = new Set([
  PLAY_ARRANGEMENT,
  "update-arrangement",
  PLAY_SCENE,
  "stop-all-session-clips",
  STOP,
  ...SESSION_CLIP_ACTIONS,
]);

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
 * @param ctx - Internal context object, for the request deadline
 * @returns Result with transport state; a synced launch that has to wait for
 *   its loop start answers as a promise
 */
export function playback(
  args: PlaybackArgs & { action: typeof PLAY_SYNCED },
  ctx?: Partial<ToolContext>,
): MaybePromise<PlaybackResult>;
/**
 * Every other action answers at once.
 * @param args - Tool arguments
 * @param ctx - Internal context object, for the request deadline
 * @returns Result with transport state
 */
export function playback(
  args?: PlaybackArgs,
  ctx?: Partial<ToolContext>,
): PlaybackResult;

/**
 * @param args - Tool arguments
 * @param ctx - Internal context object, for the request deadline
 * @returns Result with transport state, as a promise only when a synced launch
 *   had to wait for its loop start
 */
export function playback(
  args: PlaybackArgs = {},
  ctx: Partial<ToolContext> = {},
): MaybePromise<PlaybackResult> {
  const run: PlaybackRun = { args };

  const clip = runWrite(PLAYBACK_WRITE, run, ctx);

  // Only a synced launch that has to wait for its loop start awaits.
  return clip instanceof Promise
    ? clip.then((entries) => playbackResult(run, entries))
    : playbackResult(run, clip);
}

/**
 * @param run - The call, once it has run
 * @param clip - What the pipeline answered: an entry per clip slot named
 * @returns What the tool answers
 */
function playbackResult(
  run: PlaybackRun,
  clip: PipelineResult<ClipSlotEntry>,
): PlaybackResult {
  // Missing when the final step threw: leave out what only it can say.
  const { playing, startTime, scene, sync, loop } = run.outcome ?? {};

  return {
    ...(playing != null && { playing }),
    ...(startTime != null && { startTime }),
    // Which scene fired, since a scene id or a clip in it can name it
    ...(scene && { scene }),
    ...(sync != null && { sync }),
    // One entry per clip slot the call named, in the order it named them
    ...(Array.isArray(clip) && clip.length === 0 ? {} : { clip }),
    ...loop,
  };
}

const PLAYBACK_WRITE: WriteSpec<
  PlaybackRun,
  PlaybackCall,
  SlotPayload,
  PlaybackChecked,
  ClipSlotEntry
> = {
  tool: "ppal-playback",
  words: { rerun: "clip" },
  parse: parsePlayback,
  targets: playbackTargets,
  check: checkPlayback,
  before: beforeTargets,
  write: writeSessionClip,
  settle: settlePlayback,
};

// --- Helpers below main export ---

/**
 * Read the call, refusing one that is malformed before anything is written.
 * @param run - The call
 * @returns The call, with its targets and timeline resolved
 */
function parsePlayback(run: PlaybackRun): PlaybackCall {
  const { args } = run;
  const { action } = args;

  if (!action) {
    throw new Error("action is required");
  }

  refusePlaybackParamsOutsideAction(action, args);

  const { sceneIndex, clips } = resolvePlaybackTarget(action, args);

  const timeline = foldLocatorParams(
    actionReadsTimeline(action)
      ? {
          startTime: args.startTime,
          startLocator: args.startLocator,
          loop: args.loop,
          loopStart: args.loopStart,
          loopStartLocator: args.loopStartLocator,
          loopEnd: args.loopEnd,
          loopEndLocator: args.loopEndLocator,
        }
      : {},
  );

  if (!ACTIONS.has(action)) {
    throw new Error(`unknown action "${action}"`);
  }

  return {
    run,
    action,
    timeline,
    sceneIndex,
    clips,
    sent: { id: args.id, ids: args.ids, path: args.path, paths: args.paths },
    focus: args.focus,
  };
}

/**
 * The clip slots the action acts on: none for an action that acts on the
 * transport alone. An empty slot is skipped when playing: firing it would stop
 * whatever else its track is playing.
 * @param call - The call
 * @returns One target per clip slot named, in the order named
 * @throws Error when a clip action names no slot
 */
function playbackTargets(call: PlaybackCall): Array<Target<SlotPayload>> {
  if (!SESSION_CLIP_ACTIONS.includes(call.action)) {
    return [];
  }

  if (call.clips.length === 0) {
    throw new Error(idOrPathRequired("clip", call.action));
  }

  if (!FIRE_ACTIONS.includes(call.action)) {
    return call.clips;
  }

  return call.clips.map((target) => {
    if (target.skip != null) {
      return target;
    }

    return playsNothing(target.data.slot)
      ? { named: target.named, skip: "no clip to play" }
      : { ...target, covers: [trackPlayCover(target.data.path)] };
  });
}

/**
 * Whether firing a slot launches nothing. A group track's slot holds no clip
 * but launches its children's clips in that scene, so it plays.
 * @param slot - The clip slot
 * @returns True when the slot has no clip and controls no other clips
 */
function playsNothing(slot: LiveAPI): boolean {
  return (
    !slot.getProperty("has_clip") && !slot.getProperty("controls_other_clips")
  );
}

/**
 * Resolve the timeline, which reads Live but writes nothing, so a position or
 * loop bound that can't be read refuses the call whatever the action. So does
 * play-scene with no scene to fire. A synced launch also works out here where
 * the clips are to start, and refuses when it can't.
 * @param call - The call
 * @param targets - The clip slots the call acts on
 * @param shared - The call's shared state, for the request deadline
 * @param shared.ctx - The request's context
 * @returns The call with what the hooks share
 */
function checkPlayback(
  call: PlaybackCall,
  targets: Array<Target<SlotPayload>>,
  { ctx }: Call,
): PlaybackChecked {
  const liveSet = LiveAPI.from(livePath.liveSet);

  if (call.action === PLAY_SCENE) {
    sceneToPlay(call.sceneIndex);
  }

  return {
    ...call,
    liveSet,
    ...(call.action === PLAY_SYNCED && {
      launch: syncedLaunchFor(liveSet, targets, ctx.deadline),
    }),
    plan: planArrangementTimeline(liveSet, call.timeline),
    isPlayingBefore: false,
    writes: { wroteLoop: false },
    state: { isPlaying: false },
    stopped: new Set(),
  };
}

/**
 * Write the timeline and run the actions that take no clip slot, before any
 * slot is touched. The timeline goes first, except on stop: Live's own second
 * stop sends the start position to the top, wiping one written first.
 * @param checked - The checked call
 * @param call - The call's shared state
 * @returns Nothing, as a promise only when a synced launch has to wait
 */
function beforeTargets(
  checked: PlaybackChecked,
  call: Call,
): MaybePromise<void> {
  const { action, liveSet, plan, sceneIndex, launch } = checked;

  checked.writes =
    action === STOP
      ? { wroteLoop: false }
      : writeArrangementTimeline(liveSet, plan, call.landed);

  // Read before the action: Live updates is_playing asynchronously, so an
  // action that starts or stops the transport can't read it after, and predicts
  // the new state instead. The playhead has the same problem, so it isn't
  // reported at all.
  checked.isPlayingBefore = (liveSet.getProperty("is_playing") as number) > 0;
  checked.state = { isPlaying: checked.isPlayingBefore };

  switch (action) {
    case PLAY_ARRANGEMENT:
      checked.state = handlePlayArrangement(liveSet, call.landed);
      break;

    case PLAY_SCENE:
      checked.state = handlePlayScene(sceneIndex);
      call.landed("scene fired");
      break;

    case "stop-all-session-clips":
      // The transport/arrangement might still be playing, so isPlaying stays.
      liveSet.call("stop_all_clips");
      call.landed(CLIPS_STOPPED);
      break;

    case STOP:
      // The start position outlives the transport, so stopping puts it back
      // where the caller left it. A startTime this call carries is written
      // after this, and wins.
      checked.state = stopTransport(liveSet, call.landed);
      break;

    case PLAY_SYNCED:
      return launch && awaitLaunchWindow(liveSet, launch);

    default:
  }
}

/**
 * Once every slot has had its turn: finish the transport, write the timeline
 * a stop leaves for last, and gather what the result reports.
 * @param done - What the call did
 * @param call - The call's shared state
 */
function settlePlayback(
  done: Done<SlotPayload, PlaybackChecked, ClipSlotEntry>,
  call: Call,
): void {
  const { checked } = done;
  const { action, liveSet, plan, timeline, sceneIndex } = checked;
  let { isPlaying } = checked.state;

  if (FIRE_ACTIONS.includes(action)) {
    const fired = done.outcomes.filter((outcome) => outcome === "written");

    // Clips fired after the first are subject to launch quantization, so
    // restart the transport to keep them in sync. A synced launch only does
    // from a stopped transport: it must not restart what is playing.
    if (
      fired.length > 1 &&
      (action === PLAY_SESSION_CLIPS || !checked.isPlayingBefore)
    ) {
      stopTransport(liveSet, call.landed);
      liveSet.call("start_playing");
    }

    // Nothing fired leaves the transport where it was, so don't claim a launch.
    isPlaying = fired.length > 0 || checked.isPlayingBefore;
  }

  if (action === STOP) {
    checked.writes = writeArrangementTimeline(liveSet, plan, call.landed);
  }

  // Said once the action ran: it claims what the call did.
  for (const { param, why } of blankTargetIgnores(
    checked.sent,
    sceneIndex == null ? "clips" : "scene",
    sceneIndex == null ? done.targets.length : 1,
  )) {
    call.ignored(param, why);
  }

  // Where the next play begins. Not the playhead: writing this leaves the
  // playhead where it was, and starting playback jumps it here.
  const startTime = readStartTime(liveSet, action, {
    ...checked.writes,
    startTime: timeline.startTime,
  });

  handleFocus(action, checked.focus);

  checked.run.outcome = {
    playing: isPlaying,
    startTime,
    scene: checked.state.scene,
    sync: syncReport(checked),
    loop: reportArrangementLoop(
      liveSet,
      action,
      timeline,
      checked.writes.wroteLoop,
    ),
  };
}

/**
 * Handle focus (view switching) if requested. A failed switch warns: the
 * transport has already changed, and the result must still say so.
 * @param action - The playback action
 * @param focus - Whether to focus
 */
function handleFocus(action: string, focus?: boolean): void {
  if (!focus) {
    return;
  }

  if (action === PLAY_ARRANGEMENT) {
    focusSelect({ view: "arrangement" });
  } else if (action === PLAY_SCENE || FIRE_ACTIONS.includes(action)) {
    focusSelect({ view: "session" });
  }
}

/**
 * Stop the transport without letting it move the arrangement start position.
 * @param liveSet - LiveAPI instance for live_set
 * @param landed - Records what has changed Live, for an error later in the call
 * @returns Updated playback state
 */
function stopTransport(
  liveSet: LiveAPI,
  landed: (phrase: string) => void,
): PlaybackState {
  const startTimeBeats = liveSet.getProperty("start_time") as number;

  liveSet.call("stop_playing");
  landed("transport stopped");
  liveSet.set("start_time", startTimeBeats);

  return { isPlaying: false };
}
