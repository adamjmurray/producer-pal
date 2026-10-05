// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Making the empty clip at a destination, the one step that puts something new
// in the Set. What it did to the Set is said as it happens (`step.landed`), so a
// later step that throws still leaves an entry that names the clip.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  requireCreatedArrangementClip,
  type SlotWork,
  createInSessionSlot,
} from "#src/tools/clip/helpers/clip-results.ts";
import { arrangementLaneOf } from "#src/tools/shared/arrangement/helpers/arrangement-write-effects.ts";
import {
  resolveTakeLane,
  type ResolvedTakeLane,
  takeLaneLabel,
  takeLanesMadeBy,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import { slotPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type Step } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  createAudioArrangementClip,
  createAudioSessionClip,
} from "../audio-clip-creation.ts";
import { createdClipLength } from "../created-clip-result.ts";
import { type CreatePayload } from "./create-clip-targets.ts";
import { type CreateRun } from "./create-run.ts";
import { type CreateClipCall } from "./parse-create-call.ts";

/** The empty clip a destination got, and where in the Set it sits. */
export interface MadeClip {
  clip: LiveAPI;
  /** What reaching its slot took, for a session clip */
  slotWork: SlotWork | null;
  /** The lane it was written to, for an arrangement clip */
  lane: ArrangementLane | null;
  /** The take lane object, or the track, that the clip was made on */
  laneApi: LiveAPI | null;
  /** The take lanes made on the way to the clip's lane ("l1-l3"), when this
   * is the first clip written to them */
  lanesCreated?: string;
}

/**
 * Make the clip one destination asked for, and say what that changed.
 * @param run - The call's shared state
 * @param step - The call's state for this target
 * @param payload - The target's payload
 * @returns The clip, in the shape Live makes it
 * @throws Error when Live makes no clip
 */
export function makeClip(
  run: CreateRun,
  step: Step<CreateClipCall>,
  payload: CreatePayload,
): MadeClip {
  const { position } = payload;

  return position.sceneIndex == null
    ? makeArrangementClip(run, step, payload)
    : makeSessionClip(step, payload, position.sceneIndex);
}

// --- Helpers below main export ---

/**
 * Make a clip in a session slot, making the scenes up to it and replacing the
 * clip there.
 * @param step - The call's state for this target
 * @param payload - The target's payload
 * @param sceneIndex - The slot's scene
 * @returns The clip, and what reaching its slot took
 */
function makeSessionClip(
  step: Step<CreateClipCall>,
  payload: CreatePayload,
  sceneIndex: number,
): MadeClip {
  const { position, plan, transform } = payload;
  const { trackIndex } = position;
  const liveSet = LiveAPI.from(livePath.liveSet);
  const made = plan.sampleFile
    ? createAudioSessionClip(trackIndex, sceneIndex, plan.sampleFile, liveSet)
    : createInSessionSlot(trackIndex, sceneIndex, liveSet, (clipSlot) =>
        clipSlot.call(
          "create_clip",
          createdClipLength(transform.clipLength, plan.timing.startBeats),
        ),
      );

  // The scenes and the clip it replaced are in the Set once the clip is.
  if (made.created != null) {
    step.landed(`created scenes ${made.created}`);
  }

  step.landed("clip created", {
    id: made.clip.id,
    path: slotPath(trackIndex, sceneIndex),
    ...(made.created == null ? {} : { created: made.created }),
  });

  if (made.overwrote != null) {
    step.landed(made.overwrote);
  }

  return { clip: made.clip, slotWork: made, lane: null, laneApi: null };
}

/**
 * Make a clip on an arrangement lane. Live lays the clip down over whatever
 * the lane held there, so the lane is read first to say afterwards what it cost.
 * @param run - The call's shared state
 * @param step - The call's state for this target
 * @param payload - The target's payload
 * @returns The clip, and the lane it is on
 */
function makeArrangementClip(
  run: CreateRun,
  step: Step<CreateClipCall>,
  payload: CreatePayload,
): MadeClip {
  const { position, plan, transform, track } = payload;
  const lane = arrangementLaneOf(position);
  const resolved =
    position.takeLane == null ? null : resolveRunLane(run, step, payload);
  const takeLane = resolved?.lane ?? null;
  const laneApi = takeLane ?? track;
  const lanesCreated = resolved?.created ?? undefined;

  // Lanes can't be deleted, so the first clip written to them says they exist,
  // whatever happens to the clip.
  if (resolved != null && lanesCreated != null) {
    resolved.created = null;
    step.landed(`take lane ${lanesCreated} made`, { created: lanesCreated });
  }

  const start = position.arrangementStartBeats as number;

  run.ledger.scan(lane, laneApi);

  let clip: LiveAPI;

  try {
    clip = plan.sampleFile
      ? createAudioArrangementClip(
          position.trackIndex,
          start,
          plan.sampleFile,
          takeLane,
          track,
        ).clip
      : createdMidiClip(
          laneApi,
          position,
          start,
          createdClipLength(transform.clipLength, plan.timing.startBeats),
        );
  } catch (error) {
    // Live may have cleared the span before it declined, so what the lane held
    // is no longer known.
    run.ledger.forget(lane);

    throw error;
  }

  // What the call said it writes over is written once the clip is.
  step.coverLanded();
  step.landed("clip created", { id: clip.id, path: objectPathForApi(clip) });

  return { clip, slotWork: null, lane, laneApi, lanesCreated };
}

/**
 * The take lane a clip is written to, made when no clip of the call has
 * reached it yet. A target that never runs makes no lane, so none is left that
 * no entry says.
 * @param run - The call's shared state, which keeps the lanes made so far
 * @param step - The call's state for this target
 * @param payload - The target's payload
 * @returns The lane, and the lanes made for it when this is the first clip there
 */
function resolveRunLane(
  run: CreateRun,
  step: Step<CreateClipCall>,
  payload: CreatePayload,
): ResolvedTakeLane {
  const { position, track } = payload;
  const key = takeLaneLabel(position);
  // Later clips on the lane find it there, whoever made it.
  const known = run.takeLanes.get(key);

  if (known != null) {
    return known;
  }

  try {
    const resolved = resolveTakeLane(
      track,
      position.takeLane as number,
      step.checked.args.takeLaneName ?? null,
    );

    run.takeLanes.set(key, resolved);

    return resolved;
  } catch (error) {
    // Live may have stopped after making some of the lanes. They stay, so the
    // target's entry names them even though it made no clip.
    const made = takeLanesMadeBy(error);

    if (made != null) {
      step.landed(`take lane ${made} made`, { created: made });
    }

    throw error;
  }
}

/**
 * Create an empty MIDI clip on a track or take lane.
 * @param laneApi - The take lane, or the track for its main lane
 * @param position - The destination
 * @param start - Where the clip starts, in beats
 * @param length - How long to make it, in beats
 * @returns The new clip
 * @throws Error when Live made no clip
 */
function createdMidiClip(
  laneApi: LiveAPI,
  position: CreatePayload["position"],
  start: number,
  length: number,
): LiveAPI {
  const created = laneApi.call("create_midi_clip", start, length) as string;

  return requireCreatedArrangementClip(
    created,
    position.trackIndex,
    position.takeLane,
    start,
  );
}
