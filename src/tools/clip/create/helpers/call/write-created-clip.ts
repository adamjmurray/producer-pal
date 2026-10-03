// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One target's turn: make the clip, give it what the call asked for, and put
// what it has to say on the entry. What has landed is journaled as it does, so
// a throw partway keeps the entry for the clip that exists by then.

import { type AudioReadBack } from "#src/tools/clip/helpers/audio-clip-properties.ts";
import { ignoredParamsNote } from "#src/tools/clip/helpers/ignored-params-note.ts";
import { type SlotWork } from "#src/tools/clip/helpers/clip-results.ts";
import { recordLandedClip } from "#src/tools/shared/clip/landings/landing-log.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { keptTimeSignature } from "#src/tools/shared/helpers/live-api-values.ts";
import { readBackDetail } from "#src/tools/shared/helpers/read-back-comparison.ts";
import {
  type AppliedTarget,
  type Step,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { applyCodeToCreatedClip } from "../created-clip-code.ts";
import {
  buildClipResult,
  type ClipResultObject,
} from "../created-clip-result.ts";
import {
  configureAudioClip,
  configureMidiClip,
} from "./configure-created-clip.ts";
import { type CreatePayload } from "./create-clip-targets.ts";
import { type CreateRun } from "./create-run.ts";
import { type MadeClip, makeClip } from "./make-clip.ts";
import { type CreateClipCall } from "./parse-create-call.ts";
import {
  CLIP_IS_AUDIO,
  CLIP_IS_MIDI,
} from "#src/shared/max/ignored-wording.ts";

/**
 * Write one target: make its clip, then give it its name, color, notes and the
 * rest. A throw once the clip exists keeps its entry, with a detail for what
 * did not happen.
 * @param run - The call's shared state
 * @param target - The target
 * @param step - The call's state for this target
 * @returns The target's entry
 */
export async function writeCreatedClip(
  run: CreateRun,
  target: AppliedTarget<CreatePayload>,
  step: Step<CreateClipCall>,
): Promise<ClipResultObject> {
  const payload = target.data;
  const made = makeClip(run, step, payload);
  let entry: ClipResultObject;

  try {
    entry = fillClip(step, made, payload);
  } catch (error) {
    // The clip is in the Set, so what it cost the lane belongs on its entry.
    sayWhatItCost(run, step, made, payload);

    throw error;
  }

  const cost = settleLane(run, made, payload);

  if (cost != null) {
    appendDetail(entry, cost);
  }

  if (payload.position.takeLane != null) {
    // Live hides take lanes until the track's arrow is expanded, so a clip on
    // one looks missing. The entry's path already names the lane.
    appendDetail(
      entry,
      "expand the take-lanes arrow on the track header in Live to see it",
    );
  }

  const { args } = step.checked;

  // What the clip can't use of what was sent, said on its own entry
  for (const note of [
    ...payload.transform.details,
    ...payload.skippedTransforms,
    ignoredParamsNote(...unusableParams(step.checked, payload)),
  ]) {
    if (note != null) {
      appendDetail(entry, note);
    }
  }

  if (args.code != null) {
    await applyCodeToCreatedClip(
      entry,
      args.code,
      payload.index,
      step.checked.destinations.order.length,
    );
    // Code ran across an await, so another request may have edited any lane.
    run.ledger.forgetAll();
  }

  if (payload.plan.timing.firstStartIgnored) {
    appendDetail(entry, "firstStart ignored: set looping: true to use it");
  }

  return entry;
}

// --- Helpers below main export ---

/**
 * Give the new clip what the call asked for and build its entry.
 * @param step - The call's state for this target
 * @param made - The clip
 * @param payload - The target's payload
 * @returns The clip's entry
 */
function fillClip(
  step: Step<CreateClipCall>,
  made: MadeClip,
  payload: CreatePayload,
): ClipResultObject {
  const { plan, transform, ref, position } = payload;
  const { args } = step.checked;
  const { timing } = plan;

  let audioKept: AudioReadBack = {};

  if (plan.sampleFile) {
    audioKept = configureAudioClip(step, made.clip, payload);
  } else {
    configureMidiClip(step, made.clip, payload);
  }

  const entry = buildClipResult(
    made.clip,
    position.trackIndex,
    ref.view,
    position.sceneIndex ?? undefined,
    args.notes ?? null,
    plan.length,
    timing.timeSigNumerator,
    timing.timeSigDenominator,
    plan.sampleFile,
    transform.transformCounts,
    payload.color ?? null,
    args.warping ?? null,
  );

  const keptMeter =
    args.timeSignature == null
      ? undefined
      : keptTimeSignature(
          {
            numerator: timing.timeSigNumerator,
            denominator: timing.timeSigDenominator,
          },
          made.clip.getProperty("signature_numerator"),
          made.clip.getProperty("signature_denominator"),
        );
  const kept = {
    ...(keptMeter == null ? {} : { timeSignature: keptMeter }),
    ...audioKept,
  };
  const keptDetail = readBackDetail(Object.keys(kept));

  Object.assign(entry, kept);

  if (keptDetail != null) {
    appendDetail(entry, keptDetail);
  }

  if (made.slotWork != null) {
    noteSlotWork(entry, made.slotWork);
  }

  if (made.lanesCreated != null) {
    entry.created = made.lanesCreated;
  }

  return entry;
}

/**
 * Say on the new clip's entry what reaching its slot took.
 * @param entry - The new clip's entry
 * @param slotWork - The scenes made, the clip replaced, and any clean-up Live refused
 */
function noteSlotWork(entry: ClipResultObject, slotWork: SlotWork): void {
  if (slotWork.created != null) {
    entry.created = slotWork.created;
  }

  for (const said of [slotWork.overwrote, slotWork.leftover]) {
    if (said != null) {
      appendDetail(entry, said);
    }
  }
}

/**
 * Account for what an arrangement clip did to its lane, once it is in its final
 * shape: what it went over, and where it landed.
 * @param run - The call's shared state
 * @param made - The clip
 * @param payload - The target's payload
 * @returns What it did to the clips already there, or undefined when nothing
 */
function settleLane(
  run: CreateRun,
  made: MadeClip,
  payload: CreatePayload,
): string | undefined {
  const { lane, laneApi, clip } = made;

  if (lane == null) {
    return undefined;
  }

  try {
    const { position } = payload;
    const start = clip.getProperty("start_time");
    const end = clip.getProperty("end_time");

    recordLandedClip(
      run.landings,
      position,
      position.arrangementStartBeats as number,
      {
        id: clip.id,
        length:
          typeof start === "number" && typeof end === "number"
            ? end - start
            : null,
      },
    );

    return run.ledger.afterWrite(lane, [clip.id], {
      api: laneApi ?? undefined,
    });
  } catch (error) {
    // The lane may have changed unseen, so what is known of it is no good.
    run.ledger.forget(lane);

    throw error;
  }
}

/**
 * Journal what a clip whose later step threw cost its lane. Best effort: the
 * throw being handled is the one to report.
 * @param run - The call's shared state
 * @param step - The call's state for this target
 * @param made - The clip
 * @param payload - The target's payload
 */
function sayWhatItCost(
  run: CreateRun,
  step: Step<CreateClipCall>,
  made: MadeClip,
  payload: CreatePayload,
): void {
  try {
    const cost = settleLane(run, made, payload);

    if (cost != null) {
      step.landed(cost);
    }
  } catch {
    // The lane read failed as well; the entry already names the clip.
  }
}

/**
 * The params sent that do nothing on the clip a plan makes.
 * @param call - The create-clip call
 * @param payload - The target's payload
 * @returns The params, and what they were ignored for
 */
function unusableParams(
  call: CreateClipCall,
  payload: CreatePayload,
): [Record<string, unknown>, string] {
  const { args } = call;

  return payload.plan.sampleFile
    ? [
        {
          start: args.start,
          length: args.length,
          looping: args.looping,
          firstStart: args.firstStart,
        },
        `${CLIP_IS_AUDIO}, so the sample defines its region`,
      ]
    : [
        {
          warping: args.warping,
          gainDb: args.gainDb,
          pitchShift: args.pitchShift,
          warpMode: args.warpMode,
        },
        CLIP_IS_MIDI,
      ];
}
