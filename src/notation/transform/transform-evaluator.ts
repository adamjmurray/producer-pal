// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { formatParserError } from "#src/notation/peggy-error-formatter.ts";
import { type PeggySyntaxError } from "#src/notation/peggy-parser-types.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { type NoteEvent } from "../types.ts";
import {
  type PitchRange,
  type TransformAssignment,
  parse as parseTransform,
} from "./parser/transform-parser.ts";
import {
  calculateActiveTimeRange,
  type ClipContext,
  evaluateExpression,
  evaluateTransformAST,
  type NoteContext,
  type NoteProperties,
  resolveEffectivePitchRanges,
  type TimeRange,
  type TransformResult,
} from "./transform-evaluator-helpers.ts";

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

  const ast = tryParseTransform(transformString);

  // Check for audio parameters and warn
  const hasAudioParams = ast.some((a) => AUDIO_PARAMETERS.has(a.parameter));

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

  // Process assignments sequentially (assignment-major order).
  // Each assignment is fully applied before the next one runs.
  // This enables stacked transforms and pitch-range-filtered note.index.
  for (let j = 0; j < ast.length; j++) {
    const assignment = ast[j] as TransformAssignment;
    const pitchRange = effectiveRanges[j] ?? null;

    // Skip audio parameters for MIDI clips
    if (AUDIO_PARAMETERS.has(assignment.parameter)) {
      continue;
    }

    applyAssignmentToNotes(
      assignment,
      pitchRange,
      notes,
      timeSigNumerator,
      timeSigDenominator,
      clipTimeRange,
      clipContext,
      transformedIndices,
    );
  }

  // Delete notes where transforms reduced velocity below 1 or duration to 0 or below
  // (consistent with v0 deletion in bar|beat notation)
  const surviving = notes.filter(
    (note) => note.velocity >= 1 && note.duration > 0,
  );

  if (surviving.length < notes.length) {
    notes.length = 0;
    notes.push(...surviving);
  }

  return transformedIndices.size;
}

/**
 * Apply a single transform assignment to all matching notes.
 * When a pitch range is active, note.index and note.count reflect only the
 * filtered subset of notes matching that pitch range.
 * Transforms are applied immediately so subsequent assignments see mutations.
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
  // Count matching notes for filtered index (uses current/mutated pitches)
  const filteredCount =
    pitchRange != null
      ? notes.filter(
          (n) =>
            n.pitch >= pitchRange.startPitch && n.pitch <= pitchRange.endPitch,
        ).length
      : notes.length;

  let filteredCounter = 0;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i] as NoteEvent;

    // Pitch range check against current (possibly mutated) pitch
    if (
      pitchRange != null &&
      (note.pitch < pitchRange.startPitch || note.pitch > pitchRange.endPitch)
    ) {
      continue;
    }

    const noteContext = buildNoteContext(
      note,
      timeSigNumerator,
      timeSigDenominator,
      clipTimeRange,
    );

    // Time range check
    const activeTimeRange = calculateActiveTimeRange(
      assignment,
      noteContext.bar,
      noteContext.beat,
      timeSigNumerator,
      timeSigDenominator,
      clipTimeRange,
      noteContext.position,
    );

    // Note matches pitch range — count it regardless of time range
    const noteIndex = pitchRange != null ? filteredCounter : i;

    filteredCounter++;

    if (activeTimeRange.skip) {
      continue; // Pitch matched but time didn't — counted for index, not applied
    }

    const noteProperties = buildNoteProperties(
      note,
      noteIndex,
      filteredCount,
      timeSigDenominator,
      clipContext,
    );

    try {
      const value = evaluateExpression(
        assignment.expression,
        noteContext.position,
        timeSigNumerator,
        timeSigDenominator,
        activeTimeRange.timeRange,
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
 * Build note context object
 * @param note - Note event
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipTimeRange - Clip time range
 * @returns Note context for transform evaluation
 */
function buildNoteContext(
  note: NoteEvent,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipTimeRange: TimeRange,
): NoteContext {
  // Convert note's Ableton beats start_time to musical beats position
  const musicalBeats = note.start_time * (timeSigDenominator / 4);

  // Parse bar|beat position for time range filtering
  const barBeatStr = abletonBeatsToBarBeat(
    note.start_time,
    timeSigNumerator,
    timeSigDenominator,
  );
  const barBeatMatch = barBeatStr.match(/^(\d+)\|(\d+(?:\.\d+)?)$/);
  const bar = barBeatMatch
    ? Number.parseInt(barBeatMatch[1] as string)
    : undefined;
  const beat = barBeatMatch
    ? Number.parseFloat(barBeatMatch[2] as string)
    : undefined;

  return {
    position: musicalBeats,
    pitch: note.pitch,
    bar,
    beat,
    timeSig: {
      numerator: timeSigNumerator,
      denominator: timeSigDenominator,
    },
    clipTimeRange,
  };
}

/**
 * Build note properties object including note and clip context
 * @param note - Note event
 * @param noteIndex - 0-based note order in clip
 * @param noteCount - Total number of notes in the clip
 * @param timeSigDenominator - Time signature denominator
 * @param clipContext - Optional clip-level context
 * @returns Properties for variable access (note.*, clip.*)
 */
function buildNoteProperties(
  note: NoteEvent,
  noteIndex: number,
  noteCount: number,
  timeSigDenominator: number,
  clipContext?: ClipContext,
): NoteProperties {
  const props: NoteProperties = {
    pitch: note.pitch,
    start: note.start_time * (timeSigDenominator / 4), // Convert to musical beats
    velocity: note.velocity,
    deviation: note.velocity_deviation ?? 0,
    duration: note.duration * (timeSigDenominator / 4), // Convert to musical beats
    probability: note.probability,
    index: noteIndex,
    count: noteCount,
  };

  if (clipContext) {
    props["clip:duration"] = clipContext.clipDuration;
    props["clip:index"] = clipContext.clipIndex;
    props["clip:count"] = clipContext.clipCount;

    if (clipContext.arrangementStart != null) {
      props["clip:position"] = clipContext.arrangementStart;
    }

    props["clip:barDuration"] = clipContext.barDuration;

    if (clipContext.scalePitchClassMask != null) {
      props["scale:mask"] = clipContext.scalePitchClassMask;
    }
  }

  return props;
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

  const ast = tryParseTransform(transformString);

  return evaluateTransformAST(ast, noteContext, noteProperties);
}

/**
 * Parse a transform string, returning the AST. Throws on parse errors.
 * @param transformString - Transform expression string
 * @returns Parsed AST
 * @throws Error with formatted message if parsing fails
 */
function tryParseTransform(
  transformString: string,
): ReturnType<typeof parseTransform> {
  try {
    return parseTransform(transformString);
  } catch (error) {
    if (error instanceof Error && error.name === "SyntaxError") {
      throw new Error(
        formatParserError(error as PeggySyntaxError, "transform"),
      );
    }

    throw error;
  }
}
