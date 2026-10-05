// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { applyV0Deletions } from "#src/notation/apply-v0-deletions.ts";
import { abletonBeatsToDuration } from "#src/notation/barbeat/time/barbeat-time.ts";
import { interpretNotation, resolveNotation } from "#src/notation/notation.ts";
import {
  countSlotCollisions,
  dedupeAndSortNotes,
} from "#src/notation/note-sort.ts";
import { type ClipContext } from "#src/notation/transform/helpers/transform-context.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import {
  addCounts,
  combineOutcomes,
  countTransforms,
  type TransformCounts,
  type TransformOutcome,
} from "#src/notation/transform/transformed-count.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { type Notation } from "#src/shared/notation.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";
import { type NoteUpdateResult } from "#src/tools/clip/helpers/clip-results.ts";
import { type ScaleMaskReader } from "#src/tools/clip/helpers/scale-mask.ts";
import {
  clipNoteScanWindow,
  getClipNoteCount,
  rawNotesToCopiedNotes,
  readClipNotes,
  removeAllClipNotes,
} from "#src/tools/shared/clip/clip-notes.ts";
import {
  applyTransformsToExistingNotes,
  buildClipContext,
  hasNoteEdits,
  noteDroppedDuplicates,
} from "./note-transforms.ts";
import {
  type ClipReasons,
  ignoreClipParams,
  noteLanded,
} from "../entries/clip-reasons.ts";
import { QUANTIZE_GRID, QUANTIZE_GRID_ALIASES } from "./quantize-grid.ts";
import {
  mutedNotesHit,
  reportMutedCopies,
  reportMutedNoteEffects,
  reportMutedQuantize,
} from "./muted-note-effects.ts";
import { CLIP_IS_AUDIO, ignoredText } from "#src/shared/max/ignored-wording.ts";

interface QuantizationOptions {
  /** Quantization strength 0-1 */
  quantize?: number;
  /** Note grid value */
  quantizeGrid?: string;
  /** Limit to specific pitch as note name, e.g., C3, D#4 (optional) */
  quantizePitch?: string;
}

/**
 * Handle note updates: overlay new notes onto existing notes (v0 deletes).
 * @param clip - The clip to update
 * @param reasons - What each clip has to say beyond its result, added to
 * @param notationString - The notation string to apply
 * @param transformString - Transform expressions to apply AFTER merge
 * @param preTransformString - Transform expressions to apply to existing notes BEFORE merge
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipContext - Clip-level context for transform variables, undefined when the call edits no notes
 * @param notation - Global notation setting the notes string is written in (default barbeat)
 * @returns Note update result, or null if notes not modified
 */
export function handleNoteUpdates(
  clip: LiveAPI,
  reasons: ClipReasons,
  notationString: string | undefined,
  transformString: string | undefined,
  preTransformString: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipContext: ClipContext | undefined,
  notation: Notation | undefined,
): NoteUpdateResult | null {
  // Nothing to do. The caller builds the clip context on this same check, so
  // an undefined one never reaches the code below.
  if (!hasNoteEdits(notationString, transformString, preTransformString)) {
    return null;
  }

  // No new notes to merge: apply preTransforms then transforms directly to the
  // existing notes. This is how a clip's notes are cleared/edited without
  // rewriting them — e.g. bare preTransforms "v0" clears everything.
  if (notationString == null) {
    return applyTransformsToExistingNotes(
      clip,
      reasons,
      preTransformString,
      transformString,
      timeSigNumerator,
      timeSigDenominator,
      clipContext,
    );
  }

  // Read the same window as read-clip, so a pickup before the clip start is
  // carried into the merge. Copied whole, so a note the call doesn't touch is
  // written back exactly as it was. Muted notes sit out and are put back.
  const { visible, muted } = readClipNotes(clip);
  const { notes: existingNotes, outcome: preOutcome } =
    applyPreTransformsToExisting(
      rawNotesToCopiedNotes(visible),
      preTransformString,
      timeSigNumerator,
      timeSigDenominator,
      clipContext,
    );

  const { notes, inputDuplicates, pileUps } = mergeNewNotes(
    notation,
    notationString,
    existingNotes,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Every collision before transforms, restated notes included.
  const collidingBefore = countSlotCollisions(notes);

  // Muted notes the new notes already sit on, by what the call wrote: that is
  // an asked-for overwrite. Only a replacement a transform adds is reported.
  const mutedNotes = rawNotesToCopiedNotes(muted);
  const existingSet = new Set(existingNotes);
  const mutedHitBefore = mutedNotesHit(
    notes.filter((note) => !existingSet.has(note)),
    mutedNotes,
  );

  // Apply transforms to notes if provided
  const postOutcome = applyTransforms(
    notes,
    transformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );

  // Dedupe same-pitch+start collisions (new wins, over a muted note too), then
  // sort by start so Live truncates same-pitch overlaps instead of deleting the
  // earlier write. See note-sort.ts.
  removeAllClipNotes(clip);

  const { notes: mergedNotes, collisions } = dedupeAndSortNotes(
    notes,
    mutedNotes,
  );

  if (mergedNotes.length > 0) {
    clip.call("add_new_notes", { notes: mergedNotes });
  }

  // Restating an existing note is a deliberate overwrite, so it isn't reported.
  // Reported: input duplicates, preTransform pile-ups, and what a transform
  // collapsed, capped at what was dropped just now (a transform can pull
  // colliding notes apart).
  //
  // Known limits, accepted: this can undercount when a transform both clears a
  // collision and makes one, and overcount when a transform separates only part
  // of a pile-up that includes a restated existing note (existing E plus new N1
  // and N2 at one pitch and start, a transform moves N2 away: it reports one
  // dropped duplicate, though only the restated E was dropped).
  const transformCollapsed = Math.max(0, collisions - collidingBefore);

  noteDroppedDuplicates(
    reasons,
    clip.id,
    Math.min(collisions, inputDuplicates + pileUps + transformCollapsed),
  );

  const mutedReplaced = [...mutedNotesHit(notes, mutedNotes)].filter(
    (note) => !mutedHitBefore.has(note),
  ).length;

  reportMutedNoteEffects(clip, reasons, {
    written: mergedNotes,
    muted: mutedNotes,
    replaced: mutedReplaced,
  });

  // Both stages count: a note either one changed counts once.
  return {
    noteCount: getClipNoteCount(clip),
    ...countTransforms(combineOutcomes(preOutcome, postOutcome), mergedNotes),
  };
}

/**
 * Build the merged note array (existing + new) ready for the dedupe/sort/write
 * tail. The merge strategy differs by notation:
 * - barbeat: hand the existing notes (preTransforms already applied) to the
 *   interpreter ahead of the new ones, so the new notation's bar copy can copy
 *   them and its `v0` can delete them.
 * - midi-json / stark: combine the arrays directly (new notes last, so they win
 *   same-pitch+start collisions in dedupeNotesKeepingLast) and resolve the
 *   delete markers over the combined array, so midi-json's `v:0` deletes
 *   existing notes too.
 * Either way the existing notes are never re-spelled as text, which would lose
 * what bar|beat can't write.
 * @param notation - Global notation setting the new notes string is written in (or undefined)
 * @param notationString - The new notes
 * @param existingNotes - Existing notes (preTransforms already applied)
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Combined note array (unsorted, not yet deduped), how many
 *   duplicates the new notes held among themselves, and how many the surviving
 *   existing notes did (Live holds none, so a preTransform piled them up).
 *   Restating an existing note counts as neither.
 */
function mergeNewNotes(
  notation: Notation | undefined,
  notationString: string,
  existingNotes: NoteEvent[],
  timeSigNumerator: number,
  timeSigDenominator: number,
): { notes: NoteEvent[]; inputDuplicates: number; pileUps: number } {
  let notes: NoteEvent[];

  if (resolveNotation(notation) !== "barbeat") {
    const newNotes = interpretNotation(notationString, {
      notation,
      timeSigNumerator,
      timeSigDenominator,
      keepV0Deletes: true,
    });

    notes = applyV0Deletions([...existingNotes, ...newNotes]);
  } else {
    notes = interpretNotation(notationString, {
      timeSigNumerator,
      timeSigDenominator,
      existingNotes,
    });
  }

  // Surviving existing notes come back as the same objects, so what isn't one
  // of them was written by the new notation (bar copies included).
  const existing = new Set(existingNotes);

  return {
    notes,
    inputDuplicates: countSlotCollisions(
      notes.filter((note) => !existing.has(note)),
    ),
    pileUps: countSlotCollisions(notes.filter((note) => existing.has(note))),
  };
}

/**
 * Double the clip's loop via Live's native Clip.duplicate_loop. Live extends the
 * loop (looped clips move loop_end; unlooped clips duplicate the start/end range)
 * and copies the existing notes AND automation envelopes into the new half - the
 * envelope copy is something the manual length+notes path can't do. MIDI clips
 * only: an audio clip says so on its own entry, so a mixed comma-separated
 * batch keeps going.
 *
 * Always reports the resulting length. A `length` arg selects the region to
 * double, so the clip ends up at twice that — not at the length the caller
 * asked for — and without this the result looks the same either way.
 * @param clip - The clip to double
 * @param reasons - What each clip has to say beyond its result, added to
 * @returns Note update result with the post-duplicate note count and length, or
 *   null when skipped (audio clip)
 */
export function handleDuplicateLoop(
  clip: LiveAPI,
  reasons: ClipReasons,
): NoteUpdateResult | null {
  if ((clip.getProperty("is_midi_clip") as number) <= 0) {
    ignoreClipParams(
      reasons,
      clip.id,
      ["duplicateLoop"],
      ignoredText("duplicateLoop", CLIP_IS_AUDIO),
    );

    return null;
  }

  // Live copies muted notes too; the model can't see them, so say how many.
  // Counted over the window read before, which the doubled clip's wider one
  // contains.
  const window = clipNoteScanWindow(clip);
  const mutedBefore = readClipNotes(clip).muted.length;

  clip.call("duplicate_loop");

  // duplicate_loop mutates the clip in place (same id). Recreate from id to dodge
  // LiveAPI staleness - matters for arrangement clips - before reading the count.
  const freshClip = LiveAPI.from(clip.id);
  const { visible, muted } = readClipNotes(freshClip);

  reportMutedCopies(clip, reasons, mutedBefore, window, muted);

  return {
    noteCount: visible.length,
    length: abletonBeatsToDuration(
      freshClip.getProperty("length") as number,
      freshClip.getProperty("signature_numerator") as number,
      freshClip.getProperty("signature_denominator") as number,
    ),
  };
}

/**
 * MIDI duplicateLoop pipeline: edits compose with the native double on a defined
 * timeline. (1) Flush preTransforms onto the existing notes first, so Live's copy
 * carries the edited source into the new half. (2) Double the loop. (3) Merge new
 * notes and apply transforms across the full doubled clip. The clip is re-read
 * from its id and its context rebuilt after the double so transform variables
 * (bar.*, clip.*) see the doubled length. Caller guarantees a MIDI clip.
 * @param params - The clip plus the edit strings and per-clip context indices
 * @param params.clip - The MIDI clip to double and edit
 * @param params.reasons - What each clip has to say beyond its result, added to
 * @param params.notationString - New notes to merge after the double, or undefined
 * @param params.transformString - Transforms to apply after the double, or undefined
 * @param params.preTransformString - Transforms to apply before the double, or undefined
 * @param params.timeSigNumerator - Time signature numerator
 * @param params.timeSigDenominator - Time signature denominator
 * @param params.clipIndex - 0-based index in the multi-clip batch
 * @param params.clipCount - Total clips in the batch
 * @param params.notation - Global notation setting the notes string is written in (or undefined)
 * @param params.scaleMask - The call's shared scale mask reader, when it has one
 * @returns Note update result with the final post-edit note count
 */
export function handleDuplicateLoopWithEdits({
  clip,
  reasons,
  notationString,
  transformString,
  preTransformString,
  timeSigNumerator,
  timeSigDenominator,
  clipIndex,
  clipCount,
  notation,
  scaleMask,
}: {
  clip: LiveAPI;
  reasons: ClipReasons;
  notationString: string | undefined;
  transformString: string | undefined;
  preTransformString: string | undefined;
  timeSigNumerator: number;
  timeSigDenominator: number;
  clipIndex: number;
  clipCount: number;
  notation: Notation | undefined;
  scaleMask?: ScaleMaskReader;
}): NoteUpdateResult | null {
  // Stage 1: flush preTransforms onto the existing notes before doubling.
  let preCounts: TransformCounts = {};

  if (preTransformString != null) {
    const preContext = buildClipContext(
      clip,
      clipIndex,
      clipCount,
      timeSigNumerator,
      timeSigDenominator,
      scaleMask,
    );
    const preResult = applyTransformsToExistingNotes(
      clip,
      reasons,
      preTransformString,
      undefined,
      timeSigNumerator,
      timeSigDenominator,
      preContext,
    );

    preCounts = {
      transformed: preResult.transformed,
      deletedNotes: preResult.deletedNotes,
    };
  }

  // Stage 2: native double (MIDI guaranteed by the caller).
  const dupResult = handleDuplicateLoop(clip, reasons);

  // Stage 3: merge notes + transforms across the doubled clip. Re-read from id
  // (duplicate_loop mutates in place) and rebuild context for the doubled length.
  if (notationString == null && transformString == null) {
    return withPreCounts(dupResult, preCounts);
  }

  const freshClip = LiveAPI.from(clip.id);
  const postContext = buildClipContext(
    freshClip,
    clipIndex,
    clipCount,
    timeSigNumerator,
    timeSigDenominator,
    scaleMask,
  );
  const mergeResult = handleNoteUpdates(
    freshClip,
    reasons,
    notationString,
    transformString,
    undefined,
    timeSigNumerator,
    timeSigDenominator,
    postContext,
    notation,
  );

  // Stage 3 only counts notes, so carry stage 2's length across it — nothing
  // else in the result reveals the length the double landed on.
  if (mergeResult != null && dupResult?.length != null) {
    mergeResult.length = dupResult.length;
  }

  return withPreCounts(mergeResult ?? dupResult, preCounts);
}

/**
 * Add stage 1's counts to the later stages'. Stage 3 is handed no preTransform
 * string of its own and re-reads the doubled clip, so each stage compares its
 * own before and after and the report is their sum (a note changed in both
 * counts twice).
 * @param result - The result the later stages produced, or null if there is none
 * @param preCounts - Stage 1's counts, empty if it did not run
 * @returns The result with the preTransform counts added
 */
function withPreCounts(
  result: NoteUpdateResult | null,
  preCounts: TransformCounts,
): NoteUpdateResult | null {
  if (result == null) {
    return result;
  }

  const { transformed: _t, deletedNotes: _d, ...rest } = result;

  return { ...rest, ...addCounts(preCounts, result) };
}

/**
 * Apply preTransforms to existing notes in-place (mutates and filters v=0/d=0).
 * Returns the surviving notes plus the preTransform outcome (undefined when
 * no preTransformString); no-ops when preTransformString is missing.
 * @param existingNotes - Existing notes as NoteEvents
 * @param preTransformString - Transform expressions, or undefined to skip
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipContext - Clip-level context for transform variables
 * @returns The (possibly filtered) existing notes and the preTransform outcome
 */
function applyPreTransformsToExisting(
  existingNotes: NoteEvent[],
  preTransformString: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipContext: ClipContext | undefined,
): { notes: NoteEvent[]; outcome: TransformOutcome | undefined } {
  if (preTransformString == null || existingNotes.length === 0) {
    return { notes: existingNotes, outcome: undefined };
  }

  const outcome = applyTransforms(
    existingNotes,
    preTransformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );

  return { notes: existingNotes, outcome };
}

/**
 * Handle quantization for MIDI clips
 * @param clip - The clip to quantize
 * @param reasons - What each clip has to say beyond its result, added to
 * @param options - Quantization options
 * @param options.quantize - Quantization strength 0-1 (defaults to 1)
 * @param options.quantizeGrid - Note grid value (defaults to 1/16)
 * @param options.quantizePitch - Limit to specific pitch (optional)
 */
export function handleQuantization(
  clip: LiveAPI,
  reasons: ClipReasons,
  { quantize, quantizeGrid, quantizePitch }: QuantizationOptions,
): void {
  if (quantize == null && quantizeGrid == null && quantizePitch == null) {
    return;
  }

  // Grid or pitch alone means "quantize fully"; strength defaults to 1
  const strength = quantize ?? 1;

  // Skip for audio clips. Grid or pitch alone triggers quantization, so name
  // what the caller sent rather than a `quantize` they may not have.
  if ((clip.getProperty("is_midi_clip") as number) <= 0) {
    const sent = [
      quantize != null ? "quantize" : null,
      quantizeGrid != null ? "quantizeGrid" : null,
      quantizePitch != null ? "quantizePitch" : null,
    ].filter((param) => param != null);

    ignoreClipParams(reasons, clip.id, sent, ignoredText(sent, CLIP_IS_AUDIO));

    return;
  }

  // Default to 1/16 when no grid given: the finest common grid, so it moves
  // notes the least (safest when the model didn't specify one).
  const requestedGrid = quantizeGrid ?? "1/16";

  // Bridge n/N note-value aliases to their native grid form before lookup
  const grid = QUANTIZE_GRID_ALIASES[requestedGrid] ?? requestedGrid;
  const gridValue = QUANTIZE_GRID[grid];

  // Live quantizes muted notes too; the model can't see them, so say how many
  // moved. The read before is the only one a clip with no muted notes costs.
  const before = readClipNotes(clip);

  if (quantizePitch != null) {
    // Refused up front by updateClip, so this reads back a known-good name.
    const midiPitch = noteNameToMidi(quantizePitch) as number;

    clip.call("quantize_pitch", midiPitch, gridValue, strength);
  } else {
    clip.call("quantize", gridValue, strength);
  }

  noteLanded(reasons, "quantize", { id: clip.id });
  reportMutedQuantize(clip, reasons, before);
}
