// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { idOrPathRequired } from "#src/tools/shared/validation/id-validation.ts";
import { isGroupTrack } from "#src/tools/shared/arrangement/tracks/tracks-inside-group.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  blankTargetIgnores,
  type TargetParams,
} from "#src/tools/shared/validation/lists/target-lists.ts";
import { runWrite } from "#src/tools/shared/write-pipeline/write-pipeline.ts";
import {
  type AppliedTarget,
  type Call,
  type Done,
  type PipelineResult,
  type Step,
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
  firedGroupSlotDetail,
  stoppedGroupSlotDetail,
} from "./helpers/playback/group-slot-effects.ts";
import {
  handlePlayScene,
  type FiredScene,
  type PlaybackState,
} from "./helpers/playback/scene-playback.ts";
import {
  actionReadsTimeline,
  refusePlaybackParamsOutsideAction,
} from "./helpers/playback/playback-action-params.ts";
import { resolvePlaybackTarget } from "./helpers/playback/playback-target.ts";
import {
  type ClipSlotEntry,
  type SlotPayload,
} from "./helpers/playback/session-clip-targets.ts";
import { select } from "./select.ts";

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
  /** One entry per clip slot named, in order; a lone one is unwrapped */
  clip?: PipelineResult<ClipSlotEntry>;
}

/** What the hooks learn about the call as a whole, for the result. */
interface PlaybackOutcome {
  playing: boolean;
  startTime?: string;
  scene?: FiredScene;
  loop: ReturnType<typeof reportArrangementLoop>;
}

/** The call, and the place its hooks leave what the result reports. */
interface PlaybackRun {
  args: PlaybackArgs;
  outcome: PlaybackOutcome;
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
interface PlaybackChecked extends PlaybackCall {
  liveSet: LiveAPI;
  /** Read before the action: Live updates is_playing asynchronously */
  isPlayingBefore: boolean;
  /** The timeline, resolved before anything was written */
  plan: TimelinePlan;
  writes: TimelineWrites;
  state: PlaybackState;
  /** The tracks stop-session-clips has already stopped */
  stopped: Set<number>;
}

const PLAY_SESSION_CLIPS = "play-session-clips";
const PLAY_SCENE = "play-scene";
const STOP = "stop";
const SESSION_CLIP_ACTIONS = [PLAY_SESSION_CLIPS, "stop-session-clips"];

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
 * @returns Result with transport state
 */
export function playback(
  args: PlaybackArgs = {},
  ctx: Partial<ToolContext> = {},
): PlaybackResult {
  const run: PlaybackRun = { args, outcome: { playing: false, loop: {} } };
  // No hook awaits, so the answer is never a promise.
  const clip = runWrite(
    PLAYBACK_WRITE,
    run,
    ctx,
  ) as PipelineResult<ClipSlotEntry>;
  const { playing, startTime, scene, loop } = run.outcome;

  return {
    playing,
    ...(startTime != null && { startTime }),
    // Which scene fired, since a scene id or a clip in it can name it
    ...(scene && { scene }),
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
  write: writeClip,
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
    throw new Error(idOrPathRequired(call.action));
  }

  if (call.action !== PLAY_SESSION_CLIPS) {
    return call.clips;
  }

  return call.clips.map((target) =>
    target.skip == null && playsNothing(target.data.slot)
      ? { named: target.named, skip: "no clip to play" }
      : target,
  );
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
 * loop bound that can't be read refuses the call whatever the action.
 * @param call - The call
 * @returns The call with what the hooks share
 */
function checkPlayback(call: PlaybackCall): PlaybackChecked {
  const liveSet = LiveAPI.from(livePath.liveSet);

  return {
    ...call,
    liveSet,
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
 */
function beforeTargets(checked: PlaybackChecked, call: Call): void {
  const { action, liveSet, plan, sceneIndex } = checked;

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
      checked.state = handlePlayScene(sceneIndex ?? undefined);
      call.landed("scene fired");
      break;

    case "stop-all-session-clips":
      // The transport/arrangement might still be playing, so isPlaying stays.
      liveSet.call("stop_all_clips");
      call.landed("session clips stopped");
      break;

    case STOP:
      // The start position outlives the transport, so stopping puts it back
      // where the caller left it. A startTime this call carries is written
      // after this, and wins.
      checked.state = stopTransport(liveSet, call.landed);
      break;

    default:
  }
}

/**
 * Fire or stop one clip slot.
 * @param target - The slot
 * @param step - The call's state for this target
 * @returns The slot's entry: its clip, when it holds one, and where it is
 */
function writeClip(
  target: AppliedTarget<SlotPayload>,
  step: Step<PlaybackChecked>,
): ClipSlotEntry {
  const { slot, position, path } = target.data;
  const { action, stopped } = step.checked;
  const clip = slot.child("clip");
  const clipId = clip.exists() ? clip.id : undefined;
  let detail: string | undefined;

  if (action === PLAY_SESSION_CLIPS) {
    // A group track's slot holds no clip. Read what it reaches before firing.
    if (clipId == null && slot.getProperty("controls_other_clips")) {
      detail = firedGroupSlotDetail(
        LiveAPI.from(livePath.track(position.trackIndex)),
        position.sceneIndex,
      );
    }

    slot.call("fire");
    step.call.landed("session clips fired");
  } else if (!stopped.has(position.trackIndex)) {
    const track = LiveAPI.from(livePath.track(position.trackIndex));

    if (isGroupTrack(track)) {
      detail = stoppedGroupSlotDetail(track);
    }

    // A track stops all its clips at once, so two slots on it are one Live call.
    track.call("stop_all_clips");
    // Only once it went through: after a throw, the next slot tries again.
    stopped.add(position.trackIndex);
    step.call.landed("session clips stopped");
  }

  return {
    ...(clipId != null && { id: clipId }),
    path,
    ...(detail != null && { detail }),
  };
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

  if (action === PLAY_SESSION_CLIPS) {
    const fired = done.outcomes.filter((outcome) => outcome === "written");

    // Clips fired after the first are subject to launch quantization, so
    // restart the transport to keep them in sync.
    if (fired.length > 1) {
      liveSet.call("stop_playing");
      call.landed("transport stopped");
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
    loop: reportArrangementLoop(
      liveSet,
      action,
      timeline,
      checked.writes.wroteLoop,
    ),
  };
}

/**
 * Handle focus (view switching) if requested
 * @param action - The playback action
 * @param focus - Whether to focus
 */
function handleFocus(action: string, focus?: boolean): void {
  if (!focus) {
    return;
  }

  if (action === PLAY_ARRANGEMENT) {
    select({ view: "arrangement" });
  } else if (action === PLAY_SCENE || action === PLAY_SESSION_CLIPS) {
    select({ view: "session" });
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
