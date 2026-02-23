// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { formatParserError } from "#src/notation/peggy-error-formatter.ts";
import { type PeggySyntaxError } from "#src/notation/peggy-parser-types.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { type NoteEvent } from "../types.ts";
import * as parser from "./parser/transform-parser.ts";
import {
  type ClipContext,
  evaluateTransformAST,
  type NoteContext,
  type NoteProperties,
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

  // Track which notes had at least one MIDI transform applied
  const transformedIndices = new Set<number>();

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i] as NoteEvent;
    const noteContext = buildNoteContext(
      note,
      timeSigNumerator,
      timeSigDenominator,
      clipStartTime,
      clipEndTime,
    );

    const noteProperties = buildNoteProperties(
      note,
      i,
      notes.length,
      timeSigDenominator,
      clipContext,
    );

    // Evaluate transforms for this note using the pre-parsed AST
    const transforms = evaluateTransformAST(ast, noteContext, noteProperties);

    // Track notes where any non-audio transform matched
    const hasMidiTransform = Object.keys(transforms).some(
      (k) => !AUDIO_PARAMETERS.has(k),
    );

    if (hasMidiTransform) {
      transformedIndices.add(i);
    }

    // Apply transforms with operator semantics and range clamping
    applyVelocityTransform(note, transforms);
    applyTimingTransform(note, transforms, timeSigDenominator);
    applyDurationTransform(note, transforms, timeSigDenominator);
    applyProbabilityTransform(note, transforms);
    applyDeviationTransform(note, transforms);
    applyPitchTransform(note, transforms);
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
 * Build note context object
 * @param note - Note event
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipStartTime - Clip start time
 * @param clipEndTime - Clip end time
 * @returns Note context for transform evaluation
 */
function buildNoteContext(
  note: NoteEvent,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipStartTime: number,
  clipEndTime: number,
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
    clipTimeRange: {
      start: clipStartTime,
      end: clipEndTime,
    },
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
 * Apply velocity transform to a note
 * @param note - Note to modify
 * @param transforms - Transform results
 */
function applyVelocityTransform(
  note: NoteEvent,
  transforms: Record<string, TransformResult>,
): void {
  if (transforms.velocity == null) {
    return;
  }

  note.velocity =
    transforms.velocity.operator === "set"
      ? Math.min(127, transforms.velocity.value)
      : Math.min(127, note.velocity + transforms.velocity.value);
}

/**
 * Apply timing transform to a note
 * Transform values are in musical beats; convert to Ableton beats for storage
 * @param note - Note to modify
 * @param transforms - Transform results
 * @param timeSigDenominator - Time signature denominator for beat conversion
 */
function applyTimingTransform(
  note: NoteEvent,
  transforms: Record<string, TransformResult>,
  timeSigDenominator: number,
): void {
  if (transforms.timing == null) {
    return;
  }

  // Convert from musical beats (expression result) to Ableton beats (storage)
  const musicalBeatsValue = transforms.timing.value;
  const abletonBeatsValue = musicalBeatsValue * (4 / timeSigDenominator);

  if (transforms.timing.operator === "set") {
    note.start_time = abletonBeatsValue;
  } else {
    // operator === "add"
    note.start_time += abletonBeatsValue;
  }
}

/**
 * Apply duration transform to a note
 * Transform values are in musical beats; convert to Ableton beats for storage
 * @param note - Note to modify
 * @param transforms - Transform results
 * @param timeSigDenominator - Time signature denominator for beat conversion
 */
function applyDurationTransform(
  note: NoteEvent,
  transforms: Record<string, TransformResult>,
  timeSigDenominator: number,
): void {
  if (transforms.duration == null) {
    return;
  }

  // Convert from musical beats (expression result) to Ableton beats (storage)
  const musicalBeatsValue = transforms.duration.value;
  const abletonBeatsValue = musicalBeatsValue * (4 / timeSigDenominator);

  note.duration =
    transforms.duration.operator === "set"
      ? abletonBeatsValue
      : note.duration + abletonBeatsValue;
}

/**
 * Apply probability transform to a note
 * @param note - Note to modify
 * @param transforms - Transform results
 */
function applyProbabilityTransform(
  note: NoteEvent,
  transforms: Record<string, TransformResult>,
): void {
  if (transforms.probability == null) {
    return;
  }

  if (transforms.probability.operator === "set") {
    note.probability = Math.max(
      0.0,
      Math.min(1.0, transforms.probability.value),
    );
  } else {
    // operator === "add"
    note.probability = Math.max(
      0.0,
      Math.min(1.0, (note.probability ?? 1.0) + transforms.probability.value),
    );
  }
}

/**
 * Apply deviation transform to a note
 * @param note - Note to modify
 * @param transforms - Transform results
 */
function applyDeviationTransform(
  note: NoteEvent,
  transforms: Record<string, TransformResult>,
): void {
  if (transforms.deviation == null) {
    return;
  }

  if (transforms.deviation.operator === "set") {
    note.velocity_deviation = Math.max(
      -127,
      Math.min(127, transforms.deviation.value),
    );
  } else {
    // operator === "add"
    note.velocity_deviation = Math.max(
      -127,
      Math.min(
        127,
        (note.velocity_deviation ?? 0) + transforms.deviation.value,
      ),
    );
  }
}

/**
 * Apply pitch transform to a note
 * @param note - Note to modify
 * @param transforms - Transform results
 */
function applyPitchTransform(
  note: NoteEvent,
  transforms: Record<string, TransformResult>,
): void {
  if (transforms.pitch == null) {
    return;
  }

  const newPitch =
    transforms.pitch.operator === "set"
      ? transforms.pitch.value
      : note.pitch + transforms.pitch.value;

  // Round to integer (MIDI pitch must be integer) then clamp to 0-127
  note.pitch = Math.max(0, Math.min(127, Math.round(newPitch)));
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
): ReturnType<typeof parser.parse> {
  try {
    return parser.parse(transformString);
  } catch (error) {
    if (error instanceof Error && error.name === "SyntaxError") {
      throw new Error(
        formatParserError(error as PeggySyntaxError, "transform"),
      );
    }

    throw error;
  }
}
