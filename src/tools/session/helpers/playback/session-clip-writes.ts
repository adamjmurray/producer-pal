// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { isGroupTrack } from "#src/tools/shared/arrangement/tracks/tracks-inside-group.ts";
import {
  fireSynced,
  syncedLaunch,
  type SyncedLaunch,
} from "./synced-launch.ts";
import { isReturnSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import {
  type AppliedTarget,
  type Step,
  type Target,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  firedGroupSlotDetail,
  stoppedGroupSlotDetail,
} from "./group-slot-effects.ts";
import {
  type ClipSlotEntry,
  type SlotPayload,
} from "./session-clip-targets.ts";

export const PLAY_SESSION_CLIPS = "play-session-clips";
export const PLAY_SYNCED = "play-session-clips-synced";
/** The actions that fire clip slots */
export const FIRE_ACTIONS = [PLAY_SESSION_CLIPS, PLAY_SYNCED];
export const CLIPS_STOPPED = "session clips stopped";

const CLIPS_FIRED = "session clips fired";

/** What writing a clip slot reads and records on the call. */
export interface ClipWriteState {
  action: string;
  liveSet: LiveAPI;
  /** The tracks stop-session-clips has already stopped, by Live path */
  stopped: Set<string>;
  /** play-session-clips-synced: where the clips are to start */
  launch?: SyncedLaunch;
  /** Seconds until the synced clips start, once one has fired in sync */
  startsIn?: number;
}

/**
 * Fire or stop one clip slot.
 * @param target - The slot
 * @param step - The call's state for this target
 * @returns The slot's entry: its clip, when it holds one, and where it is
 */
export function writeSessionClip(
  target: AppliedTarget<SlotPayload>,
  step: Step<ClipWriteState>,
): ClipSlotEntry {
  const { slot, position, path } = target.data;
  const clip = slot.child("clip");
  const clipId = clip.exists() ? clip.id : undefined;
  const detail = FIRE_ACTIONS.includes(step.checked.action)
    ? fireClipSlot(slot, position, clipId, step)
    : stopClipSlot(position, step);

  return {
    ...(clipId != null && { id: clipId }),
    path,
    ...(detail != null && { detail }),
  };
}

/**
 * Work out where a synced launch's clips are to start. Only a slot with a clip
 * of its own on a regular track can sync, so a call with none waits for nothing.
 * @param liveSet - The live_set object
 * @param targets - The clip slots the call acts on
 * @param deadline - When the request must finish, if it says
 * @returns Where to start, or nothing when no slot will fire
 * @throws Error when the playing loops leave no loop start to reach
 */
export function syncedLaunchFor(
  liveSet: LiveAPI,
  targets: Array<Target<SlotPayload>>,
  deadline?: number | null,
): SyncedLaunch | undefined {
  if (targets.every((target) => target.skip != null)) {
    return undefined;
  }

  const tracks = targets.flatMap((target) =>
    target.skip == null &&
    !isReturnSlotPosition(target.data.position) &&
    target.data.slot.getProperty("has_clip")
      ? [target.data.position.trackIndex]
      : [],
  );

  return tracks.length > 0
    ? syncedLaunch(liveSet, tracks, deadline)
    : { unsynced: "a group or return slot has no clip to sync" };
}

/**
 * What a synced launch says of its timing.
 * @param checked - The call, once its slots have fired
 * @returns The line for the result, or nothing for other actions
 */
export function syncReport(checked: ClipWriteState): string | undefined {
  const { launch, startsIn } = checked;

  if (launch == null) {
    return undefined;
  }

  if (startsIn != null) {
    return `starts in ${startsIn}s, when ${launch.reference} loops`;
  }

  if (launch.startBeat != null) {
    return "nothing fired in sync";
  }

  return launch.unsynced ?? "no loop playing to sync to";
}

// --- Helpers below main exports ---

/**
 * @param slot - The clip slot
 * @param position - Where it is
 * @param clipId - Its clip's id, when it holds one
 * @param step - The call's state for this target
 * @returns What to say of what the fire did beyond launching the clip
 */
function fireClipSlot(
  slot: LiveAPI,
  position: SlotPayload["position"],
  clipId: string | undefined,
  step: Step<ClipWriteState>,
): string | undefined {
  // A return track's slot only ever holds an envelope clip, and nothing is
  // known of how one takes a launch quantization: it fires plainly.
  if (isReturnSlotPosition(position)) {
    return fireSlot(slot, step, false);
  }

  let detail: string | undefined;

  // A group track's slot holds no clip. Read what it reaches before firing.
  if (clipId == null && slot.getProperty("controls_other_clips")) {
    detail = firedGroupSlotDetail(
      LiveAPI.from(livePath.track(position.trackIndex)),
      position.sceneIndex,
    );
  }

  const unsynced = fireSlot(slot, step, true);

  return unsynced == null || detail == null
    ? (detail ?? unsynced)
    : `${detail}; ${unsynced}`;
}

/**
 * Fire one clip slot, in sync with the playing loops when the action asks.
 * @param slot - The clip slot
 * @param step - The call's state for this target
 * @param syncable - Whether the slot's clip can be fired in sync
 * @returns What to say of a slot that fired without the sync asked for
 */
function fireSlot(
  slot: LiveAPI,
  step: Step<ClipWriteState>,
  syncable: boolean,
): string | undefined {
  const { checked } = step;
  const { launch } = checked;
  const wantsSync = launch?.startBeat != null;
  let startsIn: number | null = null;

  if (launch != null && wantsSync && syncable) {
    startsIn = fireSynced(checked.liveSet, slot, launch);
  } else {
    slot.call("fire");
  }

  if (startsIn != null) {
    checked.startsIn = startsIn;
  }

  step.call.landed(CLIPS_FIRED);
  step.coverLanded();

  return wantsSync && startsIn == null ? "fired without sync" : undefined;
}

/**
 * @param position - Where the slot is
 * @param step - The call's state for this target
 * @returns What stopping a group track's slot did to the tracks inside it
 */
function stopClipSlot(
  position: SlotPayload["position"],
  step: Step<ClipWriteState>,
): string | undefined {
  if (isReturnSlotPosition(position)) {
    stopTrackOnce(
      LiveAPI.from(livePath.returnTrack(position.returnIndex)),
      step,
    );

    return undefined;
  }

  const track = LiveAPI.from(livePath.track(position.trackIndex));
  const detail =
    !step.checked.stopped.has(track.path) && isGroupTrack(track)
      ? stoppedGroupSlotDetail(track)
      : undefined;

  stopTrackOnce(track, step);

  return detail;
}

/**
 * Stop every clip on a track, unless this call already has. A track stops all
 * its clips at once, so two slots on it are one Live call. Not ClipSlot.stop or
 * Clip.stop: they can't cancel a queued launch, on a return track either.
 * @param track - The track, regular or return
 * @param step - The slot's step in the call
 */
function stopTrackOnce(track: LiveAPI, step: Step<ClipWriteState>): void {
  const { stopped } = step.checked;

  if (stopped.has(track.path)) {
    return;
  }

  track.call("stop_all_clips");
  // Only once it went through: after a throw, the next slot tries again.
  stopped.add(track.path);
  step.call.landed(CLIPS_STOPPED);
}
