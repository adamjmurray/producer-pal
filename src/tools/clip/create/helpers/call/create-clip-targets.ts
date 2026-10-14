// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The places a call puts clips, and what each clip is made from. N destinations
// named, N entries back, in the order named: one that can't take its clip (no
// such track, a track of the wrong kind, a transform its meter can't read, a
// take lane past the cap) keeps its slot as a skip, and the rest carry what
// their write needs. Reads only; the first write is the pipeline's.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { withClipWarningLabel } from "#src/notation/transform/transform-warning-label.ts";
import { arrangementLaneOf } from "#src/tools/shared/arrangement/helpers/arrangement-write-effects.ts";
import {
  takeLaneLabel,
  takeLaneTargetsThatFit,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  arrangementPositionPath,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import {
  CREATE_TRACK_ADVICE,
  formatObjectPath,
} from "#src/tools/shared/validation/object-path.ts";
import {
  type Cover,
  type Target,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { type ClipPlan } from "../clip-plans.ts";
import {
  type ClipTransformResult,
  resolveClipTransform,
} from "../clip-transform.ts";
import { type DestinationRef } from "../create-clip-destinations.ts";
import { createClipBlocker } from "../create-clip-validation.ts";
import { createdClipLength } from "../created-clip-result.ts";
import {
  type ClipPosition,
  clipPositionLabel,
  resolveClipPosition,
} from "./clip-position.ts";
import { type CreateClipCall } from "./parse-create-call.ts";

/** What one destination of a create-clip call carries into its write. */
export interface CreatePayload {
  ref: DestinationRef;
  /** The destination's place in the call: its name and color pair by it */
  index: number;
  position: ClipPosition;
  plan: ClipPlan;
  track: LiveAPI;
  /** The clip's notes and length once the transform has run, and what it said */
  transform: ClipTransformResult;
  /** What the transform skipped on this kind of clip, for the entry */
  skippedTransforms: string[];
  name: string | undefined;
  color: string | undefined;
}

/** A destination worked out as far as its track and clip plan. */
interface Place {
  ref: DestinationRef;
  index: number;
  position: ClipPosition;
  named: NamedTarget;
  plan: ClipPlan;
  /** Why the destination can't take its clip, when it can't */
  skip: string | undefined;
}

/**
 * Name the call's targets and resolve each now, before the first write.
 * @param call - The create-clip call
 * @returns One target per destination, in the order named
 */
export function createClipTargets(
  call: CreateClipCall,
): Array<Target<CreatePayload>> {
  const tracks = new Map<number, LiveAPI>();
  const places = call.destinations.order.map((ref, index): Place =>
    placeOf(call, ref, index, tracks),
  );
  // Lanes are permanent, so which destinations fit is settled before any is
  // made; one that doesn't fit is that destination's skip.
  const { dropped } = takeLaneTargetsThatFit(
    places.filter(({ skip }) => skip == null).map(({ position }) => position),
  );

  return places.map((place): Target<CreatePayload> => {
    const { named, position } = place;
    const skip =
      place.skip ??
      (position.takeLane == null
        ? undefined
        : dropped.get(takeLaneLabel(position)));

    if (skip != null) {
      return { named, skip };
    }

    return targetFor(call, place, tracks.get(position.trackIndex) as LiveAPI);
  });
}

// --- Helpers below main export ---

/**
 * Work out one destination: where it is, and whether its track takes the clip.
 * @param call - The create-clip call
 * @param ref - Which destination it is
 * @param index - Its place in the call
 * @param tracks - The destination tracks resolved so far, added to
 * @returns The destination, with why it can't take its clip when it can't
 */
function placeOf(
  call: CreateClipCall,
  ref: DestinationRef,
  index: number,
  tracks: Map<number, LiveAPI>,
): Place {
  const position = resolveClipPosition(call.destinations, call.song, ref);
  const plan = call.plans[index] as ClipPlan;
  const { trackIndex } = position;
  const track =
    tracks.get(trackIndex) ?? LiveAPI.from(livePath.track(trackIndex));

  tracks.set(trackIndex, track);

  return {
    ref,
    index,
    position,
    plan,
    named: { param: "path", value: clipPositionLabel(position) },
    skip: !track.exists()
      ? `no track at path "${formatObjectPath({ kind: "track", trackIndex })}"; ${CREATE_TRACK_ADVICE}`
      : // Its meter can't read the transform, or Live would decline the create
        // without saying why: this clip fails, the others go on. Truthiness, not
        // a null check: an empty sampleFile makes a MIDI clip.
        (plan.transformFailure ??
        createClipBlocker(!plan.sampleFile, position, track) ??
        undefined),
  };
}

/**
 * The target for a destination that will be written.
 * @param call - The create-clip call
 * @param place - The destination
 * @param track - Its track
 * @returns The target, carrying what its write needs
 */
function targetFor(
  call: CreateClipCall,
  place: Place,
  track: LiveAPI,
): Target<CreatePayload> {
  const { args, labels, destinations } = call;
  const { ref, index, position, plan, named } = place;
  const total = destinations.order.length;
  const skippedTransforms: string[] = [];
  // The clip doesn't exist yet, so a transform warning can't name it by id the
  // way update-clip does. The destination plus the ordinal (which is the
  // clip.index the transform saw) says which one it was.
  const ordinal = total > 1 ? ` (${index + 1} of ${total})` : "";
  const transform = withClipWarningLabel(
    `clip ${named.value}${ordinal}`,
    () =>
      // clip.index/clip.count span the whole create call: the index is the
      // destination's place in it, the same place its name and color come from.
      resolveClipTransform(
        {
          notes: plan.notes,
          clipLength: plan.clipLength,
          droppedDuplicates: plan.droppedDuplicates,
          transformString: args.transforms ?? null,
          isAudio: Boolean(plan.sampleFile),
          endBeats: plan.timing.endBeats,
          startBeats: plan.timing.startBeats,
          timeSigNumerator: plan.timing.timeSigNumerator,
          timeSigDenominator: plan.timing.timeSigDenominator,
          scaleMask: call.scaleMask,
        },
        index,
        total,
        position.arrangementStartBeats,
      ),
    // What a transform skips on this kind of clip goes on the clip's entry
    (reason) => {
      if (!skippedTransforms.includes(reason)) {
        skippedTransforms.push(reason);
      }
    },
  );

  return {
    named,
    key: keyOf(position),
    covers: coversOf(position, plan, transform.clipLength),
    data: {
      ref,
      index,
      position,
      plan,
      track,
      transform,
      skippedTransforms,
      name: getNameForIndex(args.name ?? undefined, index, labels.parsedNames),
      color: getColorForIndex(
        args.color ?? undefined,
        index,
        labels.parsedColors,
      ),
    },
  };
}

/**
 * What names a destination, whatever the call spelled it as: a slot, or a spot
 * on a lane. Two destinations with one key are one place, and the last wins.
 * @param position - The destination
 * @returns The key
 */
function keyOf(position: ClipPosition): string {
  return position.sceneIndex == null
    ? `${takeLaneLabel(position)}@${(position.arrangementStartBeats as number).toFixed(4)}`
    : slotPath(position.trackIndex, position.sceneIndex);
}

/**
 * The stretch of lane a clip lays down, which a later clip can go over. Nothing
 * for a session clip, which only a later clip in the same slot replaces (its
 * key). Nothing for an audio clip, whose length the sample decides once Live
 * has it.
 * @param position - The destination
 * @param plan - What the clip is made from
 * @param clipLength - Where its region ends, once the transform has run
 * @returns The ground it covers, or undefined when that isn't known up front
 */
function coversOf(
  position: ClipPosition,
  plan: ClipPlan,
  clipLength: number,
): Cover[] | undefined {
  const { arrangementStartBeats: from } = position;

  if (from == null || plan.sampleFile) {
    return undefined;
  }

  return [
    {
      lane: takeLaneLabel(position),
      from,
      to: from + createdClipLength(clipLength, plan.timing.startBeats),
      as: arrangementPositionPath(arrangementLaneOf(position), from),
    },
  ];
}
