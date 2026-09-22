// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { applyCodeToSingleClip } from "#src/tools/clip/code-exec/apply-code-to-clip.ts";
import { isDeadlineExceeded } from "#src/tools/clip/helpers/loop-deadline.ts";
import { readLiveSetScaleMask } from "#src/tools/clip/helpers/scale-mask.ts";
import { withClipWarningLabel } from "#src/notation/transform/transform-warning-label.ts";
import { clipCopyBlocker } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { appendReason } from "#src/tools/shared/helpers/entry-reasons.ts";
import {
  takeLaneLabel,
  type TakeLaneTarget,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  arrangementPath,
  slotPath,
} from "#src/tools/shared/validation/helpers/object-paths.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import {
  skipEntry,
  type TargetSkip,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";

import {
  type ArrangementPosition,
  type DestinationRef,
} from "./create-clip-destinations.ts";
import { type ClipPlan } from "./clip-plans.ts";
import { processClipIteration } from "./clip-iteration.ts";
import { type ClipResultObject } from "./created-clip-result.ts";
import {
  type ClipTransformInputs,
  resolveClipTransform,
} from "./clip-transform.ts";
import { type ListEntries } from "#src/tools/shared/validation/lists/list-pairing.ts";
import { booleanForIndex } from "#src/tools/shared/validation/lists/typed-lists.ts";

/** One entry of a create-clip result: a clip, or the destination it never got. */
export type CreatedClipEntry = ClipResultObject | TargetSkip;

export interface CreateClipsParams {
  /** Every destination, in the order the call named it */
  order: DestinationRef[];
  clipSlots: ClipSlotPosition[];
  arrangementPositions: ArrangementPosition[];
  baseName: string | null;
  parsedNames: ListEntries | null;
  parsedColors: ListEntries | null;
  /** What to build at each destination, in call order */
  plans: ClipPlan[];
  liveSet: LiveAPI;
  color: string | null;
  notationString: string | null;
  transformString: string | null;
  songTimeSigNumerator: number;
  songTimeSigDenominator: number;
  deadline: number | null | undefined;
  code: string | null;
  /** Take lane per arrangement destination; no entry means the main lane */
  takeLanes: Map<string, LiveAPI>;
  /** Why each take lane that didn't fit was left out, by destination label */
  droppedTakeLanes: Map<string, string>;
  /** Every destination track, resolved once for the call */
  tracks: Map<number, LiveAPI>;
  /** Requested audio warp state(s), as the caller sent them */
  warping: string | null;
  /** warping split against the positions, or null when one value covers all */
  parsedWarping: ListEntries | null;
  /** Audio clip gain in decibels; omitted leaves it alone */
  gainDb?: number | null;
  /** Audio clip pitch shift in semitones; omitted leaves it alone */
  pitchShift?: number | null;
  /** Audio clip warp mode; omitted leaves it alone */
  warpMode?: string | null;
}

/**
 * Creates one clip per destination, in the order the call named them. A
 * destination that got no clip keeps its place as a skip entry (ADR-0042).
 * @param params - All parameters for clip creation
 * @returns One entry per destination, in call order
 */
export async function createClips(
  params: CreateClipsParams,
): Promise<CreatedClipEntry[]> {
  const { order, deadline } = params;
  const entries: CreatedClipEntry[] = [];
  // Read the scale mask once: it is a Live Set global, and the rest of a
  // clip's transform inputs comes from its own plan.
  const scaleMask =
    params.transformString != null ? readLiveSetScaleMask() : undefined;

  for (const [index, ref] of order.entries()) {
    if (isDeadlineExceeded(deadline ?? null)) {
      refuseUnreached(params, entries, index);
      break;
    }

    entries.push(await createClipAtIndex(params, scaleMask, ref, index));
  }

  return entries;
}

/**
 * The transform inputs for one clip: its own notes, meter and region, plus the
 * Live Set scale the whole call shares.
 * @param params - All parameters for clip creation
 * @param plan - What this destination is being built from
 * @param scaleMask - Live Set scale mask, or undefined when nothing transforms
 * @returns The inputs for this clip's transform
 */
function transformInputsFor(
  params: CreateClipsParams,
  plan: ClipPlan,
  scaleMask: number | undefined,
): ClipTransformInputs {
  return {
    notes: plan.notes,
    clipLength: plan.clipLength,
    transformString: params.transformString,
    isAudio: plan.sampleFile != null,
    endBeats: plan.timing.endBeats,
    timeSigNumerator: plan.timing.timeSigNumerator,
    timeSigDenominator: plan.timing.timeSigDenominator,
    scaleMask,
  };
}

/**
 * The destinations the deadline never reached, each refused in its own entry so
 * the warning only has to say how far the call got.
 * @param params - All parameters for clip creation
 * @param entries - The entries so far, appended to
 * @param step - How many destinations the loop reached
 */
function refuseUnreached(
  params: CreateClipsParams,
  entries: CreatedClipEntry[],
  step: number,
): void {
  for (const ref of params.order.slice(step)) {
    entries.push(
      destinationSkip(
        params,
        ref,
        "not created: the request ran out of time; re-run for this clip",
      ),
    );
  }

  console.warn(
    `Ran out of time after creating ${step} of ${params.order.length} clips. ` +
      `Re-run for the clips whose entries say so.`,
  );
}

/**
 * The entry a destination that got no clip keeps in the result.
 * @param params - All parameters for clip creation
 * @param ref - Which destination it is
 * @param reason - Why it got no clip, in the words a lone destination would throw
 * @returns The skip entry, addressed the way a clip there would report itself
 */
function destinationSkip(
  params: CreateClipsParams,
  ref: DestinationRef,
  reason: string,
): TargetSkip {
  const position = clipPositionLabel(
    ref.view,
    resolveIterationPosition(params, ref),
  );

  return skipEntry({ param: "path", value: position }, reason);
}

interface IterationPosition {
  trackIndex: number;
  sceneIndex: number | null;
  arrangementStartBeats: number | null;
  arrangementStart: string | null;
  takeLane: TakeLaneTarget | null;
}

/**
 * Create the clip one destination asked for, keeping a failure for that
 * destination's own entry to report so the loop carries on.
 * @param params - All parameters for clip creation
 * @param scaleMask - Live Set scale mask, or undefined when nothing transforms
 * @param ref - Which destination this is
 * @param index - The destination's place in the call
 * @returns The clip, or the skip entry standing in for it
 */
async function createClipAtIndex(
  params: CreateClipsParams,
  scaleMask: number | undefined,
  ref: DestinationRef,
  index: number,
): Promise<CreatedClipEntry> {
  const { view } = ref;
  const { baseName, parsedNames, parsedColors, code } = params;
  const plan = params.plans[index] as ClipPlan;
  const transformInputs = transformInputsFor(params, plan, scaleMask);

  // clip.index/clip.count (transforms and code-exec) span the whole create
  // batch: the index is the destination's place in the call, the same place
  // its name and color come from below.
  const totalCount = params.order.length;
  const clipName = getNameForIndex(baseName ?? undefined, index, parsedNames);
  const clipColor = getColorForIndex(
    params.color ?? undefined,
    index,
    parsedColors,
  );
  const pos = resolveIterationPosition(params, ref);
  const position = clipPositionLabel(view, pos);

  // Apply the transform with this clip's context (clipseq/clip.index/etc.).
  // Falls back to the shared notes/length when there is no transform.
  //
  // The clip doesn't exist yet, so a transform warning can't name it by id the
  // way update-clip does. The destination plus the ordinal (which is the
  // clip.index the transform saw) says which one it was.
  const {
    notes: clipNotes,
    clipLength,
    transformedCount,
  } = withClipWarningLabel(
    `clip ${position}${ordinalSuffix(index, totalCount)}`,
    () =>
      resolveClipTransform(
        transformInputs,
        index,
        totalCount,
        pos.arrangementStartBeats,
      ),
  );

  try {
    // Live declines a create the track can't take without reporting anything,
    // and afterwards there is nothing left to say why. The catch below words
    // the refusal as this position's failure.
    // Truthiness, not a null check: it is what picks the audio create below,
    // and an empty sampleFile makes a MIDI clip.
    const blocker = clipCopyBlocker(
      !plan.sampleFile,
      pos.trackIndex,
      params.tracks.get(pos.trackIndex),
    );

    if (blocker != null) {
      throw new Error(blocker);
    }

    const clipResult = processClipIteration(
      view,
      pos.trackIndex,
      pos.sceneIndex,
      pos.arrangementStartBeats,
      clipLength,
      params.liveSet,
      plan.timing.startBeats,
      plan.timing.endBeats,
      plan.timing.firstStartBeats,
      plan.looping,
      clipName,
      clipColor ?? null,
      plan.timing.timeSigNumerator,
      plan.timing.timeSigDenominator,
      params.notationString,
      clipNotes,
      plan.length,
      plan.sampleFile,
      transformedCount,
      // Take lanes apply only to arrangement clips (ignored for session view)
      takeLaneFor(params, pos),
      {
        warping: booleanForIndex(
          params.warping ?? undefined,
          index,
          params.parsedWarping,
        ),
        gainDb: params.gainDb,
        pitchShift: params.pitchShift,
        warpMode: params.warpMode,
      },
      plan.timeSignature,
      params.tracks.get(pos.trackIndex) ?? null,
    );

    // Live hides take lanes until the track's arrow is expanded, so a clip on
    // one looks missing. The entry's path already names the lane.
    if (pos.takeLane != null) {
      appendReason(
        clipResult,
        "expand the take-lanes arrow on the track header in Live to see it",
      );
    }

    // Apply code execution to the newly created clip
    if (code != null) {
      const noteCount = await applyCodeToSingleClip(
        clipResult.id,
        code,
        index,
        totalCount,
      );

      if (noteCount != null) {
        clipResult.noteCount = noteCount;
      }
    }

    return clipResult;
  } catch (error) {
    return skipEntry({ param: "path", value: position }, errorMessage(error));
  }
}

/**
 * Which clip of the batch this is, for a call creating more than one.
 * @param index - 0-based index of this clip across the whole create call
 * @param count - Total clips the call creates
 * @returns ` (3 of 5)`, or "" when the call creates a single clip
 */
function ordinalSuffix(index: number, count: number): string {
  return count > 1 ? ` (${index + 1} of ${count})` : "";
}

/**
 * Where a clip is being created, for warnings raised before it has an id.
 * @param view - "session" or "arrangement"
 * @param pos - The resolved position for this iteration
 * @returns A destination like `t0/s1` or `t0/l1[5|1]`
 */
function clipPositionLabel(view: string, pos: IterationPosition): string {
  if (view === "session") {
    return slotPath(pos.trackIndex, pos.sceneIndex as number);
  }

  return `${arrangementPath(pos.trackIndex, pos.takeLane)}[${pos.arrangementStart}]`;
}

/**
 * Resolve the track/scene or arrangement position one destination names.
 * @param params - All parameters for clip creation
 * @param ref - Which destination it is
 * @returns Position info for this destination
 */
function resolveIterationPosition(
  params: CreateClipsParams,
  ref: DestinationRef,
): IterationPosition {
  if (ref.view === "session") {
    const slot = params.clipSlots[ref.index] as ClipSlotPosition;

    return {
      trackIndex: slot.trackIndex,
      sceneIndex: slot.sceneIndex,
      arrangementStartBeats: null,
      arrangementStart: null,
      takeLane: null,
    };
  }

  const { trackIndex, arrangementStart, takeLane } = params
    .arrangementPositions[ref.index] as ArrangementPosition;

  // Validate the standalone position first so a 0-indexed/zero-bar arrangement
  // start gets the 1-indexing steer (matching the single-clip create path), not
  // a silent pre-origin beat.
  validateBarBeatPosition(arrangementStart);

  return {
    trackIndex,
    sceneIndex: null,
    arrangementStartBeats: barBeatToAbletonBeats(
      arrangementStart,
      params.songTimeSigNumerator,
      params.songTimeSigDenominator,
    ),
    arrangementStart,
    takeLane,
  };
}

/**
 * The take lane a position's clip goes on.
 * @param params - All parameters for clip creation
 * @param position - The position being created
 * @returns The lane, or null for the main lane
 */
function takeLaneFor(
  params: CreateClipsParams,
  position: IterationPosition,
): LiveAPI | null {
  if (position.takeLane == null) {
    return null;
  }

  const label = takeLaneLabel(position);
  const lane = params.takeLanes.get(label);

  // A destination whose lane didn't fit has none to write to. Fail this clip —
  // the loop turns it into this destination's own entry — rather than falling
  // back to the main lane, which would put the clip somewhere the caller
  // didn't ask for.
  if (lane == null) {
    throw new Error(
      params.droppedTakeLanes.get(label) ?? `take lane "${label}" was skipped`,
    );
  }

  return lane;
}
