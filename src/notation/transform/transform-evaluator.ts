// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { formatParserError } from "#src/notation/peggy-error-formatter.ts";
import { type PeggySyntaxError } from "#src/notation/peggy-parser-types.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import * as console from "./transform-warning-label.ts";
import { type NoteEvent } from "../types.ts";
import {
  type DeferredWrite,
  applyTransformResult,
  commitWaveformWrites,
} from "./helpers/apply-transform-result.ts";
import {
  buildNoteContext,
  selectAssignmentNotes,
} from "./helpers/assignment-note-selection.ts";
import {
  rejectsPitchLiteralValue,
  warnShortRamp,
} from "./helpers/assignment-warnings.ts";
import { findWaveformName } from "./helpers/flat-waveforms.ts";
import { buildNoteProperties } from "./helpers/note-properties.ts";
import { timeRangeBoundsInMusicalBeats } from "./helpers/time-range-bounds.ts";
import {
  type ClipContext,
  type NoteContext,
  type NoteProperties,
  type TimeRange,
  type TransformResult,
} from "./helpers/transform-context.ts";
import {
  evaluateExpression,
  evaluateTransformAST,
  isNoteOp,
} from "./helpers/transform-evaluation.ts";
import {
  type PitchRange,
  type TransformAssignment,
  type TransformStatement,
  parse as parseTransform,
} from "./parser/transform-parser.ts";
import { applyNoteOp } from "./transform-note-ops.ts";

// Audio-only parameters that should be skipped for MIDI clips
const AUDIO_PARAMETERS = new Set(["gain", "pitchShift"]);

/**
 * Apply transforms to a list of notes in-place
 * @param notes - Notes to transform
 * @param transformString - Transform expression string
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipContext - Optional clip-level context for clip/bar variables
 * @returns Count of unique notes with at least one non-audio transform matched, or undefined if no transforms applied
 */
export function applyTransforms(
  notes: NoteEvent[],
  transformString: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipContext?: ClipContext,
): number | undefined {
  if (!transformString || notes.length === 0) {
    return undefined;
  }

  const ast = tryParseTransform(
    transformString,
    timeSigDenominator,
    timeSigNumerator,
  );

  // Check for audio parameters and warn
  const hasAudioParams = ast.some(
    (a) => !isNoteOp(a) && AUDIO_PARAMETERS.has(a.parameter),
  );

  if (hasAudioParams) {
    console.warn("Audio parameters (gain, pitchShift) ignored for MIDI clips");
  }

  // Sort by start_time then pitch so note.index reflects musical order
  // (Ableton's get_notes_extended returns notes sorted by pitch)
  notes.sort((a, b) => a.start_time - b.start_time || a.pitch - b.pitch);

  // Calculate the overall clip timeRange in musical beats
  const firstNote = notes[0] as NoteEvent;
  const clipStartTime = firstNote.start_time * (timeSigDenominator / 4);
  const lastNote = notes.at(-1) as NoteEvent;
  const clipEndTime =
    (lastNote.start_time + lastNote.duration) * (timeSigDenominator / 4);
  const clipTimeRange: TimeRange = { start: clipStartTime, end: clipEndTime };

  // Track which notes had at least one MIDI transform applied
  const transformedIndices = new Set<number>();

  // Process statements sequentially (statement-major order).
  // Each statement is fully applied before the next one runs.
  // This enables stacked transforms, pitch-range-filtered note.index, and
  // note-count ops (ratchet/merge/split/repeat) whose output the next statement sees.
  for (let j = 0; j < ast.length; j++) {
    const stmt = ast[j] as TransformStatement;

    // A duplicate selector segment (two pitch/time selectors, or two where()
    // clauses) is warned-and-skipped rather than failing the whole transform:
    // relay the parser's message and move on so the other lines still apply.
    if (stmt.selectorWarning != null) {
      console.warn(stmt.selectorWarning);
      continue;
    }

    // Note-count op (ratchet/merge/split/repeat): rebuilds the note array in place.
    if (isNoteOp(stmt)) {
      const produced = applyNoteOp(
        stmt,
        notes,
        timeSigNumerator,
        timeSigDenominator,
        clipContext?.arrangementStart,
      );

      // The rebuild invalidates prior index-based tracking, so reseed with the
      // op's output notes; later assignments add their fresh indices on top.
      transformedIndices.clear();

      for (const idx of produced) {
        transformedIndices.add(idx);
      }

      continue;
    }

    // Pitch selectors are per-line: a line's pitch range applies only to that
    // line (no selector = all pitches), mirroring the time-range selector. There
    // is no carryover from earlier lines.
    const pitchRange = stmt.pitchRange ?? null;

    // Skip audio parameters for MIDI clips
    if (AUDIO_PARAMETERS.has(stmt.parameter)) {
      continue;
    }

    applyAssignmentToNotes(
      stmt,
      pitchRange,
      notes,
      timeSigNumerator,
      timeSigDenominator,
      clipTimeRange,
      clipContext,
      transformedIndices,
    );
  }

  // Delete notes where transforms reduced velocity to 0 or below, or duration to 0 or below
  // (consistent with v0 deletion in bar|beat notation)
  const surviving = notes.filter(
    (note) => note.velocity > 0 && note.duration > 0,
  );

  if (surviving.length < notes.length) {
    // Warn when a duration transform drove a note to zero/negative length: the
    // note is deleted (not clamped), so surface it rather than vanishing silently.
    const droppedForDuration = notes.filter(
      (note) => note.duration <= 0,
    ).length;

    if (droppedForDuration > 0) {
      console.warn(
        `${droppedForDuration} note(s) deleted: transform drove duration to 0 or below`,
      );
    }

    notes.length = 0;
    notes.push(...surviving);
  }

  return transformedIndices.size;
}

/**
 * Apply a single transform assignment to all matching notes.
 * note.index, note.count, and the next.* / legato() lookups all describe the
 * SELECTED notes — those matching both the pitch range AND the time-range
 * selector — so a note's index is 0-based over exactly what the selector picked,
 * not the whole pitch-filtered clip. Transforms are applied immediately so
 * subsequent assignments see mutations.
 * @param assignment - Transform assignment to apply
 * @param pitchRange - Effective pitch range filter (null for no filter)
 * @param notes - Notes to transform
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipTimeRange - Clip time range for expression evaluation
 * @param clipContext - Optional clip-level context for clip variables
 * @param transformedIndices - Set to track which notes were transformed
 */
function applyAssignmentToNotes(
  assignment: TransformAssignment,
  pitchRange: PitchRange | null,
  notes: NoteEvent[],
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipTimeRange: TimeRange,
  clipContext: ClipContext | undefined,
  transformedIndices: Set<number>,
): void {
  if (rejectsPitchLiteralValue(assignment)) {
    return;
  }

  // The selected notes are those matching BOTH the pitch range AND the
  // time-range selector. Indexing and next.*/legato() are scoped to this set,
  // so a sub-range selector (e.g. one bar of a ratcheted hat run) gets a
  // 0-based, selection-local index instead of one offset by earlier same-pitch
  // notes outside the window.
  const selectedIndices = selectAssignmentNotes(
    assignment,
    pitchRange,
    notes,
    timeSigNumerator,
    timeSigDenominator,
    clipTimeRange,
    clipContext,
  );

  const selectedCount = selectedIndices.length;
  const beatScale = timeSigDenominator / 4;

  // Pre-compute selected start times in musical beats for legato() tolerance scan
  const selectedStarts = selectedIndices.map(
    (idx) => (notes[idx] as NoteEvent).start_time * beatScale,
  );
  // clipDuration is the clip-local length in musical beats, matching the
  // clip-local space of selectedStarts/noteStart (note start_times are
  // clip-relative). Do NOT add arrangementStart here — legato() computes the
  // last note's duration as clipEnd - noteStart, so an arrangement-absolute
  // clipEnd would inflate it by arrangementStart on arrangement clips.
  const clipEnd = clipContext ? clipContext.clipDuration : undefined;

  // Normalization range for ramp/curve is constant across the assignment's
  // selected notes: the selector's bounds, or the clip range when unscoped.
  // Membership (the per-note skip) was already settled in selectAssignmentNotes.
  const evalTimeRange: TimeRange = assignment.timeRange
    ? timeRangeBoundsInMusicalBeats(assignment.timeRange, timeSigNumerator)
    : clipTimeRange;

  // An evaluation failure (e.g. a wrong function argument count) is usually
  // note-invariant — it would repeat identically for every selected note. Warn
  // once per distinct message for this assignment instead of once per note, so a
  // single malformed line doesn't relay N copies of the same WARNING.
  const warnedFailures = new Set<string>();

  // A waveform that lands on one phase for every note is a mistake whatever it
  // was aiming at, so its writes are held back until the whole selection has
  // been evaluated and the flat case can be ruled out. Only waveforms defer;
  // everything else applies as it goes, which is what lets transforms stack.
  const waveformName = findWaveformName(assignment.expression);
  const deferred: DeferredWrite[] = [];
  // transformedIndices is cumulative across the whole transform, so it can't
  // tell whether THIS assignment applied anything. Count what this one wrote.
  let appliedCount = 0;

  for (let cursor = 0; cursor < selectedIndices.length; cursor++) {
    const i = selectedIndices[cursor] as number;
    const note = notes[i] as NoteEvent;

    const noteContext = buildNoteContext(
      note,
      timeSigNumerator,
      timeSigDenominator,
      clipTimeRange,
    );

    // Next note in the selected sequence for next.* variables
    const nextNoteIdx = selectedIndices[cursor + 1];
    const nextNote =
      nextNoteIdx != null ? (notes[nextNoteIdx] as NoteEvent) : undefined;

    const legatoContext = {
      starts: selectedStarts,
      cursor,
      clipEnd,
    };

    const noteProperties = buildNoteProperties(
      note,
      cursor,
      selectedCount,
      timeSigDenominator,
      clipContext,
      nextNote,
      legatoContext,
    );

    try {
      const value = evaluateExpression(assignment.expression, {
        position: noteContext.position,
        timeSigNumerator,
        timeSigDenominator,
        timeRange: evalTimeRange,
        noteProperties,
        evaluateExpression,
      });

      if (waveformName != null) {
        deferred.push({ note, index: i, value });
        continue;
      }

      // Apply transform immediately (enables stacked transforms)
      applyTransformResult(
        note,
        assignment.parameter,
        assignment.operator,
        value,
        timeSigDenominator,
      );

      transformedIndices.add(i);
      appliedCount++;
    } catch (error) {
      const message = `Failed to evaluate transform for parameter "${assignment.parameter}": ${errorMessage(error)}`;

      if (!warnedFailures.has(message)) {
        warnedFailures.add(message);
        console.warn(message);
      }
    }
  }

  if (waveformName != null) {
    appliedCount = commitWaveformWrites(
      waveformName,
      deferred,
      assignment,
      timeSigDenominator,
      transformedIndices,
    );
  }

  if (appliedCount > 0) {
    warnShortRamp(
      assignment.expression,
      assignment.timeRange != null,
      selectedStarts,
      evalTimeRange,
      timeSigNumerator,
      timeSigDenominator,
    );
  }
}

/**
 * Evaluate a transform expression for a specific note context
 * @param transformString - Transform expression string
 * @param noteContext - Note context for evaluation
 * @param noteProperties - Note properties for variable access
 * @returns Transform results keyed by parameter name
 */
export function evaluateTransform(
  transformString: string,
  noteContext: NoteContext,
  noteProperties?: NoteProperties,
): Record<string, TransformResult> {
  if (!transformString) {
    return {};
  }

  const ast = tryParseTransform(
    transformString,
    noteContext.timeSig.denominator,
    noteContext.timeSig.numerator,
  );

  return evaluateTransformAST(ast, noteContext, noteProperties);
}

/**
 * Parse a transform string, returning the AST. Throws on parse errors.
 * @param transformString - Transform expression string
 * @param timeSigDenominator - Time signature denominator; converts `±n`
 *   beat-position offsets in a `timeRange` to musical beats during the parse
 * @param timeSigNumerator - Time signature numerator (musical beats per bar);
 *   lets a `-n` range-bound offset borrow across a bar line during the parse
 * @returns Parsed AST
 * @throws Error with formatted message if parsing fails
 */
function tryParseTransform(
  transformString: string,
  timeSigDenominator: number,
  timeSigNumerator: number,
): ReturnType<typeof parseTransform> {
  try {
    return parseTransform(transformString, {
      timeSigDenominator,
      beatsPerBar: timeSigNumerator,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "SyntaxError") {
      throw new Error(
        formatParserError(error as PeggySyntaxError, "transform"),
        { cause: error },
      );
    }

    throw error;
  }
}
