// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One target's turn: its clip's update, then wherever the call sends it. What
// the clip has to say beyond its result is collected as the update goes and put
// on the entry at the end; what has landed is journaled as it does, so a throw
// partway keeps the entry for what exists by then.

import { errorMessage } from "#src/shared/error-message.ts";
import { isDeadlineExceeded } from "#src/shared/max/v8-request-deadline.ts";
import { applyClipConvert } from "#src/tools/clip/convert/apply-clip-convert.ts";
import { applyClipEnvelopes } from "#src/tools/clip/envelopes/apply-clip-envelopes.ts";
import {
  buildClipResultObject,
  type ClipResult,
} from "#src/tools/clip/helpers/clip-results.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { withPieces } from "#src/tools/shared/write-pipeline/entry-pieces.ts";
import { landedDetail } from "#src/tools/shared/write-pipeline/landed-detail.ts";
import {
  type AppliedTarget,
  type Step,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { writtenOverBy } from "#src/tools/shared/clip/landings/landing-log.ts";
import { objectIsGone } from "#src/tools/shared/write-pipeline/object-is-gone.ts";
import {
  type ProcessSingleClipUpdateParams,
  processSingleClipUpdate,
} from "../batch/process-single-clip-update.ts";
import {
  clipIgnoredParams,
  clipLandedNothing,
  refuseClipWork,
  reportClipReasons,
} from "../entries/clip-reasons.ts";
import { applyCodeToWrittenClips } from "./apply-clip-code.ts";
import { type ClipRun } from "./clip-run.ts";
import { cutClip } from "./cut-clip.ts";
import { type ClipCall } from "./parse-clip-call.ts";
import { type ClipPlanned } from "./plan-clip-moves.ts";
import { type ClipPayload } from "./resolve-clip-targets.ts";

/** Where the clip goes and how long it is to be, once the plan has weighed in. */
type Motion = Pick<ClipPayload, "destination" | "startBeats" | "lengthBeats">;

/** What one target's write answers. */
type Written = ClipResult | ReturnType<typeof withPieces<ClipResult>>;

/**
 * Params that write to the clip itself, whatever the call does with its position.
 * One of these is what makes a refused move a reason on a real entry, not a skip.
 */
const CONTENT_PARAMS = [
  "notes",
  "transforms",
  "preTransforms",
  "name",
  "color",
  "timeSignature",
  "start",
  "length",
  "firstStart",
  "looping",
  "duplicateLoop",
  "gainDb",
  "pitchShift",
  "warpMode",
  "warping",
  "warpOp",
  "warpBeatTime",
  "warpSampleTime",
  "warpDistance",
  "quantize",
  "quantizeGrid",
  "quantizePitch",
  "code",
  "envelopes",
  "convert",
] as const satisfies ReadonlyArray<keyof ClipCall["args"]>;

/**
 * Write one target: cut its clip if asked, then update it, or each piece.
 * @param run - The call's shared state
 * @param target - The target, which names a clip
 * @param step - The call's state for this target
 * @returns The target's entry, and the entries of any piece or tile after it
 */
export async function writeClip(
  run: ClipRun,
  target: AppliedTarget<ClipPayload>,
  step: Step<ClipCall, ClipPlanned>,
): Promise<Written> {
  const { clip, refusedMove } = target.data;
  const { reasons } = run;
  const { planned, index } = step;
  const progress = { moved: false, resized: false };

  // Said as it happens, and kept for this target's entry if a throw follows.
  reasons.journal = (phrase, partial) => {
    progress.moved ||= phrase.startsWith("copy at");
    progress.resized ||= phrase === "lengthened" || phrase === "shortened";
    step.landed(phrase, partial);
  };

  try {
    // Something earlier in the call cleared it, and nothing it asked can land.
    if (objectIsGone(clip)) {
      const by = writtenOverBy(
        target.data.span ?? undefined,
        run.landings.written,
      );

      throw new Error(
        `not updated: the clip was overwritten earlier in this call${by == null ? "" : " by " + by}`,
      );
    }

    if (refusedMove != null) {
      refuseClipWork(reasons, clip.id, refusedMove);
    }

    const motion = motionFor(run, target.data, step);
    const { split } = step.checked;
    const pieces = split == null ? [clip] : cutClip(run, clip, split);
    const results: ClipResult[] = [];

    for (const [position, piece] of pieces.entries()) {
      results.push(
        ...(await updatePiece(run, { piece, position, pieces, motion, step })),
      );
    }

    const [first, ...rest] = results as [ClipResult, ...ClipResult[]];

    return rest.length === 0 ? first : withPieces(first, rest);
  } finally {
    // A move that was to free its span and didn't leaves whatever waits on that
    // span with nowhere to go.
    if (planned.vacates && !progress.moved) {
      run.stayed.add(index);
    }

    // What the call said it writes over is only written when the copy landed,
    // or a resize that stays put did (a slot beside a length is ignored, so
    // that clip stays put too). A refused move, or one a throw stopped short,
    // wrote over nothing, so no earlier target was replaced by it.
    if (progress.moved || (progress.resized && !planned.vacates)) {
      step.coverLanded();
    }
  }
}

// --- Helpers below main export ---

/**
 * What the call does with this clip's position, after the plan: a move the plan
 * gave up on, or one whose way is blocked by a clip that stayed put, is called
 * off together with its resize — a resize clears the span it tiles across just
 * as a move clears its destination.
 * @param run - The call's shared state
 * @param payload - The target's payload
 * @param step - The call's state for this target
 * @returns Where the clip goes and how long it is to be
 */
function motionFor(
  run: ClipRun,
  payload: ClipPayload,
  step: Step<ClipCall, ClipPlanned>,
): Motion {
  const { reasons } = run;
  const { blocked, waitsFor } = step.planned;
  const stuck = waitsFor.find(({ index }) => run.stayed.has(index));
  const reason =
    blocked ??
    (stuck == null
      ? null
      : `not moved: it would land on clip ${stuck.label}, ${
          run.calledOff.has(stuck.index)
            ? "whose own move this call gave up on"
            : "which Live wouldn't move"
        }; move that clip first, or use separate calls`);

  if (reason == null) {
    return payload;
  }

  run.calledOff.add(step.index);
  refuseClipWork(reasons, payload.clip.id, reason);

  return { destination: null, startBeats: null, lengthBeats: null };
}

interface PieceTurn {
  /** The clip to update: the target's own, or one piece of it */
  piece: LiveAPI;
  /** Its place among the pieces */
  position: number;
  pieces: LiveAPI[];
  motion: Motion;
  step: Step<ClipCall, ClipPlanned>;
}

/**
 * Update one clip: its params, then its code, envelopes and conversion,
 * keeping what it has to say on the entry it wrote.
 * @param run - The call's shared state
 * @param turn - The clip, and where it sits in its target
 * @param turn.piece - The clip to update: the target's own, or one piece of it
 * @param turn.position - Its place among the pieces
 * @param turn.pieces - Every clip the target's cut made, or just its own
 * @param turn.motion - Where the clip goes and how long it is to be
 * @param turn.step - The call's state for this target
 * @returns The entries it wrote, the clip's own first
 * @throws Error when a lone clip's update fails, or got nothing done
 */
async function updatePiece(
  run: ClipRun,
  { piece, position, pieces, motion, step }: PieceTurn,
): Promise<ClipResult[]> {
  const { reasons, context } = run;
  const call = step.checked;
  const cut = pieces.length > 1;

  // The cut already changed the Set, so a piece the deadline stops before keeps
  // its entry, cut and otherwise unchanged. (A clip that wasn't cut was checked
  // before its turn began.)
  if (cut && isDeadlineExceeded(context.deadline ?? null)) {
    return [unreached(piece)];
  }

  const updated: ClipResult[] = [];
  // What landed on this piece alone, so a piece that fails says what it kept.
  const landedOnPiece: string[] = [];
  const journal = reasons.journal;

  /**
   * Note what landed on this piece, then on the target.
   * @param phrase - What landed
   * @param partial - Entry fields known so far, for the target's entry
   */
  reasons.journal = (phrase, partial) => {
    landedOnPiece.push(phrase);
    journal?.(phrase, partial);
  };

  try {
    processSingleClipUpdate({
      ...paramsFor(call),
      clip: piece,
      clipIndex: step.planned.firstIndex + position,
      clipCount: step.planned.clipCount,
      name: getNameForIndex(
        call.args.name,
        step.index,
        call.labels.parsedNames,
      ),
      color: getColorForIndex(
        call.args.color,
        step.index,
        call.labels.parsedColors,
      ),
      ...call.valuesAt(step.index),
      arrangementLengthBeats: motion.lengthBeats,
      arrangementStartBeats: motion.startBeats,
      destination: motion.destination,
      destinationParam: call.destinationParam,
      startParam: call.startParam,
      destinationTracks: run.destinationTracks,
      context,
      scaleMask: run.scaleMask,
      updatedClips: updated,
      landings: run.landings,
      reasons,
    });
    await applyCodeToWrittenClips(
      updated,
      reasons,
      piece.id,
      step.planned.firstIndex + position,
      step.planned.clipCount,
      call.args.code,
    );
    // Last, and on the entry the rest of the update settled on: a move
    // re-creates the clip under a new id.
    await applyClipEnvelopes(updated[0], call.envelopeLines, context.deadline);
    // After the envelopes, so it converts the clip as the call left it.
    await applyClipConvert({
      entry: updated[0],
      type: call.args.convert,
      clipId: piece.id,
      reasons,
      progress: run.convert,
      deadline: context.deadline,
    });
  } catch (error) {
    // Properties written before the throw can have resized the clip, which
    // nothing reports on a failed turn.
    context.lanes?.clipChanged(piece);

    if (!cut) {
      throw error;
    }

    // The other pieces still exist and still get their turn.
    return [stopped(piece, error, landedOnPiece)];
  } finally {
    reasons.journal = journal;
  }

  const [entry] = updated as [ClipResult, ...ClipResult[]];

  reportClipReasons(reasons, piece.id, entry);

  // Nothing the call asked of this clip happened, so where it still sits is not
  // worth an entry: the target is skipped, with the reason as its detail. A
  // moved clip reports a new id — every route that moves one re-creates it — so
  // an entry that kept the id it came in with is one that stayed put.
  if (
    !cut &&
    updated.length === 1 &&
    entry.id === piece.id &&
    !askedBeyondPosition(call.args, clipIgnoredParams(reasons, piece.id)) &&
    clipLandedNothing(reasons, piece.id)
  ) {
    throw new Error(entry.detail);
  }

  return updated;
}

/**
 * The update params every clip of the call shares, as the call sent them.
 * @param call - The update-clip call
 * @returns The params
 */
function paramsFor(call: ClipCall): Partial<ProcessSingleClipUpdateParams> {
  const { args } = call;

  return {
    notationString: args.notes,
    transformString: args.transforms,
    preTransformString: args.preTransforms,
    looping: args.looping,
    duplicateLoop: args.duplicateLoop,
    gainDb: args.gainDb,
    pitchShift: args.pitchShift,
    warpMode: args.warpMode,
    warping: args.warping,
    warpOp: args.warpOp,
    warpBeatTime: args.warpBeatTime,
    warpSampleTime: args.warpSampleTime,
    warpDistance: args.warpDistance,
    quantize: args.quantize,
    quantizeGrid: args.quantizeGrid,
  };
}

/**
 * Whether the call asked this clip for anything besides where it sits. A param
 * the clip ignored doesn't count: it wrote nothing, so it can't be what keeps a
 * refusal out of the skip.
 * @param args - The tool arguments as received
 * @param ignored - The params that did nothing on this clip
 * @returns True when any param that writes to the clip itself was sent and used
 */
function askedBeyondPosition(
  args: ClipCall["args"],
  ignored: ReadonlySet<string>,
): boolean {
  return CONTENT_PARAMS.some(
    (param) => args[param] != null && !ignored.has(param),
  );
}

/**
 * The entry for a piece the deadline stopped before: it was cut and is left as
 * the cut made it.
 * @param piece - The piece
 * @returns Its entry
 */
function unreached(piece: LiveAPI): ClipResult {
  const entry = buildClipResultObject(piece.id, null, objectPathForApi(piece));

  appendDetail(
    entry,
    "the request ran out of time; the rest of this update did not run",
  );

  return entry;
}

/**
 * The entry for a piece whose update threw.
 * @param piece - The piece
 * @param error - What it threw
 * @param landed - What had landed on the piece before it threw
 * @returns Its entry, with what stopped it and what it kept
 */
function stopped(piece: LiveAPI, error: unknown, landed: string[]): ClipResult {
  const entry = buildClipResultObject(piece.id, null, objectPathForApi(piece));
  const message = errorMessage(error);

  appendDetail(
    entry,
    `update stopped partway: ${landed.length === 0 ? message : landedDetail(message, landed)}`,
  );

  return entry;
}
