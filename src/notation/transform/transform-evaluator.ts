// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { formatParserError } from "#src/notation/peggy-error-formatter.ts";
import { type PeggySyntaxError } from "#src/notation/peggy-parser-types.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { type NoteEvent } from "../types.ts";
import {
  type ClipContext,
  evaluateExpression,
  evaluateTransformAST,
  isNoteOp,
  type NoteContext,
  type NoteProperties,
  operatorDisplay,
  resolveEffectivePitchRanges,
  type TimeRange,
  type TransformResult,
} from "./helpers/transform-evaluator-helpers.ts";
import { buildNoteProperties } from "./helpers/transform-evaluator-note-helpers.ts";
import {
  buildNoteContext,
  selectAssignmentNotes,
} from "./helpers/transform-evaluator-selection-helpers.ts";
import { timeRangeBoundsInMusicalBeats } from "./helpers/transform-time-range-helpers.ts";
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

  // Resolve effective pitch ranges for each assignment (handling inheritance)
  const effectiveRanges = resolveEffectivePitchRanges(ast);

  // Track which notes had at least one MIDI transform applied
  const transformedIndices = new Set<number>();

  // Process statements sequentially (statement-major order).
  // Each statement is fully applied before the next one runs.
  // This enables stacked transforms, pitch-range-filtered note.index, and
  // note-count ops (ratchet/merge) whose output the next statement sees.
  for (let j = 0; j < ast.length; j++) {
    const stmt = ast[j] as TransformStatement;

    // Note-count op (ratchet/merge): rebuilds the note array in place.
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

    const pitchRange = effectiveRanges[j] ?? null;

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
  // A bare pitch literal (`b2`, `C3`) is only a meaningful VALUE for the `pitch`
  // parameter (or as a selector / function argument). Assigned directly to any
  // other parameter it is almost certainly a typo that would silently coerce to a
  // MIDI number (`velocity = b2` → 59). Warn and skip rather than corrupt.
  const expr = assignment.expression;

  if (
    assignment.parameter !== "pitch" &&
    typeof expr === "object" &&
    expr.type === "pitchLiteral"
  ) {
    console.warn(
      `note name "${expr.name}" isn't a value for ${assignment.parameter}; pitch names set the pitch parameter, act as selectors (C3:), or are function arguments (e.g. min(C3,C5)). Skipping "${assignment.parameter} ${operatorDisplay(assignment.operator)}".`,
    );

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
      const value = evaluateExpression(
        assignment.expression,
        noteContext.position,
        timeSigNumerator,
        timeSigDenominator,
        evalTimeRange,
        noteProperties,
      );

      // Apply transform immediately (enables stacked transforms)
      applyTransformResult(
        note,
        assignment.parameter,
        assignment.operator,
        value,
        timeSigDenominator,
      );

      transformedIndices.add(i);
    } catch (error) {
      console.warn(
        `Failed to evaluate transform for parameter "${assignment.parameter}": ${errorMessage(error)}`,
      );
    }
  }
}

/**
 * Apply a single transform result to a note in-place.
 * Handles clamping and conversion between musical and Ableton beats.
 * @param note - Note to modify
 * @param parameter - Transform parameter name
 * @param operator - Transform operator ("set" or "add")
 * @param value - Evaluated expression value (in musical beats for timing/duration)
 * @param timeSigDenominator - Time signature denominator for beat conversion
 */
function applyTransformResult(
  note: NoteEvent,
  parameter: string,
  operator: "add" | "set",
  value: number,
  timeSigDenominator: number,
): void {
  switch (parameter) {
    case "velocity":
      note.velocity =
        operator === "set"
          ? Math.min(127, value)
          : Math.min(127, note.velocity + value);
      break;

    case "timing": {
      const tv = value * (4 / timeSigDenominator);

      note.start_time = operator === "set" ? tv : note.start_time + tv;
      break;
    }

    case "duration": {
      const dv = value * (4 / timeSigDenominator);

      note.duration = operator === "set" ? dv : note.duration + dv;
      break;
    }

    case "probability":
      note.probability = Math.max(
        0,
        Math.min(
          1,
          operator === "set" ? value : (note.probability ?? 1) + value,
        ),
      );
      break;

    case "deviation":
      note.velocity_deviation = Math.max(
        -127,
        Math.min(
          127,
          operator === "set" ? value : (note.velocity_deviation ?? 0) + value,
        ),
      );
      break;

    case "pitch": {
      const raw = operator === "set" ? value : note.pitch + value;

      note.pitch = Math.max(0, Math.min(127, Math.round(raw)));
      break;
    }
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
